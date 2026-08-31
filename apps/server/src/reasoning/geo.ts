/**
 * Coğrafi yardımcılar — akıl yürütme motorlarının (skorlama, COA) ortak
 * jeodezik matematiği. PostGIS'siz, saf fonksiyonlar (birim-test edilebilir).
 * WGS84 küresel yaklaşım: demo/taktik menzillerde yeterli doğruluk.
 */

const R_KM = 6371; // Dünya yarıçapı (km)
const derece = (r: number) => (r * 180) / Math.PI;
const radyan = (d: number) => (d * Math.PI) / 180;

export interface Nokta {
  enlem: number;
  boylam: number;
}

/** İki nokta arası büyük-daire mesafesi (km) — haversine */
export function mesafeKm(a: Nokta, b: Nokta): number {
  const dLat = radyan(b.enlem - a.enlem);
  const dLon = radyan(b.boylam - a.boylam);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radyan(a.enlem)) * Math.cos(radyan(b.enlem)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** a'dan b'ye ilk kerteriz (0..360, kuzeyden saat yönü) */
export function kerteriz(a: Nokta, b: Nokta): number {
  const dLon = radyan(b.boylam - a.boylam);
  const y = Math.sin(dLon) * Math.cos(radyan(b.enlem));
  const x =
    Math.cos(radyan(a.enlem)) * Math.sin(radyan(b.enlem)) -
    Math.sin(radyan(a.enlem)) * Math.cos(radyan(b.enlem)) * Math.cos(dLon);
  return (derece(Math.atan2(y, x)) + 360) % 360;
}

/** İki kerteriz arası en küçük açı farkı (0..180) */
export function aciFarki(a: number, b: number): number {
  const d = Math.abs(((a - b + 540) % 360) - 180);
  return d;
}

/**
 * Yaklaşma göstergesi: iz rotası hedefe doğru mu? 0 (uzaklaşıyor) .. 1 (tam üzerine).
 * Kinetik tehdit için — bir iz bize DOĞRU gidiyorsa daha tehlikelidir.
 */
export function yaklasmaKatsayisi(iz: Nokta & { rotaDerece: number }, hedef: Nokta): number {
  const hedefeKerteriz = kerteriz(iz, hedef);
  const fark = aciFarki(iz.rotaDerece, hedefeKerteriz);
  return Math.max(0, 1 - fark / 90); // 90°+ sapma → yaklaşma yok
}
