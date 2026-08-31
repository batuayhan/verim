import type { OntologyResponse } from '../../contract/mercek';
import {
  mergeExtension,
  ontologyExtensionSchema,
  type OntologyExtension,
} from '../../contract/ontology-ext';
import type { SchemaIntrospector } from '../schema-introspector';
import type { IObjectSetEngine } from '../object-set-engine';
import { type Bulgu, sonuc, type KademeSonuc } from './types';

// --- Kademe 1: Sözdizimi (zod) ----------------------------------------------

/** Ham girdiyi doğrular; başarılıysa tiplenmiş uzantıyı da döndürür. */
export function kademe1Sozdizimi(ham: unknown): {
  sonuc: KademeSonuc;
  ext?: OntologyExtension;
} {
  const r = ontologyExtensionSchema.safeParse(ham);
  if (r.success) return { sonuc: sonuc(1, []), ext: r.data };
  const bulgular: Bulgu[] = r.error.issues.map((i) => ({
    kademe: 1,
    kod: 'SEMA_HATA',
    mesaj: i.message,
    konum: i.path.join('.') || undefined,
  }));
  return { sonuc: sonuc(1, bulgular) };
}

// --- Kademe 2: Bağlama bütünlüğü --------------------------------------------

/**
 * Uzantının çekirdeğe temiz eklendiğini (çakışma yok) VE her tipin bağlandığı
 * dataset'in gerçekten var olduğunu, özellik/anahtar kolonlarının o kaynakta
 * bulunduğunu doğrular. Tip uyumsuzluğu UYARI değil HATA (sessiz yanlış sorgu
 * üretmesin).
 */
export async function kademe2Baglama(
  ext: OntologyExtension,
  kernel: OntologyResponse,
  introspector: SchemaIntrospector,
): Promise<KademeSonuc> {
  const bulgular: Bulgu[] = [];

  // 2a. çekirdek koruması + genel bütünlük (mergeExtension'ın kuralları)
  try {
    mergeExtension(kernel, ext);
  } catch (e) {
    bulgular.push({ kademe: 2, kod: 'BIRLESTIRME', mesaj: (e as Error).message });
    return sonuc(2, bulgular); // temel bütünlük yoksa kolon denetimi anlamsız
  }

  // 2b. her tipin dataset'i + kolonları gerçek mi
  const kolonCache = new Map<string, Map<string, string> | null>();
  const kolonlariAl = async (datasetId: string) => {
    if (!kolonCache.has(datasetId)) {
      const cols = await introspector.columns(datasetId);
      kolonCache.set(datasetId, cols ? new Map(cols.map((c) => [c.name, c.type])) : null);
    }
    return kolonCache.get(datasetId)!;
  };

  for (const t of ext.objectTypes) {
    const kolonlar = await kolonlariAl(t.datasetId);
    if (!kolonlar) {
      bulgular.push({
        kademe: 2, kod: 'DATASET_YOK',
        mesaj: `'${t.apiName}' tipi olmayan bir dataset'e bağlı: '${t.datasetId}'`,
        konum: `tip:${t.apiName}`,
      });
      continue;
    }
    for (const p of t.properties) {
      const gercekTip = kolonlar.get(p.apiName);
      if (gercekTip === undefined) {
        bulgular.push({
          kademe: 2, kod: 'KOLON_YOK',
          mesaj: `'${t.datasetId}' kaynağında '${p.apiName}' kolonu yok`,
          konum: `tip:${t.apiName}.${p.apiName}`,
        });
      } else if (gercekTip !== p.type) {
        bulgular.push({
          kademe: 2, kod: 'TIP_UYUMSUZ',
          mesaj: `'${p.apiName}' bildirilen tip '${p.type}' ama kaynakta '${gercekTip}'`,
          konum: `tip:${t.apiName}.${p.apiName}`,
        });
      }
    }
    if (!kolonlar.has(t.primaryKey)) {
      bulgular.push({
        kademe: 2, kod: 'PK_YOK',
        mesaj: `primaryKey '${t.primaryKey}' kaynakta yok`,
        konum: `tip:${t.apiName}`,
      });
    }
  }

  // 2c. linklerin fromKey/toKey'i iki uçta da mevcut mu
  const birlesik = mergeExtension(kernel, ext); // güvenli (2a geçti)
  const tipDataset = new Map(birlesik.objectTypes.map((t) => [t.apiName, t.datasetId]));
  for (const l of ext.linkTypes) {
    const fromDs = tipDataset.get(l.fromObjectType);
    const toDs = tipDataset.get(l.toObjectType);
    if (fromDs) {
      const cols = await kolonlariAl(fromDs);
      if (cols && !cols.has(l.fromKey)) {
        bulgular.push({
          kademe: 2, kod: 'LINK_FROMKEY_YOK',
          mesaj: `link '${l.apiName}' fromKey '${l.fromKey}' → '${l.fromObjectType}' kaynağında yok`,
          konum: `link:${l.apiName}`,
        });
      }
    }
    if (toDs) {
      const cols = await kolonlariAl(toDs);
      if (cols && !cols.has(l.toKey)) {
        bulgular.push({
          kademe: 2, kod: 'LINK_TOKEY_YOK',
          mesaj: `link '${l.apiName}' toKey '${l.toKey}' → '${l.toObjectType}' kaynağında yok`,
          konum: `link:${l.apiName}`,
        });
      }
    }
  }

  return sonuc(2, bulgular);
}

// --- Kademe 3: Davranış smoke -----------------------------------------------

/**
 * Aday ontolojiyle (kernel ⊕ ext) GEÇİCİ bir motor kurulur ve her YENİ tip
 * için load(limit:1)+aggregate(count), her YENİ link için searchAround(limit:1)
 * GERÇEK motorda koşturulur — aktifleşmeden önce. Fikstürler uzantının
 * kendisinden türer (elle yazılmaz). Yalnız SELECT üretilir (salt-okunur).
 * Bir sorgu patlarsa uzantı "geçerli görünüyor ama çalışmıyor" demektir.
 */
export async function kademe3Davranis(
  ext: OntologyExtension,
  smokeEngine: IObjectSetEngine,
): Promise<KademeSonuc> {
  const bulgular: Bulgu[] = [];

  for (const t of ext.objectTypes) {
    try {
      await smokeEngine.load({
        def: { type: 'base', objectType: t.apiName },
        parameters: {},
        limit: 1,
      });
      await smokeEngine.aggregate({
        def: { type: 'base', objectType: t.apiName },
        parameters: {},
        metric: { fn: 'count' },
      });
    } catch (e) {
      bulgular.push({
        kademe: 3, kod: 'SMOKE_TIP',
        mesaj: `'${t.apiName}' tipi sorgulanamadı: ${(e as Error).message}`,
        konum: `tip:${t.apiName}`,
      });
    }
  }

  for (const l of ext.linkTypes) {
    try {
      await smokeEngine.load({
        def: {
          type: 'searchAround',
          base: { type: 'base', objectType: l.fromObjectType },
          linkType: l.apiName,
        },
        parameters: {},
        limit: 1,
      });
    } catch (e) {
      bulgular.push({
        kademe: 3, kod: 'SMOKE_LINK',
        mesaj: `link '${l.apiName}' gezilemedi: ${(e as Error).message}`,
        konum: `link:${l.apiName}`,
      });
    }
  }

  return sonuc(3, bulgular);
}
