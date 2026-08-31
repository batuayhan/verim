import { z } from 'zod';
import { boardConfigSchema } from '../contract/zod';
import { gadgetConfigSchema } from '../dashboards/dashboard-schema';
import {
  aggregateRequestSchema,
  loadRequestSchema,
  objectSetDefSchema,
  timeseriesRequestSchema,
} from '../ontology/ontology.controller';

/**
 * Asistan araçlarının GİRDİ ŞEMALARI — tek doğruluk kaynağı.
 * LLM'e gösterilen JSON Schema da, çalışma zamanı doğrulaması da AYNI
 * zod şemasından gelir; API contract'ı (objectSetDefSchema,
 * boardConfigSchema) değişince araçlar kendiliğinden onu izler.
 */

export const metricInputSchema = z.object({
  fn: z.enum(['count', 'sum', 'avg', 'min', 'max', 'countDistinct']),
  property: z.string().optional(),
});

/**
 * Sorgu araçları API istek şemalarından TÜRETİLİR (.omit(parameters) —
 * asistan parametre bağlamı kullanmaz). API'ye yeni alan (örn. segmentBy)
 * eklendiğinde araç şeması otomatik izler; "araç şeması yeteneğin gerisinde
 * kaldı" sınıfı sapma yapısal olarak kapanır.
 */
export const nesneYukleInput = loadRequestSchema.omit({ parameters: true });
export const nesneGruplaInput = aggregateRequestSchema.omit({ parameters: true });
export const zamanSerisiInput = timeseriesRequestSchema.omit({ parameters: true });

export const mercekAnalizInput = z.object({
  isim: z.string().min(1).max(120),
  kumeler: z
    .array(z.object({ ad: z.string().optional(), def: objectSetDefSchema }))
    .min(1)
    .max(6),
  // Tip-ayrımlı KATI şema: bar grafiğe granularity yazılamaz, zaman serisi
  // dateProperty'siz olamaz — anlamsız kombinasyonlar şemada reddedilir
  gorseller: z
    .array(
      z.discriminatedUnion('tip', [
        z
          .object({
            tip: z.literal('grafik'),
            kume: z.number().int().min(0),
            baslik: z.string().optional(),
            groupBy: z.string().min(1),
            segmentBy: z.string().optional(),
            metricFn: metricInputSchema.shape.fn,
            metricProperty: z.string().optional(),
            grafikTuru: z.enum(['bar', 'pie']).optional(),
          })
          .strict(),
        z
          .object({
            tip: z.literal('metrik'),
            kume: z.number().int().min(0),
            baslik: z.string().optional(),
            metricFn: metricInputSchema.shape.fn,
            metricProperty: z.string().optional(),
          })
          .strict(),
        z
          .object({
            tip: z.literal('zaman'),
            kume: z.number().int().min(0),
            baslik: z.string().optional(),
            dateProperty: z.string().min(1),
            granularity: z.enum(['hour', 'day', 'week', 'month']),
            metricFn: metricInputSchema.shape.fn,
            metricProperty: z.string().optional(),
          })
          .strict(),
      ]),
    )
    .max(8)
    .optional(),
  dashboard: z.boolean().optional(),
});

export const harmanAnalizInput = z.object({
  isim: z.string().min(1).max(120),
  datasetId: z.string().min(1),
  boards: z.array(boardConfigSchema).min(1).max(12),
  dashboard: z.boolean().optional(),
});

/** Birleşik dashboard: gadget'lar API sözleşmesindeki gadgetConfigSchema'nın
    KENDİSİDİR (yerleşimsiz; sunucu autoLayout uygular) — paralel şema yok */
export const dashboardOlusturInput = z.object({
  isim: z.string().min(1).max(120),
  gadgets: z.array(gadgetConfigSchema).min(1).max(20),
});

export const alarmKuraliInput = z.object({
  isim: z.string().min(1).max(120),
  def: objectSetDefSchema,
  windowMin: z.number().int().positive().max(24 * 60).optional(),
  operator: z.enum(['gt', 'gte', 'lt', 'lte']),
  threshold: z.number(),
  cooldownSec: z.number().int().min(10).max(24 * 3600).optional(),
});

/** Bağlantı analizi grafiğini bir nesneye odaklı açan aksiyon */
export const grafAcInput = z.object({
  objectType: z.string().min(1),
  pk: z.string().min(1),
});

/** Bir nesneyi TÜM ilişkileriyle inceleyip özet döndürür ("bunu açıkla") */
export const nesneInceleInput = z.object({
  objectType: z.string().min(1),
  pk: z.string().min(1),
});

export const haritayaGitInput = z.object({
  siniflandirmalar: z
    .array(z.enum(['Dost', 'Düşman', 'Şüpheli', 'Bilinmeyen']))
    .optional(),
  // Harita yalnız bu pencere değerlerini destekler (kapalı liste — LLM yasal değere yuvarlar)
  pencereDk: z
    .union([z.literal(5), z.literal(15), z.literal(30), z.literal(60), z.literal(180)])
    .optional(),
  // Cevap belirli bir KONUMA işaret ediyorsa harita oraya odaklanır
  merkez: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      zoom: z.number().min(2).max(18).optional(),
      etiket: z.string().max(80).optional(),
    })
    .optional(),
  // Katman kontrolü — "iz izlerini göster", "istihbarat katmanını aç" vb.
  katmanlar: z
    .object({
      izIzleri: z.boolean().optional(), // hareket yolları (trail)
      istihbarat: z.boolean().optional(), // multi-INT rapor katmanı
      menzil: z.boolean().optional(), // sensör menzil halkaları
      senkron: z.boolean().optional(), // Sync Matrix planı: görev/rota + mini matris
    })
    .optional(),
  gosterim: z.enum(['nokta', 'isi']).optional(), // nokta vs ısı haritası
});

// Sync Matrix (harekât senkronizasyonu) doğal-dil düzenleme — AIP plan orkestrasyonu.
export const senkronDuzenleInput = z.object({
  islem: z.enum([
    'oku', // planı oku (görev id/ad/zaman/durum listesi) — ÖNCE bunu çağır, id öğren
    'topluKaydir', // tüm/domain görevleri delta dk kaydır ("15 dk geri çek" → deltaDk:-15)
    'gorevKaydir', // tek görevi mutlak zamana al (gorevId|gorevAd + baslangicDk); bağlılar zincirlenir
    'gorevDurum', // görev durumu/onay (gorevId|gorevAd + durum)
    'gorevEkle', // yeni görev (ad + sureDk + tur? + domain?)
    'gorevGuncelle', // görevi düzenle (gorevId|gorevAd + yeniAd?/sureDk?/baslangicDk?/tur?/varlikAd?)
    'gorevSil', // görev sil (gorevId|gorevAd)
    'bagimlilikEkle', // ön koşul kur (oncekiId|oncekiAd + sonrakiId|sonrakiAd + bagTur? + gecikmeDk?)
    'bagimlilikSil', // ön koşul kaldır (oncekiId|oncekiAd + sonrakiId|sonrakiAd)
    'hSaatiAyarla', // harekât H-saatini (başlangıç zamanı) ayarla (hSaatiISO)
    'senaryoTuret', // what-if senaryo dalı (ad?)
    'terfi', // senaryoyu canlı plana terfi (planId = senaryo id)
    'sensorToShooter', // tehdit izinden angajman görevi (izNo)
  ]),
  planId: z.string().max(80).optional(), // varsayılan "canli"
  deltaDk: z.number().int().min(-1440).max(1440).optional(),
  domain: z.string().max(40).optional(),
  gorevId: z.string().max(60).optional(),
  gorevAd: z.string().max(160).optional(), // gorevId yoksa ad'dan çözülür (isim eşleme)
  baslangicDk: z.number().int().min(-720).max(10080).optional(),
  durum: z.enum(['planli', 'onayli', 'icrada', 'tamam', 'gecikme', 'iptal']).optional(),
  ad: z.string().max(160).optional(),
  yeniAd: z.string().max(160).optional(), // gorevGuncelle: yeni görev adı
  sureDk: z.number().int().min(0).max(10080).optional(),
  tur: z.string().max(40).optional(),
  varlikAd: z.string().max(120).optional(), // gorevGuncelle: varlık ata (adıyla)
  izNo: z.string().max(60).optional(),
  oncekiId: z.string().max(60).optional(),
  oncekiAd: z.string().max(160).optional(),
  sonrakiId: z.string().max(60).optional(),
  sonrakiAd: z.string().max(160).optional(),
  bagTur: z.enum(['FS', 'SS']).optional(), // FS: bitince başla · SS: birlikte başla
  gecikmeDk: z.number().int().min(-1440).max(1440).optional(), // bağımlılık gecikmesi (lag)
  hSaatiISO: z.string().max(40).optional(), // hSaatiAyarla: ISO tarih ("2026-07-24T04:00:00Z")
  // TAKTİK görev kartı alanları (gorevEkle/gorevGuncelle): ATO/OPORD karşılıkları
  cagriAdi: z.string().max(40).optional(), // çağrı adı (callsign)
  oncelik: z.number().int().min(1).max(5).optional(), // P1 (en yüksek) .. P5
  istenenEtki: z
    .enum(['imha', 'etkisizlestirme', 'baskilama', 'tespit', 'koruma', 'aldatma'])
    .optional(), // desired effect
  enlem: z.number().min(-90).max(90).optional(), // görev icra konumu (konum)
  boylam: z.number().min(-180).max(180).optional(),
  hedefEnlem: z.number().min(-90).max(90).optional(), // sabit hedef koordinatı (DMPI)
  hedefBoylam: z.number().min(-180).max(180).optional(),
  bolgeYaricapKm: z.number().positive().max(500).optional(), // görev bölgesi çemberi
  kontrolMakami: z.string().max(60).optional(), // C2 ajansı (AWACS/CRC/JTAC…)
  frekans: z.string().max(30).optional(),
  muhimmat: z.string().max(160).optional(), // silah/faydalı yük
});

/**
 * zod → JSON Schema (LLM'e gösterilecek biçim). Recursive şemalar $defs
 * ile çıkar; üretilemezse serbest nesneye düşülür — çalışma zamanı zod
 * doğrulaması her durumda devrededir, drift testi üretimi ayrıca korur.
 */
/**
 * Üretilen JSON şemadaki serbest metin alanlarına ÇALIŞMA ZAMANI enum'ları
 * enjekte eder: objectType/linkType ontolojiden, datasetId dataset listesinden.
 * LLM bu alanlarda halüsinasyon YAPAMAZ — kapalı listeden seçmek zorundadır.
 * ("objectType: 'izler'" sınıfı hataların şema-seviyesinde erken tespiti.)
 */
export function injectRuntimeEnums(
  schema: Record<string, unknown>,
  enums: { objectTypes: string[]; linkTypes: string[]; datasetIds: string[] },
): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const obj = node as Record<string, unknown>;
    const props = obj.properties as Record<string, Record<string, unknown>> | undefined;
    if (props) {
      if (props.objectType?.type === 'string') props.objectType.enum = enums.objectTypes;
      if (props.linkType?.type === 'string') props.linkType.enum = enums.linkTypes;
      if (props.datasetId?.type === 'string') props.datasetId.enum = enums.datasetIds;
    }
    Object.values(obj).forEach(walk);
  };
  walk(clone);
  return clone;
}

export function toToolJsonSchema(schema: z.ZodType): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }) as Record<
      string,
      unknown
    >;
  } catch {
    return { type: 'object' };
  }
}
