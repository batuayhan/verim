import type { OntologyExtension } from '../../contract/ontology-ext';
import { type Bulgu, sonuc, type KademeSonuc } from './types';

/**
 * Kademe 4 — Etki analizi (diff). Bugünkü DERLEYİCİNİN YAPAMADIĞI kontrol:
 * bir tip/link silmek kod olarak derlenir ama o tipe/linke referans veren
 * KAYITLI analiz/alarm/dashboard'ı sessizce kırar. Burada aday sürüm, aktif
 * sürümle karşılaştırılır; silinen/yeniden-adlandırılan bir öğeye referans
 * varsa yükleme REDDEDİLİR (etkilenen artefakt listesiyle).
 */

export interface Artefakt {
  id: string;
  ad: string;
  tur: 'mercek' | 'harman' | 'alarm' | 'dashboard';
  belge: unknown; // opak JSON — derin taranır
}

export interface EtkilenenArtefakt {
  silinen: string; // silinen tip/link apiName'i
  artefakt: string;
  tur: string;
  id: string;
}

/**
 * Bir belgede geçen tüm string değerleri topla (derin). Kademe-4 etki
 * analizi ve canlı dataset silme koruması aynı yardımcıyı paylaşır.
 */
export function stringDegerler(x: unknown, out: Set<string>): void {
  if (typeof x === 'string') out.add(x);
  else if (Array.isArray(x)) for (const e of x) stringDegerler(e, out);
  else if (x && typeof x === 'object') for (const v of Object.values(x)) stringDegerler(v, out);
}

/**
 * @param aday    yeni aday uzantı (bazı tip/linkleri düşürmüş olabilir)
 * @param aktif   şu an aktif uzantı (yoksa undefined → hiçbir şey silinmiyor)
 * @param artefaktlar tüm kayıtlı Mercek/Harman/alarm/dashboard belgeleri
 */
export function kademe4Etki(
  aday: OntologyExtension,
  aktif: OntologyExtension | undefined,
  artefaktlar: Artefakt[],
): { sonuc: KademeSonuc; etkilenen: EtkilenenArtefakt[] } {
  if (!aktif) return { sonuc: sonuc(4, []), etkilenen: [] }; // ilk sürüm — silme yok

  const adayTipler = new Set(aday.objectTypes.map((t) => t.apiName));
  const adayLinkler = new Set(aday.linkTypes.map((l) => l.apiName));
  const silinen = [
    ...aktif.objectTypes.filter((t) => !adayTipler.has(t.apiName)).map((t) => t.apiName),
    ...aktif.linkTypes.filter((l) => !adayLinkler.has(l.apiName)).map((l) => l.apiName),
  ];
  if (silinen.length === 0) return { sonuc: sonuc(4, []), etkilenen: [] };

  const silinenSet = new Set(silinen);
  const etkilenen: EtkilenenArtefakt[] = [];
  for (const a of artefaktlar) {
    const degerler = new Set<string>();
    stringDegerler(a.belge, degerler);
    for (const s of silinenSet) {
      if (degerler.has(s)) etkilenen.push({ silinen: s, artefakt: a.ad, tur: a.tur, id: a.id });
    }
  }

  const bulgular: Bulgu[] = [];
  if (etkilenen.length > 0) {
    const ozet = etkilenen
      .slice(0, 8)
      .map((e) => `'${e.silinen}' ← ${e.tur}:${e.artefakt}`)
      .join('; ');
    bulgular.push({
      kademe: 4,
      kod: 'REFERANSLI_SILME',
      mesaj:
        `Silinen ${silinen.length} öğeye ${etkilenen.length} kayıtlı artefakt referans veriyor` +
        ` (${ozet}${etkilenen.length > 8 ? '…' : ''}). Önce bu artefaktları güncelleyin/silin.`,
    });
  }
  return { sonuc: sonuc(4, bulgular), etkilenen };
}
