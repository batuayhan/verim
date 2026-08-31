/**
 * Ingest sözleşmesi — kaynak mesajını ORTAK gözlem/istihbarat şekline
 * DOĞRULAYARAK normalize eder. "Derlenmez→yüklenmez" felsefesinin akış
 * karşılığı: yapısal/fiziksel olarak bozuk mesaj DB'ye yazılmaz, karantinaya düşer.
 *
 * TASARIM İLKESİ — ontolojiyi koda GÖMME:
 *   Burada YALNIZCA evrensel/fiziksel değişmezler doğrulanır: alan varlığı,
 *   tip, sonluluk, koordinat sınırları (−90..90 / −180..180), ISO zaman, boş
 *   olmayan kimlik, negatif olmayan büyüklükler, açı 0..360, yüzde 0..100.
 *
 *   Enum/DEĞER KÜMELERİ (domain=Hava/Deniz/Kara, hostility=FR/HO/…, disiplin,
 *   öncelik, güvenilirlik, tehdit seviyesi) ONTOLOJİ'ye aittir ve BURADA
 *   DAYATILMAZ — ontoloji zamanla değişir (yeni domain, yeni disiplin). Bu
 *   değerler string/sayı olarak doğrulanıp akar; ne oldukları ontoloji
 *   katmanının (view/motor/contract) işidir. Böylece ingest ontolojiden bağımsız
 *   kalır; ontoloji değişince bu dosyaya dokunmak gerekmez.
 *
 * Saf fonksiyonlar, DB'siz — birim-test edilebilir (bkz. normalize.spec.ts).
 */

import { z } from 'zod';
import type { IntelMessage } from './intel-feed';
import type { Observation } from './track-fleet';

/** ISO zaman: ayrıştırılabilir olmalı (NaN tarih reddedilir) — yapısal kural */
const isoZaman = z
  .string()
  .refine((s) => Number.isFinite(Date.parse(s)), { message: 'geçersiz zaman damgası' });

// Koordinat DÜNYA sınırları — evrensel coğrafya, ontoloji değil.
// finite() ZORUNLU: MIP4-IES XML'inde eksik alan Number()→NaN olur, reddedilir.
const enlem = z.number().finite().min(-90).max(90);
const boylam = z.number().finite().min(-180).max(180);

/**
 * verim.gozlemler (JSON) ve verim.mip4ies (XML→normalize) ortak gözlem şeması.
 * Enum alanları (domain, hostilityCode) SERBEST string — değer kümesi ontolojinin.
 */
export const gozlemSemasi = z.object({
  izNo: z.string().min(1),
  sensorNo: z.string().min(1),
  zaman: isoZaman,
  domain: z.string().min(1), // ontoloji: domain değerleri burada dayatılmaz
  hostilityCode: z.string().min(1), // ontoloji: düşmanlık kod kümesi burada dayatılmaz
  tehdit: z.number().finite().int().min(0), // seviye ölçeği ontolojinin; burada yalnız ≥0
  enlem,
  boylam,
  irtifaFt: z.number().finite().min(0), // negatif irtifa fiziksel olarak geçersiz
  suratKnot: z.number().finite().min(0),
  rotaDerece: z.number().finite().min(0).max(360), // açı evrensel: 0..360
});

/** verim.istihbarat (JSON) — disiplin/öncelik/güvenilirlik SERBEST (ontoloji) */
export const istihbaratSemasi = z.object({
  raporNo: z.string().min(1),
  tur: z.string().min(1),
  baslik: z.string().min(1),
  ozet: z.string().min(1),
  kaynak: z.string().min(1),
  kaynakGuvenilirligi: z.string().min(1),
  bilgiDogrulugu: z.number().finite().int(),
  oncelik: z.string().min(1),
  tehditTipi: z.string(),
  guvenYuzde: z.number().finite().int().min(0).max(100).nullable(), // yüzde evrensel: 0..100
  ilgiliIzNo: z.string().min(1).nullable(),
  enlem: enlem.nullable(),
  boylam: boylam.nullable(),
  zaman: isoZaman,
});

/** Normalize sonucu: ya geçerli değer ya da karantina sebebi (asla sessiz kayıp) */
export type NormSonuc<T> = { ok: true; deger: T } | { ok: false; sebep: string };

function ilkHata(e: z.ZodError): string {
  const i = e.issues[0];
  const yol = i.path.join('.') || '(kök)';
  return `${yol}: ${i.message}`;
}

/** Ham gözlemi doğrula + geo bölge etiketi ekle; başarısızsa sebep döner */
export function gozlemNormalize(ham: unknown): NormSonuc<Observation> {
  const r = gozlemSemasi.safeParse(ham);
  if (!r.success) return { ok: false, sebep: ilkHata(r.error) };
  return { ok: true, deger: { ...r.data, bolge: geohash(r.data.enlem, r.data.boylam) } };
}

/** Ham istihbarat raporunu doğrula; başarısızsa sebep döner */
export function istihbaratNormalize(ham: unknown): NormSonuc<IntelMessage> {
  const r = istihbaratSemasi.safeParse(ham);
  if (!r.success) return { ok: false, sebep: ilkHata(r.error) };
  return { ok: true, deger: r.data as IntelMessage };
}

// --- geo-referanslama: kaba bölge etiketi (geohash) --------------------------
// PostGIS'siz, hızlı alan/AOI gruplaması için WGS84 lat/lon → geohash. 5 karakter
// ≈ 5 km hücre; observability'de "bölge kırılımı" ve ileride AOI önfiltresi için.
// Bu ontoloji değil — coğrafi indeksleme yardımcısı.

const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** WGS84 enlem/boylam → geohash (varsayılan 5 karakter ≈ 5 km) */
export function geohash(enlem: number, boylam: number, uzunluk = 5): string {
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let boylamSirasi = true;
  while (hash.length < uzunluk) {
    if (boylamSirasi) {
      const mid = (lonMin + lonMax) / 2;
      if (boylam >= mid) {
        ch = (ch << 1) | 1;
        lonMin = mid;
      } else {
        ch <<= 1;
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (enlem >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch <<= 1;
        latMax = mid;
      }
    }
    boylamSirasi = !boylamSirasi;
    if (++bit === 5) {
      hash += B32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}
