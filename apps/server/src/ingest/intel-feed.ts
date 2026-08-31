/**
 * Multi-INT istihbarat raporu BESTECİSİ — tek doğruluk kaynağı.
 *
 * Aynı kompozisyon iki sürücüyle çalışır (kopya bilgi yok):
 *   • dummy üretici (generateDatasets): seed'li faker → deterministik statik set
 *   • source-intel servisi: Math.random → saniyede onlarca canlı mesaj
 *
 * Disiplinler (NATO çok-kaynaklı istihbarat):
 *   SIGINT — sinyal istihbaratı (emitter yakalama; ize korelasyonlu)
 *   IMINT  — görüntü istihbaratı (kamera/İHA insan-araç tehdit tespiti)
 *   OSINT  — açık kaynak (sosyal medya / yerel haber gönderileri)
 *   HUMINT — insan kaynağı (saha raporu)
 *
 * STANAG 2511: kaynak güvenilirliği A–F, bilgi doğruluğu 1–6 — disipline
 * göre gerçekçi dağıtılır (OSINT güvenilirliği düşük, SIGINT yüksek).
 */

export type IntelTur = 'SIGINT' | 'IMINT' | 'OSINT' | 'HUMINT';

/** Omurga mesaj şekli (verim.istihbarat topic'i) — ingest bunu normalize eder */
export interface IntelMessage {
  raporNo: string;
  tur: IntelTur;
  baslik: string;
  ozet: string;
  kaynak: string;
  kaynakGuvenilirligi: string; // A–F
  bilgiDogrulugu: number; // 1–6
  oncelik: string; // Acil | Yüksek | Rutin
  tehditTipi: string;
  guvenYuzde: number | null;
  ilgiliIzNo: string | null;
  enlem: number | null;
  boylam: number | null;
  zaman: string; // ISO
}

/** Rastgelelik sürücüsü — faker da Math.random da bu arayüze uyarlanır */
export interface Rnd {
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  weighted<T>(entries: Array<{ value: T; weight: number }>): T;
}

export const INTEL_TURLER: IntelTur[] = ['SIGINT', 'IMINT', 'OSINT', 'HUMINT'];
export const INTEL_ONCELIKLER = ['Acil', 'Yüksek', 'Rutin'] as const;

const SIGINT_EMITTERS = [
  'X-Bant Atış Kontrol Radarı',
  'Erken Uyarı Radarı',
  'VHF Muhabere Ağı',
  'Data-Link Emisyonu',
  'GPS Karıştırıcı',
  'Atlamalı Frekans Telsiz',
];
const IMINT_THREATS = [
  'Silahlı Şahıs',
  'Araç Konvoyu',
  'İHA Kalkış Hazırlığı',
  'Mevzi İnşası',
  'Topçu Mevzii',
  'Şüpheli Yığınak',
];
const OSINT_TOPICS = [
  'Askeri Hareketlilik Paylaşımı',
  'Patlama İhbarı',
  'Dezenformasyon Kampanyası',
  'Lojistik Sevkiyat Görüntüsü',
  'Sınır İhlali İddiası',
];
const HUMINT_TOPICS = [
  'Yığınak Bildirimi',
  'Komuta Yeri Değişikliği',
  'Lojistik Hattı Bilgisi',
  'Yeni Silah Sistemi İddiası',
  'Sızma Girişimi Bilgisi',
];
const OSINT_PLATFORMS = ['X (Twitter)', 'Telegram', 'Yerel Haber', 'Açık Forum'];
const IMINT_CAMERAS = [
  'EO/IR Kule Kamerası',
  'İHA Görüntü Hattı',
  'Sınır Gözetleme Kamerası',
  'Uydu Görüntüsü',
];

/** Disipline göre kaynak güvenilirliği dağılımı (STANAG 2511 A–F) */
const RELIABILITY_BY_TUR: Record<IntelTur, Array<{ value: string; weight: number }>> = {
  SIGINT: [{ value: 'A', weight: 30 }, { value: 'B', weight: 50 }, { value: 'C', weight: 20 }],
  IMINT: [{ value: 'A', weight: 20 }, { value: 'B', weight: 50 }, { value: 'C', weight: 30 }],
  HUMINT: [{ value: 'B', weight: 15 }, { value: 'C', weight: 40 }, { value: 'D', weight: 30 }, { value: 'E', weight: 15 }],
  OSINT: [{ value: 'D', weight: 25 }, { value: 'E', weight: 40 }, { value: 'F', weight: 35 }],
};

export interface IntelTrackRef {
  izNo: string;
  enlem: number;
  boylam: number;
}

/**
 * Tek rapor üret. `track` verilirse SIGINT/IMINT o ize korelasyonlu olur
 * (konum iz civarı, ilgiliIzNo dolu) — çok kaynaklı füzyonun temeli.
 */
export function buildIntel(
  rnd: Rnd,
  raporNo: string,
  zaman: string,
  track: IntelTrackRef | null,
): IntelMessage {
  const tur = rnd.weighted<IntelTur>([
    { value: 'SIGINT', weight: 35 },
    { value: 'IMINT', weight: 25 },
    { value: 'OSINT', weight: 25 },
    { value: 'HUMINT', weight: 15 },
  ]);

  const korelasyonlu = (tur === 'SIGINT' || tur === 'IMINT') && track != null;
  const yakinlik = () => (rnd.int(-20, 20) / 100) * 1; // ±0.2°
  const enlem = korelasyonlu
    ? Number((track!.enlem + yakinlik()).toFixed(4))
    : rnd.int(0, 9) < 9
      ? Number((rnd.int(340_000, 430_000) / 10_000).toFixed(4))
      : null;
  const boylam =
    enlem == null
      ? null
      : korelasyonlu
        ? Number((track!.boylam + yakinlik()).toFixed(4))
        : Number((rnd.int(250_000, 450_000) / 10_000).toFixed(4));

  const guvenilirlik = rnd.weighted(RELIABILITY_BY_TUR[tur]);
  // Güvenilir kaynak genelde daha doğrulanabilir bilgi verir (1 en doğru)
  const dogruluk = Math.min(6, Math.max(1, 'ABCDEF'.indexOf(guvenilirlik) + rnd.int(0, 2)));
  const oncelik = rnd.weighted([
    { value: 'Acil', weight: 10 },
    { value: 'Yüksek', weight: 30 },
    { value: 'Rutin', weight: 60 },
  ]);

  let baslik: string;
  let ozet: string;
  let kaynak: string;
  let tehditTipi: string;
  let guvenYuzde: number | null = null;

  switch (tur) {
    case 'SIGINT': {
      tehditTipi = rnd.pick(SIGINT_EMITTERS);
      kaynak = `ED-${rnd.int(1, 24)} Elektronik Destek Kiti`;
      baslik = `${tehditTipi} emisyonu yakalandı`;
      ozet = korelasyonlu
        ? `${track!.izNo} izi civarında ${tehditTipi} emisyonu; kerteriz doğrulandı, frekans kütüphane eşleşmesi %${rnd.int(72, 99)}.`
        : `Bölgede ${tehditTipi} emisyonu tespit edildi; platform kimliği teyit bekliyor.`;
      guvenYuzde = rnd.int(70, 99);
      break;
    }
    case 'IMINT': {
      tehditTipi = rnd.pick(IMINT_THREATS);
      kaynak = rnd.pick(IMINT_CAMERAS);
      baslik = `Görüntüde ${tehditTipi.toLowerCase()} tespiti`;
      ozet = korelasyonlu
        ? `${kaynak} görüntüsünde ${track!.izNo} ile ilişkili ${tehditTipi.toLowerCase()} sınıflandırıldı (otomatik tespit).`
        : `${kaynak} görüntüsünde ${tehditTipi.toLowerCase()} sınıflandırıldı; analist teyidi bekliyor.`;
      guvenYuzde = rnd.int(55, 98);
      break;
    }
    case 'OSINT': {
      tehditTipi = rnd.pick(OSINT_TOPICS);
      kaynak = rnd.pick(OSINT_PLATFORMS);
      baslik = `${kaynak} kaynağında ${tehditTipi.toLowerCase()}`;
      ozet = `${kaynak} üzerinde ${tehditTipi.toLowerCase()} içerikli gönderi; konum etiketi ve paylaşım ağı incelendi, yayılım ${rnd.int(2, 400)} hesap.`;
      guvenYuzde = rnd.int(20, 75);
      break;
    }
    case 'HUMINT': {
      tehditTipi = rnd.pick(HUMINT_TOPICS);
      kaynak = `Saha Kaynağı K-${rnd.int(10, 99)}`;
      baslik = `Saha raporu: ${tehditTipi.toLowerCase()}`;
      ozet = `${kaynak} sözlü bildirimi: ${tehditTipi.toLowerCase()}; çapraz doğrulama için ek toplama talep edildi.`;
      break;
    }
  }

  return {
    raporNo,
    tur,
    baslik,
    ozet,
    kaynak,
    kaynakGuvenilirligi: guvenilirlik,
    bilgiDogrulugu: dogruluk,
    oncelik,
    tehditTipi,
    guvenYuzde,
    ilgiliIzNo: korelasyonlu ? track!.izNo : null,
    enlem,
    boylam,
    zaman,
  };
}
