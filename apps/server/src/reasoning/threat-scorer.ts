/**
 * TEHDİT SKORLAMA MOTORU (Sprint 2) — MSS "önceliklendirme" omurgası.
 *
 * Rastgele `tehdit_seviyesi` yerine, bir izi çok-etkenli, DETERMİNİSTİK ve
 * AÇIKLANABİLİR biçimde 0..100 skorlar. Neden LLM değil: askeri
 * denetlenebilirlik — skor tekrarlanabilir, gerekçesi satır satır çıkar. LLM
 * (Asistan) bu motorun ÜSTÜNDE durur, çıktısını insana anlatır.
 *
 * MOSA (tak-çıkar): `ThreatScorer` bir PORT'tur; burada `HeuristicThreatScorer`
 * adapter'ı var. İleride ML tabanlı bir adapter ana omurgayı bozmadan takılır.
 *
 * ONTOLOJİYİ GÖMME: düşmanlık kod kümesi vb. burada DAYATILMAZ. Ağırlıklar ve
 * kod→puan eşlemesi CONFIG'tir; bilinmeyen kod → nötr varsayılan. Ontoloji
 * değişince (yeni domain/kod) motor kırılmaz; en fazla config güncellenir.
 */

import { mesafeKm, yaklasmaKatsayisi, type Nokta } from './geo';

export const THREAT_SCORER = Symbol('THREAT_SCORER');

export interface IzGirdi extends Nokta {
  izNo: string;
  domain: string;
  hostilityCode: string;
  suratKnot: number;
  irtifaFt: number;
  rotaDerece: number;
}

export interface DostVarlik extends Nokta {
  ad: string;
}
export interface Aoi extends Nokta {
  ad: string;
  yaricapKm: number;
}
/** Korelasyonlu istihbarat (çok-kaynak teyidi) — STANAG 2511 alanları */
export interface IstihbaratTeyit {
  kaynakGuvenilirligi: string; // A..F (harf erken = güvenilir) — değer serbest
  bilgiDogrulugu: number; // 1..6 (düşük = doğru) — STANAG
  guvenYuzde: number | null;
}

export interface BaglamGirdi {
  dostVarliklar?: DostVarlik[];
  aoiler?: Aoi[];
  istihbarat?: IstihbaratTeyit[];
}

export interface TehditFaktoru {
  etken: 'düşmanlık' | 'kinematik' | 'yakınlık' | 'istihbarat';
  katki: number; // 0..100 (ağırlıklı, skora eklenen)
  aciklama: string;
}

export interface TehditSonuc {
  skor: number; // 0..100
  seviye: number; // 1..5 (kova)
  oncelik: 'Kritik' | 'Yüksek' | 'Orta' | 'Düşük' | 'Asgari';
  yaklasiyor: boolean; // kinetik: dost varlığa/AOI'ye doğru mu
  gerekce: TehditFaktoru[]; // açıklanabilirlik — her etkenin katkısı
}

export interface ThreatScorer {
  skorla(iz: IzGirdi, baglam?: BaglamGirdi): TehditSonuc;
}

/** Skorlama ayarları — tümü dışarıdan verilebilir (MOSA/decoupling) */
export interface SkorConfig {
  agirlik: { dusmanlik: number; kinematik: number; yakinlik: number; istihbarat: number };
  /** hostility kodu → 0..1 taban tehdit; bilinmeyen kod → dusmanlikNotr */
  dusmanlikPuan: Record<string, number>;
  dusmanlikNotr: number;
  maxSuratKnot: number; // kinematik normalizasyon tavanı
  yakinlikRefKm: number; // bu mesafede yakınlık katkısı ~0'a iner
  seviyeEsikleri: [number, number, number, number]; // skor→seviye 1..5 sınırları
}

export const VARSAYILAN_CONFIG: SkorConfig = {
  agirlik: { dusmanlik: 0.4, kinematik: 0.2, yakinlik: 0.25, istihbarat: 0.15 },
  dusmanlikPuan: { HO: 0.95, SUSPECT: 0.6, UNK: 0.45, FR: 0.02, PENDING: 0.4 },
  dusmanlikNotr: 0.4,
  maxSuratKnot: 900,
  yakinlikRefKm: 300,
  seviyeEsikleri: [15, 35, 55, 75],
};

function kova(skor: number, esik: [number, number, number, number]): number {
  if (skor >= esik[3]) return 5;
  if (skor >= esik[2]) return 4;
  if (skor >= esik[1]) return 3;
  if (skor >= esik[0]) return 2;
  return 1;
}

const ONCELIK: Record<number, TehditSonuc['oncelik']> = {
  5: 'Kritik',
  4: 'Yüksek',
  3: 'Orta',
  2: 'Düşük',
  1: 'Asgari',
};

export class HeuristicThreatScorer implements ThreatScorer {
  constructor(private readonly cfg: SkorConfig = VARSAYILAN_CONFIG) {}

  skorla(iz: IzGirdi, baglam: BaglamGirdi = {}): TehditSonuc {
    const g: TehditFaktoru[] = [];
    const w = this.cfg.agirlik;

    // 1) DÜŞMANLIK — en büyük sürücü; kod→puan config, bilinmeyen → nötr
    const dPuan = this.cfg.dusmanlikPuan[iz.hostilityCode] ?? this.cfg.dusmanlikNotr;
    const dKatki = dPuan * w.dusmanlik * 100;
    g.push({
      etken: 'düşmanlık',
      katki: dKatki,
      aciklama: `Düşmanlık '${iz.hostilityCode}' → taban ${(dPuan * 100).toFixed(0)}/100`,
    });

    // 2) KİNEMATİK — hızlı + (havada) alçak iz daha tehditkâr (arazi takibi)
    const suratNorm = Math.min(1, iz.suratKnot / this.cfg.maxSuratKnot);
    let alcakBonus = 0;
    if (iz.domain === 'Hava' && iz.irtifaFt < 1000 && iz.suratKnot > 250) alcakBonus = 0.25;
    const kNorm = Math.min(1, suratNorm + alcakBonus);
    const kKatki = kNorm * w.kinematik * 100;
    g.push({
      etken: 'kinematik',
      katki: kKatki,
      aciklama: `Sürat ${iz.suratKnot} kt (norm ${suratNorm.toFixed(2)})${
        alcakBonus ? `, alçak-hızlı bonus +${alcakBonus}` : ''
      }`,
    });

    // 3) YAKINLIK — en yakın dost varlığa/AOI'ye mesafe + ÜZERİNE gidiyor mu (kinetik)
    const hedefler: Nokta[] = [
      ...(baglam.dostVarliklar ?? []),
      ...(baglam.aoiler ?? []),
    ];
    let yKatki = 0;
    let yaklasiyor = false;
    let yAciklama = 'Yakında dost varlık/AOI yok';
    if (hedefler.length > 0) {
      let enYakin = hedefler[0];
      let enYakinKm = mesafeKm(iz, enYakin);
      for (const h of hedefler) {
        const d = mesafeKm(iz, h);
        if (d < enYakinKm) {
          enYakinKm = d;
          enYakin = h;
        }
      }
      const yakinlik = Math.max(0, 1 - enYakinKm / this.cfg.yakinlikRefKm);
      const yaklasma = yaklasmaKatsayisi(iz, enYakin); // 0..1 üzerine gidiyor mu
      yaklasiyor = yaklasma > 0.5 && enYakinKm < this.cfg.yakinlikRefKm;
      // yaklaşan iz için yakınlık katkısı büyür (kinetik niyet)
      const carpani = 0.6 + 0.4 * yaklasma;
      yKatki = yakinlik * carpani * w.yakinlik * 100;
      yAciklama = `En yakın hedef ${enYakinKm.toFixed(0)} km (${
        (enYakin as DostVarlik).ad ?? 'AOI'
      }), yaklaşma ${(yaklasma * 100).toFixed(0)}%`;
    }
    g.push({ etken: 'yakınlık', katki: yKatki, aciklama: yAciklama });

    // 4) İSTİHBARAT TEYİDİ — çok-kaynak korelasyonu skoru yükseltir
    let iKatki = 0;
    const raporlar = baglam.istihbarat ?? [];
    if (raporlar.length > 0) {
      // güvenilirlik: A=1.0 … F=0.0; doğruluk: 1=1.0 … 6=0.0; güven yüzdesi
      const teyit =
        raporlar.reduce((acc, r) => {
          const gv = Math.max(0, 1 - 'ABCDEF'.indexOf(r.kaynakGuvenilirligi.toUpperCase()) / 5);
          const dg = Math.max(0, 1 - (r.bilgiDogrulugu - 1) / 5);
          const gy = (r.guvenYuzde ?? 60) / 100;
          return acc + gv * dg * gy;
        }, 0) / Math.max(1, raporlar.length);
      // çoklu kaynak bonusu (birden fazla teyit → daha güvenli)
      const coklu = Math.min(1, 0.7 + 0.1 * raporlar.length);
      iKatki = Math.min(1, teyit * coklu) * w.istihbarat * 100;
    }
    g.push({
      etken: 'istihbarat',
      katki: iKatki,
      aciklama: raporlar.length
        ? `${raporlar.length} korelasyonlu rapor teyidi`
        : 'Korelasyonlu istihbarat yok',
    });

    const skor = Math.round(Math.min(100, g.reduce((a, f) => a + f.katki, 0)));
    const seviye = kova(skor, this.cfg.seviyeEsikleri);
    return {
      skor,
      seviye,
      oncelik: ONCELIK[seviye],
      yaklasiyor,
      gerekce: g.map((f) => ({ ...f, katki: Math.round(f.katki * 10) / 10 })),
    };
  }
}
