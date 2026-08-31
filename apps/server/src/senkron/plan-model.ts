/**
 * SYNC MATRIX — Harekat Senkronizasyon Planı modeli.
 *
 * Bir "plan" zaman eksenine yerleştirilmiş görev bloklarından (PlanGorev) ve
 * aralarındaki bağımlılıklardan (Bagimlilik) oluşur. Satırlar ontolojideki
 * varlıklardan (platform/birlik) beslenir; bloğun süresi/konumu ontolojik
 * özelliklerden türetilebilir. Şema KATI değil — domain/tür serbest string
 * (ontoloji değişebilir; enum dayatmıyoruz).
 *
 * Zaman birimi: H-saatine göre DAKİKA offset'i (H = 0; H-30 = -30). Duvar
 * saatine eşleme için plan `hEsRefISO` taşır (opsiyonel).
 */

import { z } from 'zod';

/** Görev türleri — sunumda ikon/renk eşlemesi için; liste genişleyebilir. */
export const GOREV_TURLERI = [
  'kilometre_tasi', // milestone (süresiz karar/olay noktası)
  'hareket', // intikal/movement
  'gorev', // genel görev/task
  'angajman', // engagement (sensör-to-shooter çıktısı)
  'elektronik_harp', // EW/SEAD
  'kesif', // ISR/recon
  'lojistik', // logistics
] as const;
export type GorevTur = (typeof GOREV_TURLERI)[number];

/** İstenen etki (desired effect) — hedefleme doktrini (JP 3-60 karşılığı). */
export const ISTENEN_ETKILER = [
  'imha', // destroy
  'etkisizlestirme', // neutralize
  'baskilama', // suppress (SEAD)
  'tespit', // detect/ISR
  'koruma', // protect/escort/DCA
  'aldatma', // deceive
] as const;
export type IstenenEtki = (typeof ISTENEN_ETKILER)[number];

export const GOREV_DURUMLARI = [
  'planli',
  'onayli',
  'icrada',
  'tamam',
  'gecikme',
  'iptal',
] as const;
export type GorevDurum = (typeof GOREV_DURUMLARI)[number];

/** Bağımlılık türü: FS = önceki BİTİNCE sonraki başlar (varsayılan); SS = birlikte başlar. */
export const BAGIMLILIK_TURLERI = ['FS', 'SS'] as const;
export type BagimlilikTur = (typeof BAGIMLILIK_TURLERI)[number];

export const konumSchema = z.object({
  enlem: z.number().min(-90).max(90),
  boylam: z.number().min(-180).max(180),
});
export type Konum = z.infer<typeof konumSchema>;

export const gorevSchema = z.object({
  id: z.string().min(1).max(60),
  ad: z.string().min(1).max(160),
  domain: z.string().min(1).max(40), // Hava/Deniz/Kara/Siber/Uzay… — ontoloji güdümlü
  varlikId: z.string().max(60).optional(), // ontoloji obje PK'sı (platform/birlik)
  varlikAd: z.string().max(120).optional(),
  tur: z.enum(GOREV_TURLERI),
  baslangicDk: z.number().int().min(-720).max(10080), // H-12s .. H+7g
  sureDk: z.number().int().min(0).max(10080),
  durum: z.enum(GOREV_DURUMLARI).default('planli'),
  gerekce: z.string().max(400).optional(),
  kaynak: z.string().max(40).optional(), // 'seed' | 'operator' | 'sensor-to-shooter' | 'aip'
  hedefIz: z.string().max(60).optional(), // angajman hedefi (iz_no) — harita geo-ilişkisi
  // ── TAKTİK ALANLAR (ATO/OPORD görev kartı karşılıkları; hepsi opsiyonel) ──
  gorevNo: z.string().max(20).optional(), // görev numarası (ATO mission number: ANG-101)
  cagriAdi: z.string().max(40).optional(), // çağrı adı (callsign)
  oncelik: z.number().int().min(1).max(5).optional(), // P1 (en yüksek) .. P5
  istenenEtki: z.enum(ISTENEN_ETKILER).optional(), // desired effect
  konum: konumSchema.optional(), // görev icra noktası (CAP istasyonu / bölge merkezi)
  bolgeYaricapKm: z.number().positive().max(500).optional(), // görev bölgesi (killbox/ROZ benzeri) → haritada çember
  hedefKonum: konumSchema.optional(), // sabit hedef koordinatı (DMPI benzeri; hedefIz'e alternatif)
  kontrolMakami: z.string().max(60).optional(), // C2 ajansı (AWACS/CRC/JTAC/KOİM…)
  frekans: z.string().max(30).optional(), // muhabere kanalı ("251.750 UHF")
  muhimmat: z.string().max(160).optional(), // silah/faydalı yük özeti (ordnance)
});
export type PlanGorev = z.infer<typeof gorevSchema>;

export const bagimlilikSchema = z.object({
  oncekiId: z.string().min(1).max(60),
  sonrakiId: z.string().min(1).max(60),
  tur: z.enum(BAGIMLILIK_TURLERI).default('FS'),
  gecikmeDk: z.number().int().min(-1440).max(1440).default(0), // lag/lead
});
export type Bagimlilik = z.infer<typeof bagimlilikSchema>;

export const planSchema = z.object({
  id: z.string().min(1).max(80),
  ad: z.string().min(1).max(160),
  tur: z.enum(['canli', 'senaryo']).default('canli'),
  temelPlanId: z.string().max(80).optional(), // senaryo ise hangi baz plandan dallandı
  hEsRefISO: z.string().datetime().optional(), // H-saati (mutlak) — duvar saatine eşleme
  gorevler: z.array(gorevSchema).max(500),
  bagimliliklar: z.array(bagimlilikSchema).max(1000),
  // What-if senaryosunun DALLANMA ANINDAKİ dondurulmuş baz kopyası (fark/overlay
  // canlıya karşı değil bu sabit ana karşı yapılır — kayan-baz hatasını önler).
  bazGorevler: z.array(gorevSchema).max(500).optional(),
  bazBagimliliklar: z.array(bagimlilikSchema).max(1000).optional(),
  // Operatörün satır (varlık) sıralaması — Gantt'ta sürükle-bırak ile düzenlenir.
  // Anahtar: varlikId ya da varlıksız görev için "t:<gorevId>".
  satirSirasi: z.array(z.string().max(70)).max(600).optional(),
});
export type HarekatPlani = z.infer<typeof planSchema>;
