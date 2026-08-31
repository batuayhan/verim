/**
 * COA (Course of Action / Angajman Senaryosu) ÜRETECİ — Sprint 3.
 * MSS "Joint Fires / Asset Tasking Recommender" omurgasının deterministik çekirdeği.
 *
 * Bir hedef için ROE (Angajman Kuralları) KISITLARI ALTINDA seçenekler üretir;
 * her seçenek için en uygun dost varlığı önerir (mesafe/menzil/hazırlık/domain),
 * başarı/risk tahmini + gerekçe verir. İnsan-döngüde: öneri → komutan onayı.
 *
 * İLKELER:
 *  • Deterministik/açıklanabilir (LLM değil) — askeri denetlenebilirlik.
 *  • ROE = CONFIG (RoeConfig) — sabit gömülü değil; birlik/harekât başına değişir.
 *  • MOSA: CoaEngine bir PORT; HeuristicCoaEngine adapter'ı.
 *  • Ontoloji enum'ları DAYATILMAZ: dostluk kodu vb. config eşlemesiyle yorumlanır.
 */

import { kerteriz, mesafeKm, yaklasmaKatsayisi, type Nokta } from './geo';

export const COA_ENGINE = Symbol('COA_ENGINE');

export interface Hedef extends Nokta {
  izNo: string;
  domain: string;
  hostilityCode: string;
  siniflandirmaGuveni?: number; // 0..1 pozitif kimlik güveni (yoksa 0.5 varsayılır)
  tehditSkoru: number; // 0..100 (tehdit skorlama motorundan)
  suratKnot: number;
  rotaDerece: number;
}

export interface Varlik extends Nokta {
  ad: string;
  pk?: string; // varlığın birincil anahtarı (platform_no) — nesne detayına gezinme için
  domain: string; // Hava/Deniz/Kara
  tip: string;
  menzilKm: number; // angajman/silah menzili
  hazir: boolean; // hazırlık durumu
  yakitOrani?: number; // 0..100
  muhimmat?: number; // adet (yoksa sınırsız varsayılmaz — 1 kabul edilir)
}

export interface KorumaliBolge extends Nokta {
  ad: string;
  yaricapKm: number;
}

export interface CoaBaglam {
  varliklar: Varlik[];
  korumaliBolgeler?: KorumaliBolge[];
}

export type AngajmanTipi = 'Etkisiz Hale Getir' | 'Önle/Durdur' | 'İzle-Takip' | 'Uyar';

export interface Secenek {
  angajmanTipi: AngajmanTipi;
  varlik: string | null; // önerilen varlık adı (display)
  varlikPk: string | null; // varlığın PK'sı (nesne detayına gezinme için)
  varlikTipi: string | null;
  mesafeKm: number | null;
  kesismeDk: number | null; // tahmini kesişme süresi (yaklaşıyorsa)
  basariYuzde: number;
  risk: 'Düşük' | 'Orta' | 'Yüksek';
  roeUygun: boolean;
  gerekce: string[];
}

export interface CoaSonuc {
  hedef: string;
  roeDurumu: 'serbest' | 'kısıtlı' | 'yasak';
  roeIhlalleri: string[];
  secenekler: Secenek[]; // sıralı (en iyi önce)
  oneri: Secenek | null;
}

/** ROE = angajman kuralları (config — sabit gömülü değil, harekâta göre değişir) */
export interface RoeConfig {
  dostlukKodlari: string[]; // bu kodlar dosttur → angajman YASAK
  pozitifKimlikGerekli: boolean; // düşük kimlik güveni → etkisiz kılma yasak
  asgariKimlikGuveni: number; // 0..1
  asgariAngajmanTehdidi: number; // bu skorun altında yalnız izle/uyar
  korumaliStandoffKm: number; // korumalı bölgeye bu mesafede kinetik angajman kısıtlı
}

export const VARSAYILAN_ROE: RoeConfig = {
  dostlukKodlari: ['FR'],
  pozitifKimlikGerekli: true,
  asgariKimlikGuveni: 0.6,
  asgariAngajmanTehdidi: 55,
  korumaliStandoffKm: 15,
};

export interface CoaEngine {
  uret(hedef: Hedef, baglam: CoaBaglam, roe?: RoeConfig): CoaSonuc;
}

const KT_TO_KM_DK = 1.852 / 60; // knot → km/dakika

export class HeuristicCoaEngine implements CoaEngine {
  uret(hedef: Hedef, baglam: CoaBaglam, roe: RoeConfig = VARSAYILAN_ROE): CoaSonuc {
    const ihlaller: string[] = [];
    const kimlikGuveni = hedef.siniflandirmaGuveni ?? 0.5;

    // --- ROE değerlendirmesi ---
    const dost = roe.dostlukKodlari.includes(hedef.hostilityCode);
    if (dost) ihlaller.push(`Hedef dost (${hedef.hostilityCode}) — kinetik angajman YASAK`);
    if (roe.pozitifKimlikGerekli && kimlikGuveni < roe.asgariKimlikGuveni)
      ihlaller.push(
        `Pozitif kimlik yetersiz (%${(kimlikGuveni * 100).toFixed(0)} < %${(
          roe.asgariKimlikGuveni * 100
        ).toFixed(0)}) — etkisiz kılma kısıtlı`,
      );
    if (hedef.tehditSkoru < roe.asgariAngajmanTehdidi)
      ihlaller.push(
        `Tehdit skoru ${hedef.tehditSkoru} < ${roe.asgariAngajmanTehdidi} — angajman eşiği altında`,
      );
    // Korumalı bölge standoff (dost/sivil yakınına kinetik kısıtı)
    let korumaliYakin: string | null = null;
    for (const b of baglam.korumaliBolgeler ?? []) {
      if (mesafeKm(hedef, b) < b.yaricapKm + roe.korumaliStandoffKm) korumaliYakin = b.ad;
    }
    if (korumaliYakin)
      ihlaller.push(`Korumalı bölgeye yakın (${korumaliYakin}) — yan hasar riski, kinetik kısıtlı`);

    const kinetikYasak = dost;
    const kinetikKisitli =
      !kinetikYasak &&
      (ihlaller.length > 0 ||
        (roe.pozitifKimlikGerekli && kimlikGuveni < roe.asgariKimlikGuveni));
    const roeDurumu: CoaSonuc['roeDurumu'] = kinetikYasak
      ? 'yasak'
      : kinetikKisitli
        ? 'kısıtlı'
        : 'serbest';

    // --- uygun varlıkları puanla (domain uyumu + menzil + hazırlık) ---
    const adaylar = baglam.varliklar
      .map((v) => {
        const d = mesafeKm(hedef, v);
        const menzilIci = d <= v.menzilKm;
        const domainUyum = v.domain === hedef.domain || v.domain === 'Kara'; // kara/SAM her domaine
        // yaklaşma → kesişme süresi (hedef varlığa doğru mu)
        const yak = yaklasmaKatsayisi(hedef, v);
        const kesisme =
          hedef.suratKnot > 0 && yak > 0.3 ? d / (hedef.suratKnot * KT_TO_KM_DK * yak) : null;
        return { v, d, menzilIci, domainUyum, kesisme, yak };
      })
      .filter((a) => a.domainUyum)
      .sort((a, b) => a.d - b.d);

    const enIyi = adaylar.find((a) => a.menzilIci && a.v.hazir) ?? adaylar[0] ?? null;

    // --- başarı/risk tahmini (deterministik) ---
    const basari = (a: (typeof adaylar)[number] | null): number => {
      if (!a) return 0;
      const menzilPay = a.menzilIci ? 1 : Math.max(0, 1 - (a.d - a.v.menzilKm) / a.v.menzilKm);
      const hazirlik = a.v.hazir ? 1 : 0.4;
      const yakit = (a.v.yakitOrani ?? 100) / 100;
      const muh = (a.v.muhimmat ?? 1) > 0 ? 1 : 0;
      const hedefHiz = Math.max(0.5, 1 - hedef.suratKnot / 1200); // hızlı hedef daha zor
      return Math.round(85 * menzilPay * hazirlik * yakit * muh * hedefHiz);
    };
    const risk = (a: (typeof adaylar)[number] | null): Secenek['risk'] => {
      if (korumaliYakin) return 'Yüksek';
      if (!a || !a.menzilIci || !a.v.hazir) return 'Yüksek';
      if ((a.v.yakitOrani ?? 100) < 30 || hedef.suratKnot > 600) return 'Orta';
      return 'Düşük';
    };

    const secenekler: Secenek[] = [];

    // 1) Etkisiz Hale Getir — yalnız ROE serbest/kısıtlı ve yasak değilse
    if (!kinetikYasak && hedef.tehditSkoru >= roe.asgariAngajmanTehdidi) {
      const g: string[] = [];
      if (enIyi) {
        g.push(
          `${enIyi.v.ad} (${enIyi.v.tip}) — ${enIyi.d.toFixed(0)} km, menzil ${enIyi.v.menzilKm} km ${
            enIyi.menzilIci ? 'İÇİNDE' : 'DIŞINDA'
          }`,
        );
        if (enIyi.kesisme) g.push(`Tahmini kesişme ~${enIyi.kesisme.toFixed(0)} dk`);
      } else g.push('Uygun varlık bulunamadı');
      if (kinetikKisitli) g.push('ROE kısıtı: komutan onayı + pozitif kimlik teyidi gerekli');
      secenekler.push({
        angajmanTipi: 'Etkisiz Hale Getir',
        varlik: enIyi?.v.ad ?? null,
        varlikPk: enIyi?.v.pk ?? null,
        varlikTipi: enIyi?.v.tip ?? null,
        mesafeKm: enIyi ? Math.round(enIyi.d) : null,
        kesismeDk: enIyi?.kesisme ? Math.round(enIyi.kesisme) : null,
        basariYuzde: basari(enIyi),
        risk: risk(enIyi),
        roeUygun: !kinetikKisitli,
        gerekce: g,
      });
    }

    // 2) Önle/Durdur (yaklaşan tehdit için önleme) — kinetik değilse de geçerli
    if (!kinetikYasak && enIyi) {
      secenekler.push({
        angajmanTipi: 'Önle/Durdur',
        varlik: enIyi.v.ad,
        varlikPk: enIyi.v.pk ?? null,
        varlikTipi: enIyi.v.tip,
        mesafeKm: Math.round(enIyi.d),
        kesismeDk: enIyi.kesisme ? Math.round(enIyi.kesisme) : null,
        basariYuzde: Math.round(basari(enIyi) * 0.9),
        risk: risk(enIyi),
        roeUygun: true,
        gerekce: [`${enIyi.v.ad} ile önleme/refakat; angajman yetkisi saklı tutulur`],
      });
    }

    // 3) İzle-Takip — her zaman geçerli (varsayılan güvenli seçenek)
    secenekler.push({
      angajmanTipi: 'İzle-Takip',
      varlik: adaylar[0]?.v.ad ?? null,
      varlikPk: adaylar[0]?.v.pk ?? null,
      varlikTipi: adaylar[0]?.v.tip ?? null,
      mesafeKm: adaylar[0] ? Math.round(adaylar[0].d) : null,
      kesismeDk: null,
      basariYuzde: 100,
      risk: 'Düşük',
      roeUygun: true,
      gerekce: [
        dost
          ? 'Hedef dost — yalnız takip/tanımlama'
          : 'Sensör takibini sürdür, angajman kararını geciktir (düşük risk)',
      ],
    });

    // Sıralama tehdide DUYARLI: ROE serbest + tehdit eşiği üstündeyse angajman
    // seçenekleri öne çıkar; aksi halde (düşük tehdit/yasak) güvenli İzle-Takip öne.
    const angajmanModu = roeDurumu !== 'yasak' && hedef.tehditSkoru >= roe.asgariAngajmanTehdidi;
    const tipAgirlik = (t: AngajmanTipi): number =>
      ({ 'Etkisiz Hale Getir': 3, 'Önle/Durdur': 2, Uyar: 1, 'İzle-Takip': 0 })[t];
    secenekler.sort((a, b) => {
      if (a.roeUygun !== b.roeUygun) return a.roeUygun ? -1 : 1; // ROE uygun her zaman önce
      const wa = angajmanModu ? tipAgirlik(a.angajmanTipi) : -tipAgirlik(a.angajmanTipi);
      const wb = angajmanModu ? tipAgirlik(b.angajmanTipi) : -tipAgirlik(b.angajmanTipi);
      if (wa !== wb) return wb - wa;
      return b.basariYuzde - a.basariYuzde;
    });
    const oneri = secenekler[0] ?? null;

    return { hedef: hedef.izNo, roeDurumu, roeIhlalleri: ihlaller, secenekler, oneri };
  }
}
