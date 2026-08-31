/**
 * Ontoloji varlıklarından DETERMİNİSTİK varsayılan müşterek harekât planı.
 *
 * Klasik SEAD→taarruz→BDA zinciri + deniz füze desteği + kara intikali + ISR +
 * lojistik. Satırlar (varlıklar) ontolojiden gelir; domain'e göre atanır — uygun
 * varlık yoksa görev varlıksız kalır (plan yine tutarlı). Ontoloji değişirse
 * atama otomatik uyum sağlar (enum gömülü değil).
 */

import type { Bagimlilik, HarekatPlani, Konum, PlanGorev } from './plan-model';

export interface SeedVarlik {
  pk: string;
  ad: string;
  tip: string;
  domain: string;
  enlem?: number;
  boylam?: number;
}

export function varsayilanPlan(
  varliklar: SeedVarlik[],
  id = 'canli',
  ad = 'Müşterek Harekât Planı — TAARRUZ',
): HarekatPlani {
  const domainVarliklari = (d: string) =>
    varliklar.filter((v) => v.domain === d).sort((a, b) => a.pk.localeCompare(b.pk));
  const hava = domainVarliklari('Hava');
  const deniz = domainVarliklari('Deniz');
  const kara = domainVarliklari('Kara');

  const ew = hava[0];
  const jet = hava[1] ?? hava[0];
  const isr = hava[2] ?? hava[0];
  const gemi = deniz[0];
  const konvoy = kara[0];

  // Taktik konumlar varlıkların GERÇEK konumundan deterministik offset'le
  // türetilir (harekât alanının içinde kalır; sabit koordinat gömülmez).
  const kaydir = (v: SeedVarlik | undefined, dLat: number, dLon: number): Konum | undefined =>
    v?.enlem != null && v?.boylam != null
      ? { enlem: +(v.enlem + dLat).toFixed(4), boylam: +(v.boylam + dLon).toFixed(4) }
      : undefined;
  const hedefBolge = kaydir(jet, 0.6, 0.9); // taarruz hedef bölgesi: jetin KD'sunda

  const gorev = (
    gid: string,
    gad: string,
    domain: string,
    tur: PlanGorev['tur'],
    baslangicDk: number,
    sureDk: number,
    v?: SeedVarlik,
  ): PlanGorev => ({
    id: gid,
    ad: gad,
    domain,
    tur,
    baslangicDk,
    sureDk,
    durum: 'planli',
    kaynak: 'seed',
    ...(v ? { varlikId: v.pk, varlikAd: v.ad } : {}),
  });

  // Görev kartları ATO/OPORD alanlarıyla zengin: görev no, çağrı adı, öncelik,
  // istenen etki, C2 makamı, frekans, mühimmat, konum/bölge/hedef koordinatı.
  const gorevler: PlanGorev[] = [
    {
      ...gorev('kara-intikal', 'Kara unsur intikali', 'Kara', 'hareket', -60, 60, konvoy),
      gorevNo: 'MOV-101', cagriAdi: 'ÇELİK', oncelik: 3, kontrolMakami: '2. TUG HRK MRK',
      frekans: '38.750 VHF', konum: kaydir(konvoy, 0.15, 0.2),
    },
    {
      ...gorev('loj', 'İkmal & yakıt ikmali', 'Kara', 'lojistik', -30, 40, konvoy),
      gorevNo: 'LOG-102', cagriAdi: 'KERVAN', oncelik: 4, kontrolMakami: 'LOJ DEST K.LIĞI',
      frekans: '41.200 VHF', muhimmat: 'Yakıt 12t · 155mm ikmal',
    },
    {
      ...gorev('isr', 'İHA keşif / hedef tespiti', 'Hava', 'kesif', -30, 75, isr),
      gorevNo: 'ISR-201', cagriAdi: 'ŞAHİN', oncelik: 2, istenenEtki: 'tespit',
      kontrolMakami: 'CRC KARTAL', frekans: '251.750 UHF',
      muhimmat: 'EO/IR + SAR pod', konum: kaydir(isr, 0.4, 0.5), bolgeYaricapKm: 40,
    },
    {
      ...gorev('ew', 'SEAD — radar körleme (EW)', 'Hava', 'elektronik_harp', 0, 30, ew),
      gorevNo: 'SEAD-301', cagriAdi: 'YILDIRIM', oncelik: 1, istenenEtki: 'baskilama',
      kontrolMakami: 'AWACS BOZDOĞAN', frekans: '265.500 UHF',
      muhimmat: '2× ARM + karıştırma podu', konum: kaydir(ew, 0.3, 0.4), bolgeYaricapKm: 25,
    },
    {
      ...gorev('taarruz', 'Hava taarruz paketi', 'Hava', 'gorev', 30, 25, jet),
      gorevNo: 'MSN-401', cagriAdi: 'PARS', oncelik: 1, istenenEtki: 'imha',
      kontrolMakami: 'AWACS BOZDOĞAN', frekans: '255.400 UHF',
      muhimmat: '4× PGB + 2× A/A', hedefKonum: hedefBolge,
    },
    {
      ...gorev('deniz-dstk', 'Deniz füze desteği', 'Deniz', 'gorev', 35, 15, gemi),
      gorevNo: 'STK-501', cagriAdi: 'POYRAZ', oncelik: 2, istenenEtki: 'imha',
      kontrolMakami: 'GÖREV GRUBU (CTG) POYRAZ', frekans: '277.800 UHF',
      muhimmat: '8× seyir füzesi', hedefKonum: hedefBolge,
    },
    {
      ...gorev('bda', 'BDA — hasar tespiti', 'Hava', 'kesif', 55, 20, isr),
      gorevNo: 'ISR-202', cagriAdi: 'ŞAHİN', oncelik: 2, istenenEtki: 'tespit',
      kontrolMakami: 'CRC KARTAL', frekans: '251.750 UHF', hedefKonum: hedefBolge,
    },
  ];

  // Bağımlılık zincirleri (ön koşullar): EW bitmeden taarruz/deniz olmaz; kara
  // varmadan taarruz olmaz; taarruz bitmeden BDA olmaz; keşif başlayınca EW başlar.
  const bagimliliklar: Bagimlilik[] = [
    { oncekiId: 'isr', sonrakiId: 'ew', tur: 'SS', gecikmeDk: 30 },
    { oncekiId: 'kara-intikal', sonrakiId: 'taarruz', tur: 'FS', gecikmeDk: 0 },
    { oncekiId: 'ew', sonrakiId: 'taarruz', tur: 'FS', gecikmeDk: 0 },
    { oncekiId: 'ew', sonrakiId: 'deniz-dstk', tur: 'FS', gecikmeDk: 5 },
    { oncekiId: 'taarruz', sonrakiId: 'bda', tur: 'FS', gecikmeDk: 0 },
  ];

  return { id, ad, tur: 'canli', gorevler, bagimliliklar };
}
