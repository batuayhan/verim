/**
 * SYNC MATRIX motoru — deterministik/saf (DI'sız, test edilebilir).
 *
 * Üç yetenek:
 *  1) hesaplaCpm     — Kritik Yol Analizi (forward/backward pass, bolluk, kritik
 *                      yol) + operatör zamanlamasına göre bağımlılık İHLALLERİ.
 *  2) yenidenPlanla  — Dinamik zaman kaydırma: bir blok kayınca bağlı tüm sonraki
 *                      adımları ileri iterek (constraint propagation) zinciri kilitli tutar.
 *  3) planFarki      — What-if: iki planı (baz vs senaryo) karşılaştır.
 *
 * Zaman birimi: H-saatine göre dakika. Bağımlılık FS (bitiş-başlangıç, varsayılan)
 * veya SS (birlikte başla); ikisinde de gecikme (lag) desteklenir.
 */

import type { Bagimlilik, HarekatPlani, PlanGorev } from './plan-model';

export interface GorevHesap {
  esBaslangic: number; // earliest start
  esBitis: number; // earliest finish
  gsBaslangic: number; // latest start
  gsBitis: number; // latest finish
  bolluk: number; // slack = gsBaslangic - esBaslangic
  kritik: boolean; // bolluk ~ 0
}

export interface IhlalKaydi {
  oncekiId: string;
  sonrakiId: string;
  mesaj: string;
  gerekenBaslangicDk: number; // sonraki görevin en erken başlayabileceği an
}

export interface CpmSonuc {
  hesaplar: Record<string, GorevHesap>;
  kritikYol: string[]; // en uzun kritik zincir (gerçek bağımlılık yolu)
  kritikSayisi: number; // sıfır-bolluklu TÜM kritik görev sayısı (KPI için)
  projeSuresiDk: number;
  ihlaller: IhlalKaydi[];
  dongu: boolean; // döngü varsa CPM hesaplanamaz
}

const EPS = 1e-6;
const BAS_MIN = -720;
const BAS_MAX = 10080;
/** baslangicDk'yı geçerli aralığa çeker; NaN→0, ±∞ uçlara kırpılır (CPM'i korur). */
export const klampBaslangic = (v: number): number =>
  Number.isNaN(v) ? 0 : Math.min(BAS_MAX, Math.max(BAS_MIN, Math.round(v)));

/** Kahn topolojik sıralama; döngü varsa null. */
function topolojik(ids: string[], deps: Bagimlilik[]): string[] | null {
  const derece = new Map<string, number>(ids.map((id) => [id, 0]));
  const cikan = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const d of deps) {
    if (!derece.has(d.oncekiId) || !derece.has(d.sonrakiId)) continue; // askıda ref
    derece.set(d.sonrakiId, (derece.get(d.sonrakiId) ?? 0) + 1);
    cikan.get(d.oncekiId)!.push(d.sonrakiId);
  }
  // Deterministik: giriş derecesi 0 olanları id sırasıyla al
  const kuyruk = ids.filter((id) => (derece.get(id) ?? 0) === 0).sort();
  const sira: string[] = [];
  while (kuyruk.length) {
    const n = kuyruk.shift()!;
    sira.push(n);
    for (const m of cikan.get(n)!.slice().sort()) {
      derece.set(m, (derece.get(m) ?? 0) - 1);
      if ((derece.get(m) ?? 0) === 0) kuyruk.push(m);
    }
  }
  return sira.length === ids.length ? sira : null;
}

export function hesaplaCpm(plan: HarekatPlani): CpmSonuc {
  const gorevler = plan.gorevler;
  const idler = gorevler.map((g) => g.id);
  const gById = new Map(gorevler.map((g) => [g.id, g]));
  const suredst = (id: string) => gById.get(id)?.sureDk ?? 0;

  // askıda referansları at (bilinmeyen id'ye bağlılık)
  const deps = plan.bagimliliklar.filter((d) => gById.has(d.oncekiId) && gById.has(d.sonrakiId));

  const topo = topolojik(idler, deps);
  if (!topo) {
    return { hesaplar: {}, kritikYol: [], kritikSayisi: 0, projeSuresiDk: 0, ihlaller: [], dongu: true };
  }

  const gelen = new Map<string, Bagimlilik[]>(idler.map((id) => [id, []]));
  const giden = new Map<string, Bagimlilik[]>(idler.map((id) => [id, []]));
  for (const d of deps) {
    gelen.get(d.sonrakiId)!.push(d);
    giden.get(d.oncekiId)!.push(d);
  }

  // --- Forward pass: earliest start/finish ---
  // Operatörün YERLEŞTİRDİĞİ zamanı (baslangicDk) çıpa alır → CPM H-eksenli ve
  // yerleşime DUYARLI olur (blok kayınca kritik yol yeniden hesaplanır). Bağımlılık
  // izin verdiğinden erkene çekilmez; ihlaller ayrıca raporlanır.
  const ES = new Map<string, number>(idler.map((id) => [id, 0]));
  for (const id of topo) {
    let es = gById.get(id)!.baslangicDk;
    for (const d of gelen.get(id)!) {
      const p = d.oncekiId;
      const lag = d.gecikmeDk ?? 0;
      const aday = d.tur === 'SS' ? (ES.get(p) ?? 0) + lag : (ES.get(p) ?? 0) + suredst(p) + lag;
      es = Math.max(es, aday);
    }
    ES.set(id, es);
  }
  const EF = new Map<string, number>(idler.map((id) => [id, (ES.get(id) ?? 0) + suredst(id)]));
  const projeSuresi = idler.reduce((m, id) => Math.max(m, EF.get(id) ?? 0), 0);

  // --- Backward pass: latest finish/start ---
  const LF = new Map<string, number>(idler.map((id) => [id, projeSuresi]));
  for (const id of [...topo].reverse()) {
    // önce bu düğümün LF'i (sink değilse successor'lardan tightened) hazır; LS hesapla
    const ls = (LF.get(id) ?? projeSuresi) - suredst(id);
    // predecessor'ları sıkılaştır
    for (const d of gelen.get(id)!) {
      const p = d.oncekiId;
      const lag = d.gecikmeDk ?? 0;
      const sinir = d.tur === 'SS' ? ls - lag + suredst(p) : ls - lag; // p'nin izinli en geç bitişi
      LF.set(p, Math.min(LF.get(p) ?? projeSuresi, sinir));
    }
  }

  const hesaplar: Record<string, GorevHesap> = {};
  for (const id of idler) {
    const es = ES.get(id) ?? 0;
    const ef = EF.get(id) ?? 0;
    const lf = LF.get(id) ?? projeSuresi;
    const ls = lf - suredst(id);
    const bolluk = ls - es;
    hesaplar[id] = {
      esBaslangic: es,
      esBitis: ef,
      gsBaslangic: ls,
      gsBitis: lf,
      bolluk,
      kritik: Math.abs(bolluk) < EPS,
    };
  }

  // Kritik YOL: kritik düğümleri BINDING (sonrakinin başlangıcını gerçekten
  // belirleyen) kenarlarla bağlayan en uzun zincir — uydurma kenar çizilmez.
  const kritikSet = new Set(idler.filter((id) => hesaplar[id].kritik));
  const kritikGiden = new Map<string, string[]>(idler.map((id) => [id, []]));
  for (const d of deps) {
    if (!kritikSet.has(d.oncekiId) || !kritikSet.has(d.sonrakiId)) continue;
    const lag = d.gecikmeDk ?? 0;
    const gereken =
      d.tur === 'SS' ? (ES.get(d.oncekiId) ?? 0) + lag : (ES.get(d.oncekiId) ?? 0) + suredst(d.oncekiId) + lag;
    if (Math.abs((ES.get(d.sonrakiId) ?? 0) - gereken) < EPS) kritikGiden.get(d.oncekiId)!.push(d.sonrakiId);
  }
  const yolMemo = new Map<string, string[]>();
  const enUzunYol = (id: string): string[] => {
    const m = yolMemo.get(id);
    if (m) return m;
    let best: string[] = [];
    for (const n of kritikGiden.get(id) ?? []) {
      const sub = enUzunYol(n);
      if (sub.length > best.length) best = sub;
    }
    const yol = [id, ...best];
    yolMemo.set(id, yol);
    return yol;
  };
  let kritikYol: string[] = [];
  for (const id of kritikSet) {
    const y = enUzunYol(id);
    if (y.length > kritikYol.length) kritikYol = y;
  }
  if (kritikYol.length <= 1 && kritikSet.size > 1) {
    kritikYol = [...kritikSet].sort(
      (a, b) => hesaplar[a].esBaslangic - hesaplar[b].esBaslangic || a.localeCompare(b),
    );
  }

  // --- İhlaller: operatörün yerleştirdiği baslangicDk bağımlılığı bozuyor mu? ---
  const ihlaller: IhlalKaydi[] = [];
  for (const d of deps) {
    const p = gById.get(d.oncekiId)!;
    const s = gById.get(d.sonrakiId)!;
    const lag = d.gecikmeDk ?? 0;
    const gereken = d.tur === 'SS' ? p.baslangicDk + lag : p.baslangicDk + p.sureDk + lag;
    if (s.baslangicDk < gereken - EPS) {
      ihlaller.push({
        oncekiId: p.id,
        sonrakiId: s.id,
        gerekenBaslangicDk: gereken,
        mesaj:
          d.tur === 'SS'
            ? `${s.ad}, ${p.ad} ile birlikte (en erken H${fmt(gereken)}) başlamalı`
            : `${s.ad}, ${p.ad} bitmeden başlıyor (en erken H${fmt(gereken)})`,
      });
    }
  }

  return { hesaplar, kritikYol, kritikSayisi: kritikSet.size, projeSuresiDk: projeSuresi, ihlaller, dongu: false };
}

function fmt(dk: number): string {
  const s = dk >= 0 ? '+' : '-';
  const a = Math.abs(dk);
  return `${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

export interface KaydirmaSonuc {
  plan: HarekatPlani;
  kaydirilanlar: Array<{ id: string; eski: number; yeni: number }>;
}

/**
 * DİNAMİK ZAMAN KAYDIRMA — bir görevi yeni başlangıca al; bağlı SONRAKİ adımlar
 * kısıtı bozuyorsa ileri kaydır (zincirleme). Yalnız İLERİ iter (gecikme yayılır,
 * asla geri çekmez). Döngü güvenli (topolojik yayılım).
 */
export function yenidenPlanla(
  plan: HarekatPlani,
  gorevId: string,
  yeniBaslangicDk: number,
): KaydirmaSonuc {
  const gorevler = plan.gorevler.map((g) => ({ ...g }));
  const gById = new Map(gorevler.map((g) => [g.id, g]));
  const hedef = gById.get(gorevId);
  if (!hedef) return { plan: { ...plan, gorevler }, kaydirilanlar: [] };

  const deps = plan.bagimliliklar.filter((d) => gById.has(d.oncekiId) && gById.has(d.sonrakiId));
  const giden = new Map<string, Bagimlilik[]>(gorevler.map((g) => [g.id, []]));
  for (const d of deps) giden.get(d.oncekiId)!.push(d);

  const kaydirilanlar: Array<{ id: string; eski: number; yeni: number }> = [];
  const uygula = (g: PlanGorev, ham: number) => {
    const yeni = klampBaslangic(ham);
    if (yeni === g.baslangicDk) return;
    kaydirilanlar.push({ id: g.id, eski: g.baslangicDk, yeni });
    g.baslangicDk = yeni;
  };
  uygula(hedef, yeniBaslangicDk);

  // topolojik yayılım — successor'ları kısıt gereğince ileri it
  const topo = topolojik(
    gorevler.map((g) => g.id),
    deps,
  );
  const sira = topo ?? gorevler.map((g) => g.id); // döngü varsa yine de en iyi çaba
  for (const id of sira) {
    const p = gById.get(id)!;
    for (const d of giden.get(id)!) {
      const s = gById.get(d.sonrakiId)!;
      if (s.durum === 'tamam' || s.durum === 'iptal') continue; // biten/iptal görev kaydırılmaz
      const lag = d.gecikmeDk ?? 0;
      const gereken = d.tur === 'SS' ? p.baslangicDk + lag : p.baslangicDk + p.sureDk + lag;
      if (s.baslangicDk < gereken) {
        uygula(s, gereken);
        if (s.durum === 'planli' || s.durum === 'onayli') s.durum = 'gecikme';
      }
    }
  }

  return { plan: { ...plan, gorevler }, kaydirilanlar };
}

export interface PlanFarkKaydi {
  id: string;
  ad: string;
  tur: 'eklendi' | 'silindi' | 'kaydirildi' | 'sure_degisti';
  eskiBaslangicDk?: number;
  yeniBaslangicDk?: number;
  eskiSureDk?: number;
  yeniSureDk?: number;
}

export interface PlanFarki {
  degisiklikler: PlanFarkKaydi[];
  eskiSureDk: number;
  yeniSureDk: number;
  kritikYolDegisti: boolean;
}

/** Planın çizelgelenmiş bitişi (H'e göre dk): max(baslangicDk + sureDk). */
export function planBitisDk(plan: HarekatPlani): number {
  return plan.gorevler.reduce((m, g) => Math.max(m, g.baslangicDk + g.sureDk), 0);
}

/** WHAT-IF farkı: baz plan → senaryo. Süre/başlangıç/eklenen/silinen + kritik yol değişimi. */
export function planFarki(baz: HarekatPlani, senaryo: HarekatPlani): PlanFarki {
  const bazById = new Map(baz.gorevler.map((g) => [g.id, g]));
  const senById = new Map(senaryo.gorevler.map((g) => [g.id, g]));
  const degisiklikler: PlanFarkKaydi[] = [];

  for (const s of senaryo.gorevler) {
    const b = bazById.get(s.id);
    if (!b) {
      degisiklikler.push({ id: s.id, ad: s.ad, tur: 'eklendi', yeniBaslangicDk: s.baslangicDk });
      continue;
    }
    if (b.baslangicDk !== s.baslangicDk)
      degisiklikler.push({
        id: s.id,
        ad: s.ad,
        tur: 'kaydirildi',
        eskiBaslangicDk: b.baslangicDk,
        yeniBaslangicDk: s.baslangicDk,
      });
    if (b.sureDk !== s.sureDk)
      degisiklikler.push({
        id: s.id,
        ad: s.ad,
        tur: 'sure_degisti',
        eskiSureDk: b.sureDk,
        yeniSureDk: s.sureDk,
      });
  }
  for (const b of baz.gorevler)
    if (!senById.has(b.id))
      degisiklikler.push({ id: b.id, ad: b.ad, tur: 'silindi', eskiBaslangicDk: b.baslangicDk });

  const bazCpm = hesaplaCpm(baz);
  const senCpm = hesaplaCpm(senaryo);
  return {
    degisiklikler,
    eskiSureDk: planBitisDk(baz),
    yeniSureDk: planBitisDk(senaryo),
    kritikYolDegisti: bazCpm.kritikYol.join(',') !== senCpm.kritikYol.join(','),
  };
}

// --- KAYNAK ÇAKIŞMASI ---------------------------------------------------------
export interface Cakisma {
  varlikId: string;
  varlikAd?: string;
  aId: string;
  aAd: string;
  bId: string;
  bAd: string;
  mesaj: string;
}

/**
 * Aynı varlığın (platform/birlik) zamanı çakışan iki göreve atanması — fiziksel
 * imkânsızlık. Kilometre taşları (sure=0) çakışmaz. O(n²) ama n küçük.
 */
export function kaynakCakismalari(plan: HarekatPlani): Cakisma[] {
  const byVarlik = new Map<string, PlanGorev[]>();
  for (const g of plan.gorevler) {
    if (!g.varlikId || g.sureDk <= 0 || g.durum === 'iptal') continue;
    const list = byVarlik.get(g.varlikId) ?? [];
    list.push(g);
    byVarlik.set(g.varlikId, list);
  }
  const out: Cakisma[] = [];
  for (const [vid, list] of byVarlik) {
    list.sort((a, b) => a.baslangicDk - b.baslangicDk);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.baslangicDk + a.sureDk > b.baslangicDk && b.baslangicDk + b.sureDk > a.baslangicDk) {
          out.push({
            varlikId: vid,
            varlikAd: a.varlikAd,
            aId: a.id,
            aAd: a.ad,
            bId: b.id,
            bAd: b.ad,
            mesaj: `${a.varlikAd ?? vid}: "${a.ad}" ile "${b.ad}" zamanı çakışıyor`,
          });
        }
      }
    }
  }
  return out;
}

/** TOPLU KAYDIRMA — (opsiyonel domain filtreli) tüm görevleri delta dk kaydır. */
export function topluKaydir(plan: HarekatPlani, deltaDk: number, domainFiltre?: string): HarekatPlani {
  const d = Number.isFinite(deltaDk) ? Math.round(deltaDk) : 0;
  const gorevler = plan.gorevler.map((g) =>
    !domainFiltre || g.domain === domainFiltre
      ? { ...g, baslangicDk: klampBaslangic(g.baslangicDk + d) }
      : { ...g },
  );
  return { ...plan, gorevler };
}

/** Bir bağımlılık eklenirse döngü oluşur mu (eklemeden önce kontrol). */
export function bagimlilikDonguYaratir(plan: HarekatPlani, yeni: Bagimlilik): boolean {
  if (yeni.oncekiId === yeni.sonrakiId) return true;
  const test: HarekatPlani = { ...plan, bagimliliklar: [...plan.bagimliliklar, yeni] };
  return hesaplaCpm(test).dongu;
}
