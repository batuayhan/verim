/**
 * SENKRONİZASYON MATRİSİ montajcısı — Joint Fires "planlama tablosu".
 *
 * Askeri senkronizasyon matrisinin Verim uyarlaması: motorun tehdit-başına
 * ürettiği COA önerilerini TEK bir grid'de toplar —
 *
 *   SATIRLAR  = dost varlıklar (domain'e göre gruplu)
 *   SÜTUNLAR  = zaman pencereleri (kesişme süresinden türetilir)
 *   HÜCRELER  = o varlığın o pencerede angaje ettiği tehdit(ler)
 *
 * İLKELER:
 *  • Deterministik/saf (bu dosya DI'sız, test edilebilir) — askeri denetlenebilirlik.
 *  • Zaman pencereleri = CONFIG (ontoloji değil; planlama yapısı) — dışarıdan verilebilir.
 *  • Ontoloji enum'ları DAYATILMAZ: öncelik/roe metinleri olduğu gibi taşınır,
 *    renk/eşleme sunum katmanında güvenli varsayılanla yapılır.
 */

/** Zaman penceresi: kesişme süresi ustSinirDk'nın altındaysa bu pencere; null = "İzleme". */
export interface ZamanPenceresi {
  id: string;
  baslik: string;
  aciklama?: string;
  ustSinirDk: number | null;
}

export const VARSAYILAN_PENCERELER: ZamanPenceresi[] = [
  { id: 'simdi', baslik: 'Şimdi', aciklama: '0–5 dk', ustSinirDk: 5 },
  { id: 'h15', baslik: 'H+15', aciklama: '5–15 dk', ustSinirDk: 15 },
  { id: 'h30', baslik: 'H+30', aciklama: '15–30 dk', ustSinirDk: 30 },
  { id: 'h60', baslik: 'H+60', aciklama: '30–60 dk', ustSinirDk: 60 },
  { id: 'izleme', baslik: 'İzleme', aciklama: 'kesişme yok / takip', ustSinirDk: null },
];

/** Satır kaynağı: dost varlık özeti (COA motorunun Varlik'inden sadeleştirilmiş). */
export interface VarlikOzet {
  ad: string;
  pk?: string;
  tip: string;
  domain: string;
  hazir: boolean;
}

/** Bir tehdit için seçilen (önerilen) angajman — matris girdisi. */
export interface GorevGirdi {
  izNo: string;
  oncelik: string;
  skor: number;
  angajmanTipi: string;
  roeDurumu: string;
  basariYuzde: number;
  kesismeDk: number | null;
  varlikAd: string | null;
  varlikPk: string | null;
}

export interface SenkSatir {
  id: string;
  baslik: string;
  altbaslik?: string;
  grup: string; // domain
  pk?: string;
  tip?: string;
}
export interface SenkSutun {
  id: string;
  baslik: string;
  aciklama?: string;
}
export interface SenkGorev {
  izNo: string;
  oncelik: string;
  skor: number;
  angajmanTipi: string;
  roeDurumu: string;
  basariYuzde: number;
}
export interface SenkHucre {
  satirId: string;
  sutunId: string;
  gorevler: SenkGorev[];
}
export interface SenkOzet {
  gorevlendirilen_varlik: number;
  bosta_varlik: number;
  kapsanan_tehdit: number;
  planlanan_angajman: number; // İzle-Takip olmayan (kinetik/önleyici)
  atanamayan_tehdit: number; // uygun varlık önerilemeyen
}
export interface SenkMatris {
  satirlar: SenkSatir[];
  sutunlar: SenkSutun[];
  hucreler: SenkHucre[];
  ozet: SenkOzet;
}

/** Kesişme süresi + angajman tipinden zaman penceresi id'si seç. */
export function pencereSec(
  kesismeDk: number | null,
  angajmanTipi: string,
  pencereler: ZamanPenceresi[],
): string {
  const izleme = pencereler.find((p) => p.ustSinirDk === null);
  const izlemeId = izleme?.id ?? pencereler[pencereler.length - 1].id;
  // İzle-Takip veya kesişme öngörülmüyor → İzleme
  if (angajmanTipi === 'İzle-Takip' || kesismeDk == null) return izlemeId;
  const zamanli = pencereler
    .filter((p) => p.ustSinirDk != null)
    .sort((a, b) => (a.ustSinirDk as number) - (b.ustSinirDk as number));
  for (const p of zamanli) {
    if (kesismeDk <= (p.ustSinirDk as number)) return p.id;
  }
  // hepsinden uzak → en geniş zamanlı pencere (yoksa İzleme)
  return zamanli.length ? zamanli[zamanli.length - 1].id : izlemeId;
}

/**
 * Görevleri (tehdit → önerilen angajman) varlık × zaman matrisine dizer.
 * Satırlar YALNIZ görevlendirilen varlıklardan üretilir; boşta hazır varlık
 * sayısı özet'te raporlanır (atıl kapasite görünürlüğü).
 */
export function senkronizasyonKur(
  varliklar: VarlikOzet[],
  gorevler: GorevGirdi[],
  pencereler: ZamanPenceresi[] = VARSAYILAN_PENCERELER,
): SenkMatris {
  const varlikByPk = new Map(varliklar.filter((v) => v.pk).map((v) => [v.pk as string, v]));
  const varlikByAd = new Map(varliklar.map((v) => [v.ad, v]));

  const satirMap = new Map<string, SenkSatir>();
  const hucreMap = new Map<string, SenkHucre>();
  const kapsanan = new Set<string>();
  let atanamayan = 0;
  let planlananAngajman = 0;

  for (const g of gorevler) {
    kapsanan.add(g.izNo);
    if (g.angajmanTipi !== 'İzle-Takip') planlananAngajman++;

    if (!g.varlikAd && !g.varlikPk) {
      atanamayan++;
      continue;
    }
    const v = (g.varlikPk && varlikByPk.get(g.varlikPk)) || (g.varlikAd && varlikByAd.get(g.varlikAd)) || undefined;
    const satirId = v?.pk ?? g.varlikPk ?? g.varlikAd ?? 'bilinmeyen';
    if (!satirMap.has(satirId)) {
      satirMap.set(satirId, {
        id: satirId,
        baslik: v?.ad ?? g.varlikAd ?? '—',
        altbaslik: v?.tip,
        grup: v?.domain ?? '—',
        pk: v?.pk ?? g.varlikPk ?? undefined,
        tip: v?.tip,
      });
    }
    const sutunId = pencereSec(g.kesismeDk, g.angajmanTipi, pencereler);
    const key = `${satirId}|${sutunId}`;
    if (!hucreMap.has(key)) hucreMap.set(key, { satirId, sutunId, gorevler: [] });
    hucreMap.get(key)!.gorevler.push({
      izNo: g.izNo,
      oncelik: g.oncelik,
      skor: g.skor,
      angajmanTipi: g.angajmanTipi,
      roeDurumu: g.roeDurumu,
      basariYuzde: g.basariYuzde,
    });
  }

  for (const h of hucreMap.values()) h.gorevler.sort((a, b) => b.skor - a.skor);

  const satirlar = [...satirMap.values()].sort(
    (a, b) => a.grup.localeCompare(b.grup, 'tr') || a.baslik.localeCompare(b.baslik, 'tr'),
  );

  const gorevliPk = new Set(satirlar.map((s) => s.pk).filter(Boolean));
  const bostaVarlik = varliklar.filter((v) => v.hazir && v.pk && !gorevliPk.has(v.pk)).length;

  return {
    satirlar,
    sutunlar: pencereler.map((p) => ({ id: p.id, baslik: p.baslik, aciklama: p.aciklama })),
    hucreler: [...hucreMap.values()],
    ozet: {
      gorevlendirilen_varlik: satirlar.length,
      bosta_varlik: bostaVarlik,
      kapsanan_tehdit: kapsanan.size,
      planlanan_angajman: planlananAngajman,
      atanamayan_tehdit: atanamayan,
    },
  };
}
