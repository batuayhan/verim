import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import PanToolIcon from '@mui/icons-material/PanTool';
import RedoIcon from '@mui/icons-material/Redo';
import UndoIcon from '@mui/icons-material/Undo';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import { Box, Chip, Divider, IconButton, Menu, MenuItem, Stack, Tooltip, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bagimlilik, Cakisma, CpmSonuc, HarekatPlani, PlanGorev } from './api';

/**
 * SÜRÜKLERKEN CANLI ZİNCİR ÖNİZLEMESİ — sunucudaki yenidenPlanla'nın salt-okunur
 * aynası (AYNI kurallar: yalnız İLERİ iter, tamam/iptal atlanır, FS/SS + gecikme,
 * aralık kırpma). Otorite sunucudadır: bırakınca gerçek hesap orada yapılır; bu
 * yalnız "bırakırsam ne olur"u gösterir. Kurallar sunucuyla senkron tutulmalı.
 */
function kaydirOnizle(
  gorevler: PlanGorev[],
  deps: Bagimlilik[],
  hedefId: string,
  yeniBaslangic: number,
): Map<string, number> {
  const klamp = (v: number) => (Number.isNaN(v) ? 0 : Math.min(10080, Math.max(-720, Math.round(v))));
  const bas = new Map(gorevler.map((g) => [g.id, g.baslangicDk]));
  const sure = new Map(gorevler.map((g) => [g.id, g.sureDk]));
  const durum = new Map(gorevler.map((g) => [g.id, g.durum]));
  const out = new Map<string, number>();
  if (!bas.has(hedefId)) return out;
  const uygula = (id: string, v: number) => {
    const k = klamp(v);
    if (k === bas.get(id)) return;
    bas.set(id, k);
    out.set(id, k);
  };
  uygula(hedefId, yeniBaslangic);
  // yinelemeli gevşetme — DAG'de topolojik geçişle aynı sonuca yakınsar
  for (let tur = 0; tur < gorevler.length; tur++) {
    let degisti = false;
    for (const d of deps) {
      if (!bas.has(d.oncekiId) || !bas.has(d.sonrakiId)) continue;
      const sd = durum.get(d.sonrakiId);
      if (sd === 'tamam' || sd === 'iptal') continue;
      const lag = d.gecikmeDk ?? 0;
      const gereken =
        (d.tur === 'SS' ? bas.get(d.oncekiId)! : bas.get(d.oncekiId)! + (sure.get(d.oncekiId) ?? 0)) + lag;
      if (bas.get(d.sonrakiId)! < gereken) {
        uygula(d.sonrakiId, gereken);
        degisti = true;
      }
    }
    if (!degisti) break;
  }
  return out;
}

/**
 * SYNC MATRIX zaman çizelgesi (Gantt). Satırlar = ontoloji varlıkları (domain
 * gruplu), bloklar = görev adımları alt-şeritlerle (aynı varlıkta çakışanlar üst
 * üste binmez), oklar = bağımlılıklar, kırmızı = kritik yol. "ŞİMDİ" çizgisi
 * H-saatine göre canlı ilerler. Blok sürüklenince onKaydir tetiklenir (5 dk'ya
 * yuvarlar); motor bağlı adımları zincirleme kaydırır. Saf sunum bileşeni.
 */

const LABEL_W = 200;
const HEADER_H = 32;
const BLOCK_H = 26;
const LANE_H = BLOCK_H + 8; // alt-şerit yüksekliği
const MIN_ROW_H = 46;

/** KOMUTA KONSOLU teması — koyu taktik kanvas (Kairos/C2 ekran dili) */
const K = {
  kanvas: '#0e1626',
  panel: '#101b2e',
  cetvel: '#0b1220',
  bant: '#16233c',
  izgara: 'rgba(148,163,184,0.09)',
  ayrac: 'rgba(148,163,184,0.14)',
  metin: '#e2e8f0',
  metinIkincil: '#7c8db0',
  bantMetin: '#9fb3d8',
  ok: '#5c6f8f',
  simdi: '#ff3b4b',
  playhead: '#38bdf8',
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
};

const DOMAIN_RENK: Record<string, string> = {
  Hava: '#1565c0',
  Deniz: '#00838f',
  Kara: '#558b2f',
  Siber: '#6a1b9a',
  Uzay: '#283593',
  Angajman: '#c62828',
};
/** Kairos tarzı GÖREV-TİPİ renkleri (Strike=kırmızı, ISR=sarı, DCA=mor, Transit=mavi…) */
/** Ad listesini 2 + "+n" ile kırp (tooltip yoğunluğu; tam liste çekmecede) */
const kirpAd = (arr: string[]): string =>
  arr.length <= 2 ? arr.join(', ') : `${arr.slice(0, 2).join(', ')} +${arr.length - 2}`;

/** İstenen etki (desired effect) — tooltip'te okunur ad */
const ETKI_AD: Record<string, string> = {
  imha: 'İMHA',
  etkisizlestirme: 'ETKİSİZLEŞTİR',
  baskilama: 'BASKILA',
  tespit: 'TESPİT',
  koruma: 'KORU',
  aldatma: 'ALDAT',
};

const TUR_RENK: Record<string, string> = {
  angajman: '#c62828',
  kesif: '#f9a825',
  elektronik_harp: '#6a1b9a',
  hareket: '#1565c0',
  lojistik: '#2e7d32',
  gorev: '#455a64',
  kilometre_tasi: '#212121',
};
export type RenkMod = 'domain' | 'tur';
const TUR_IKON: Record<string, string> = {
  kilometre_tasi: '◆',
  hareket: '→',
  gorev: '▣',
  angajman: '✜',
  elektronik_harp: '⚡',
  kesif: '👁',
  lojistik: '⛽',
};

function fmtH(dk: number): string {
  const s = dk < 0 ? '−' : '+';
  const a = Math.abs(dk);
  return `H${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

interface Row {
  key: string;
  label: string;
  domain: string;
  varlikId?: string;
  gorevler: PlanGorev[];
}

export interface GanttTimelineProps {
  plan: HarekatPlani;
  cpm: CpmSonuc;
  scale?: number; // BAŞLANGIÇ ölçeği (px/dk) — zoom bileşenin kendisindedir
  cakismalar?: Cakisma[];
  bazGorevler?: PlanGorev[]; // senaryo modunda baz planın orijinal konumları (hayalet)
  renkMod?: RenkMod; // 'domain' (varsayılan) | 'tur' (Kairos görev-tipi renkleri)
  onRenkMod?: (m: RenkMod) => void; // kümedeki ikon anahtar (bileşen-içi)
  playheadDk?: number | null; // playback imleci (H'e göre dk) — null: kapalı
  onSatirTasi?: (sira: string[]) => void; // satır sürükle-bırak kalıcılığı
  /** Boş zaman alanına çift tık → o satır/o anda görev oluştur */
  onBoslukCiftTik?: (varlikId: string | undefined, baslangicDk: number) => void;
  // GRAFİK-İÇİ yetenekler (opsiyonel — verilirse sağ tık menüsü/kenar tutamaçları aktifleşir)
  onDurum?: (gorevId: string, durum: PlanGorev['durum']) => void;
  onSil?: (gorevId: string) => void;
  onBagimlilikEkle?: (oncekiId: string, sonrakiId: string) => void;
  onBagimlilikSil?: (oncekiId: string, sonrakiId: string) => void;
  /** Bağı YERİNDE düzenle: tür çevir (FS↔SS) / gecikme ayarla (ok menüsünden) */
  onBagimlilikDegistir?: (d: Bagimlilik, yeni: { tur?: 'FS' | 'SS'; gecikmeDk?: number }) => void;
  /** Boyutlandırma — false/throw dönerse blok ESKİ süresine döner (optimistik geri alma) */
  onSureDegis?: (gorevId: string, sureDk: number) => void | boolean | Promise<void | boolean>;
  // Bileşen-içi geri/ileri düğmeleri (yeniden kullanılabilirlik: kontrol kanvasta)
  gecmis?: { geri: number; ileri: number };
  onGeri?: () => void;
  onIleri?: () => void;
  /** Kaydırma — false/throw dönerse bloklar ESKİ konumuna döner (optimistik geri alma) */
  onKaydir: (gorevId: string, baslangicDk: number) => void | boolean | Promise<void | boolean>;
  onGorevClick?: (g: PlanGorev) => void;
  /** ✎ Düzenle menü öğesi için AYRI kanca — verilmezse onGorevClick kullanılır
   *  (haritada blok tıkı flyTo iken düzenlemenin çekmece açabilmesi için) */
  onDuzenle?: (g: PlanGorev) => void;
  onVarlik?: (varlikId: string) => void;
  /** Hover köprüsü (ör. haritada karşılığını vurgulamak için) */
  onGorevHover?: (gorevId: string | null) => void;
  /** DIŞ hover: başka bir bileşen (kritik yol şeridi, tehdit tablosu…) bir
   *  görevi işaret ediyor → zincir vurgusu içerideki hover gibi yanar */
  hoverDisId?: string | null;
  /** Sağ-tık menüsüne "🗺 Haritada göster" ekler (sayfalar arası köprü) */
  onHaritadaGoster?: (g: PlanGorev) => void;
  seciliId?: string | null;
}

export function GanttTimeline({
  plan,
  cpm,
  scale: baslangicOlcek = 4,
  cakismalar = [],
  bazGorevler,
  renkMod = 'domain',
  onRenkMod,
  playheadDk = null,
  onSatirTasi,
  onBoslukCiftTik,
  onDurum,
  onSil,
  onBagimlilikEkle,
  onBagimlilikSil,
  onBagimlilikDegistir,
  onSureDegis,
  gecmis,
  onGeri,
  onIleri,
  onKaydir,
  onGorevClick,
  onDuzenle,
  onVarlik,
  onGorevHover,
  hoverDisId = null,
  onHaritadaGoster,
  seciliId,
}: GanttTimelineProps) {
  // ZOOM bileşenin kendisinde (yeniden kullanılabilirlik) — Ctrl+tekerlek + düğmeler
  const [scale, setScale] = useState(baslangicOlcek);
  // Katlanabilir bölümler (Kairos sections) — domain başlığına tıkla → katla/aç
  const [kapali, setKapali] = useState<Set<string>>(new Set());
  const bolumToggle = (d: string) =>
    setKapali((s) => {
      const n = new Set(s);
      n.has(d) ? n.delete(d) : n.add(d);
      return n;
    });
  const gorevById = useMemo(() => new Map(plan.gorevler.map((g) => [g.id, g])), [plan.gorevler]);
  const cakisanIdler = useMemo(() => {
    const s = new Set<string>();
    for (const c of cakismalar) {
      s.add(c.aId);
      s.add(c.bId);
    }
    return s;
  }, [cakismalar]);

  const rows = useMemo<Row[]>(() => {
    const m = new Map<string, Row>();
    for (const g of plan.gorevler) {
      const key = g.varlikId ?? `t:${g.id}`;
      if (!m.has(key))
        m.set(key, { key, label: g.varlikAd ?? g.ad, domain: g.domain, varlikId: g.varlikId, gorevler: [] });
      m.get(key)!.gorevler.push(g);
    }
    // Operatör sıralaması (sürükle-bırak): satirSirasi'ndaki konum öncelikli
    const idx = new Map((plan.satirSirasi ?? []).map((k, i) => [k, i]));
    return [...m.values()].sort(
      (a, b) =>
        a.domain.localeCompare(b.domain, 'tr') ||
        (idx.get(a.key) ?? 1e9) - (idx.get(b.key) ?? 1e9) ||
        a.label.localeCompare(b.label, 'tr'),
    );
  }, [plan.gorevler, plan.satirSirasi]);

  // Satır sürükle-bırak (aynı domain/bölüm içinde yukarı-aşağı taşıma)
  const [surSatir, setSurSatir] = useState<string | null>(null);
  const [hedefSatir, setHedefSatir] = useState<string | null>(null);

  // Alt-şerit yerleşimi + Kairos bölümleri: domain başlıkları ayrı bant; katlanmış
  // bölümün satırları çizilmez (görevleri/okları da gizlenir — yalnız görsel).
  const BOLUM_H = 26;
  const yerlesim = useMemo(() => {
    const laneOf = new Map<string, number>();
    const rowTop = new Map<string, number>();
    const rowH = new Map<string, number>();
    const bolumTop = new Map<string, number>();
    const bolumSayi = new Map<string, number>();
    let acc = 0;
    let sonDomain: string | null = null;
    for (const r of rows) {
      if (r.domain !== sonDomain) {
        sonDomain = r.domain;
        bolumTop.set(r.domain, acc);
        acc += BOLUM_H;
      }
      bolumSayi.set(r.domain, (bolumSayi.get(r.domain) ?? 0) + 1);
      if (kapali.has(r.domain)) continue;
      const tasks = [...r.gorevler].sort((a, b) => a.baslangicDk - b.baslangicDk);
      const ends: number[] = [];
      for (const t of tasks) {
        const bit = t.baslangicDk + Math.max(0, t.sureDk);
        let lane = ends.findIndex((e) => e <= t.baslangicDk);
        if (lane === -1) {
          lane = ends.length;
          ends.push(0);
        }
        ends[lane] = bit;
        laneOf.set(t.id, lane);
      }
      const lanes = Math.max(1, ends.length);
      const h = Math.max(MIN_ROW_H, lanes * LANE_H + 6);
      rowTop.set(r.key, acc);
      rowH.set(r.key, h);
      acc += h;
    }
    return { laneOf, rowTop, rowH, bolumTop, bolumSayi, bodyH: acc };
  }, [rows, kapali]);

  const rowKeyOf = (g: PlanGorev) => g.varlikId ?? `t:${g.id}`;
  const blockTop = (g: PlanGorev) =>
    (yerlesim.rowTop.get(rowKeyOf(g)) ?? 0) + 3 + (yerlesim.laneOf.get(g.id) ?? 0) * LANE_H;
  const blockCy = (g: PlanGorev) => blockTop(g) + BLOCK_H / 2;

  const { tMin, tMax } = useMemo(() => {
    const hepsi = [...plan.gorevler, ...(bazGorevler ?? [])]; // hayaletler de aralığa girsin
    const starts = hepsi.map((g) => g.baslangicDk);
    const ends = hepsi.map((g) => g.baslangicDk + g.sureDk);
    return {
      tMin: Math.floor((Math.min(0, ...starts) - 15) / 15) * 15,
      tMax: Math.ceil((Math.max(0, ...ends) + 15) / 15) * 15,
    };
  }, [plan.gorevler, bazGorevler]);

  const x = (dk: number) => (dk - tMin) * scale;
  const timelineW = (tMax - tMin) * scale;

  // sürükleme — canlı yenileme sırasında bozulmaması için ref'ler
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const movedRef = useRef(false);
  const onKaydirRef = useRef(onKaydir);
  onKaydirRef.current = onKaydir;
  const gorevByIdRef = useRef(gorevById);
  gorevByIdRef.current = gorevById;

  useEffect(() => {
    if (!drag) return;
    let startX: number | null = null;
    let sonDx = 0;
    let rafBekliyor = false;
    const move = (e: PointerEvent) => {
      if (startX == null) startX = e.clientX;
      sonDx = e.clientX - startX;
      if (Math.abs(sonDx) > 3) movedRef.current = true;
      if (rafBekliyor) return; // PERFORMANS: kare başına tek güncelleme
      rafBekliyor = true;
      requestAnimationFrame(() => {
        rafBekliyor = false;
        setDrag((d) => (d ? { ...d, dx: sonDx } : d));
      });
    };
    const up = () => {
      const d = dragRef.current;
      if (d) {
        const g = gorevByIdRef.current.get(d.id);
        const deltaDk = Math.round(d.dx / scale / 5) * 5;
        if (g && deltaDk !== 0) {
          // OPTİMİSTİK: tüm zincir (önizlemeyle aynı hesap) anında yeni yerine
          const hedefBas = g.baslangicDk + deltaDk;
          const tam = kaydirOnizle(plan.gorevler, plan.bagimliliklar, d.id, hedefBas);
          if (!tam.has(d.id)) tam.set(d.id, hedefBas);
          setOptBas((m) => new Map([...m, ...tam]));
          const geriAl = () =>
            setOptBas((m) => {
              const n = new Map(m);
              for (const id of tam.keys()) n.delete(id);
              return n;
            });
          Promise.resolve(onKaydirRef.current(d.id, hedefBas))
            .then((ok) => {
              if (ok === false) geriAl(); // sunucu reddetti → eski konum
            })
            .catch(geriAl); // hata → eski konum (hata sayfada gösterilir)
        }
      }
      setDrag(null);
    };
    // Esc → sürüklemeyi İPTAL (commit yok; blok eski yerine döner)
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        movedRef.current = true; // bırakma tıklaması çekmece açmasın
        setDrag(null);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    };
  }, [drag?.id, scale]);

  // CANLI ZİNCİR ÖNİZLEMESİ: sürükleme 5 dk adıma oturdukça bağlı adımların
  // "bırakırsam nereye kayacağı" hesaplanır — bloklar ve oklar birlikte akar.
  const snapDelta = drag ? Math.round(drag.dx / scale / 5) * 5 : 0;
  const suruklenen = drag ? gorevById.get(drag.id) : undefined;
  const onizleme = useMemo(() => {
    if (!drag || snapDelta === 0) return null;
    const hedef = gorevById.get(drag.id);
    if (!hedef) return null;
    return kaydirOnizle(plan.gorevler, plan.bagimliliklar, drag.id, hedef.baslangicDk + snapDelta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, snapDelta, plan.gorevler, plan.bagimliliklar]);
  const kayanSayisi = onizleme ? [...onizleme.keys()].filter((k) => k !== drag?.id).length : 0;
  /** Etkin başlangıç: sürükleme önizlemesi > optimistik > sunucu değeri */
  const efBas = (g: PlanGorev): number => onizleme?.get(g.id) ?? optBas.get(g.id) ?? g.baslangicDk;

  // HOVER ZİNCİRİ: imleç bir bloğun üzerindeyken onun tüm bağımlılık zinciri
  // (yukarı + aşağı, geçişli) aydınlık kalır; ilgisiz her şey söner.
  const [hoverId, setHoverId] = useState<string | null>(null);
  const etkinHover = hoverId ?? hoverDisId; // dış bileşenler de zinciri yakabilir
  const zincir = useMemo(() => {
    if (!etkinHover) return null;
    const ileri = new Map<string, string[]>();
    const geri = new Map<string, string[]>();
    for (const d of plan.bagimliliklar) {
      (ileri.get(d.oncekiId) ?? ileri.set(d.oncekiId, []).get(d.oncekiId)!).push(d.sonrakiId);
      (geri.get(d.sonrakiId) ?? geri.set(d.sonrakiId, []).get(d.sonrakiId)!).push(d.oncekiId);
    }
    const set = new Set<string>([etkinHover]);
    const gez = (yon: Map<string, string[]>) => {
      const kuyruk = [etkinHover];
      while (kuyruk.length) {
        for (const n of yon.get(kuyruk.pop()!) ?? []) if (!set.has(n)) { set.add(n); kuyruk.push(n); }
      }
    };
    gez(ileri);
    gez(geri);
    return set;
  }, [etkinHover, plan.bagimliliklar]);

  // Tooltip için öncül/ardıl AD listeleri (tek bakışta bağlam)
  const bagAd = useMemo(() => {
    const adOf = (id: string) => gorevById.get(id)?.ad ?? id;
    const onculler = new Map<string, string[]>();
    const ardillar = new Map<string, string[]>();
    for (const d of plan.bagimliliklar) {
      (ardillar.get(d.oncekiId) ?? ardillar.set(d.oncekiId, []).get(d.oncekiId)!).push(adOf(d.sonrakiId));
      (onculler.get(d.sonrakiId) ?? onculler.set(d.sonrakiId, []).get(d.sonrakiId)!).push(adOf(d.oncekiId));
    }
    return { onculler, ardillar };
  }, [plan.bagimliliklar, gorevById]);

  // SAĞ KENARDAN BOYUTLANDIRMA (süre değiştirme)
  const [boyut, setBoyut] = useState<{ id: string; dw: number } | null>(null);
  const boyutRef = useRef(boyut);
  boyutRef.current = boyut;
  useEffect(() => {
    if (!boyut) return;
    let sx0: number | null = null;
    let sonDw = 0;
    let rafB = false;
    const move = (e: PointerEvent) => {
      if (sx0 == null) sx0 = e.clientX;
      sonDw = e.clientX - sx0;
      movedRef.current = true;
      if (rafB) return;
      rafB = true;
      requestAnimationFrame(() => {
        rafB = false;
        setBoyut((b) => (b ? { ...b, dw: sonDw } : b));
      });
    };
    const up = () => {
      const b = boyutRef.current;
      if (b && onSureDegis) {
        const g = gorevByIdRef.current.get(b.id);
        const delta = Math.round(b.dw / scale / 5) * 5;
        if (g && delta !== 0) {
          const yeniSure = Math.max(5, g.sureDk + delta);
          setOptSure((m) => new Map(m).set(b.id, yeniSure)); // optimistik süre
          const geriAl = () =>
            setOptSure((m) => {
              const n = new Map(m);
              n.delete(b.id);
              return n;
            });
          Promise.resolve(onSureDegis(b.id, yeniSure))
            .then((ok) => {
              if (ok === false) geriAl();
            })
            .catch(geriAl);
        }
      }
      setBoyut(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [boyut?.id, scale, onSureDegis]);

  // TIKLA-BAĞLA bağımlılık modu: kaynak porta tıkla → hedef bloğa tıkla (Esc iptal)
  const [linkKaynak, setLinkKaynak] = useState<string | null>(null);
  useEffect(() => {
    if (!linkKaynak) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setLinkKaynak(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [linkKaynak]);

  // ? yardım popover'ı (etkileşim rehberi + işaret anahtarı)
  const [yardimAnchor, setYardimAnchor] = useState<HTMLElement | null>(null);
  // SAĞ TIK bağlam menüsü
  const [menu, setMenu] = useState<{ x: number; y: number; g: PlanGorev } | null>(null);
  const [onayBekle, setOnayBekle] = useState(false); // Onayla iki-aşama (yanlış tık koruması)
  // Ok (bağımlılık) tıklama menüsü
  const [menuBag, setMenuBag] = useState<{ x: number; y: number; d: Bagimlilik } | null>(null);
  // HOVER CROSSHAIR — PERFORMANS: React state YOK; mousemove doğrudan DOM'a
  // yazar (satır başına sıfır re-render, 60fps akıcı)
  const kilavuzRef = useRef<HTMLDivElement | null>(null);
  const kilavuzYaziRef = useRef<HTMLSpanElement | null>(null);
  // ok hover vurgusu (keşfedilebilirlik: üzerine gelince ok parlar)
  const [okHover, setOkHover] = useState<number | null>(null);
  // Ctrl+tekerlek zoom (pasif-olmayan dinleyici gerekir) — bileşen-içi
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // PAN (kanvası kaydırarak gezinme) — tasarım aracı deseni: Space basılıyken
  // sol tuşla VEYA her zaman orta tuşla sürükle. Capture fazında yakalanır ki
  // blok sürüklemesi başlamasın; imleç grab/grabbing ile modu belli eder.
  const [spacePan, setSpacePan] = useState(false);
  const spacePanRef = useRef(false);
  spacePanRef.current = spacePan;
  const [panDrag, setPanDrag] = useState(false);
  const panRef = useRef<{ x0: number; y0: number; sl0: number; st0: number; dikey: HTMLElement | null } | null>(null);
  useEffect(() => {
    const asagi = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'SELECT' || t.isContentEditable) return;
      e.preventDefault(); // Space sayfayı kaydırmasın
      setSpacePan(true);
    };
    const yukari = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePan(false);
    };
    const birak = () => setSpacePan(false);
    window.addEventListener('keydown', asagi);
    window.addEventListener('keyup', yukari);
    window.addEventListener('blur', birak);
    return () => {
      window.removeEventListener('keydown', asagi);
      window.removeEventListener('keyup', yukari);
      window.removeEventListener('blur', birak);
    };
  }, []);
  const panBaslat = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    // dikey kaydırma bu bileşende değil, en yakın kaydırılabilir atada olabilir
    let dikey: HTMLElement | null = el;
    while (dikey && !(dikey.scrollHeight > dikey.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(dikey).overflowY)))
      dikey = dikey.parentElement;
    panRef.current = { x0: e.clientX, y0: e.clientY, sl0: el.scrollLeft, st0: dikey?.scrollTop ?? 0, dikey };
    setPanDrag(true);
    if (kilavuzRef.current) kilavuzRef.current.style.display = 'none';
    const move = (ev: MouseEvent) => {
      const pn = panRef.current;
      const sc = scrollRef.current;
      if (!pn || !sc) return;
      sc.scrollLeft = pn.sl0 - (ev.clientX - pn.x0);
      if (pn.dikey) pn.dikey.scrollTop = pn.st0 - (ev.clientY - pn.y0);
    };
    const up = () => {
      panRef.current = null;
      setPanDrag(false);
      window.removeEventListener('mousemove', move);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, { once: true });
  };
  const ZOOM_ADIM = [1, 1.5, 2, 3, 4, 6, 8];
  // İmleç-merkezli zoom: odakPx (kanvas-içi x) sabit kalacak şekilde scrollLeft telafisi
  const zoomYap = (yon: 1 | -1, odakClientX?: number) => {
    const el = scrollRef.current;
    setScale((s) => {
      const aday = yon === 1 ? ZOOM_ADIM.filter((z) => z > s) : ZOOM_ADIM.filter((z) => z < s);
      const yeni = aday.length ? (yon === 1 ? Math.min(...aday) : Math.max(...aday)) : s;
      if (el && yeni !== s) {
        const rect = el.getBoundingClientRect();
        const px = (odakClientX ?? rect.left + rect.width / 2) - rect.left + el.scrollLeft;
        const dk = px / s; // ölçekten bağımsız zaman konumu
        requestAnimationFrame(() => {
          el.scrollLeft = dk * yeni - ((odakClientX ?? rect.left + rect.width / 2) - rect.left);
        });
      }
      return yeni;
    });
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomYap(e.deltaY < 0 ? 1 : -1, e.clientX); // imleç altındaki dk sabit
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  // OPTİMİSTİK KONUM/SÜRE: bırakılan blok (ve zinciri) ANINDA yeni yerinde kalır;
  // sunucu reddeder/hata verirse eski konumuna döner (hata sayfada gösterilir).
  const [optBas, setOptBas] = useState<Map<string, number>>(new Map());
  const [optSure, setOptSure] = useState<Map<string, number>>(new Map());
  // sunucu durumu yetişince (refetch) optimistik kayıtlar temizlenir
  useEffect(() => {
    setOptBas((m) => {
      if (!m.size) return m;
      const n = new Map(m);
      for (const [id, v] of m) {
        const g = gorevById.get(id);
        if (!g || g.baslangicDk === v) n.delete(id);
      }
      return n.size === m.size ? m : n;
    });
    setOptSure((m) => {
      if (!m.size) return m;
      const n = new Map(m);
      for (const [id, v] of m) {
        const g = gorevById.get(id);
        if (!g || g.sureDk === v) n.delete(id);
      }
      return n.size === m.size ? m : n;
    });
  }, [gorevById]);

  // ŞİMDİ çizgisi — canlı ilerlesin diye periyodik tik
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setSimdi(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const nowDk = plan.hEsRefISO ? Math.round((simdi - Date.parse(plan.hEsRefISO)) / 60000) : null;
  const nowGorunur = nowDk != null && nowDk >= tMin && nowDk <= tMax;

  const ticks: number[] = [];
  for (let t = tMin; t <= tMax; t += 30) ticks.push(t);
  const bodyH = yerlesim.bodyH;
  // Çift cetvel (Kairos): H±  + duvar saati (UTC) — hEsRefISO varsa
  const dtg = (dk: number): string | null => {
    if (!plan.hEsRefISO) return null;
    const t = new Date(Date.parse(plan.hEsRefISO) + dk * 60000);
    return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}Z`;
  };
  const headH = plan.hEsRefISO ? 44 : HEADER_H;

  // PLAYBACK TAKİBİ: imleç görünüm bandının (%15–%70) dışına çıkınca kaydırma
  // onu izler (timeline editör davranışı) — elle kaydırmayla kavga etmez.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || playheadDk == null) return;
    const px = (playheadDk - tMin) * scale;
    const w = el.clientWidth;
    if (px < el.scrollLeft + w * 0.15 || px > el.scrollLeft + w * 0.7) {
      el.scrollLeft = Math.max(0, px - w * 0.3);
    }
  }, [playheadDk, scale, tMin]);

  // SEÇİME KAYDIR: başka bir bileşen (kritik yol, harita, tehdit tablosu) bir
  // görevi seçtiğinde blok görünür banda getirilir (bileşenler konuşur)
  useEffect(() => {
    if (!seciliId) return;
    const el = scrollRef.current;
    const g = gorevById.get(seciliId);
    if (!el || !g) return;
    const px = (g.baslangicDk - tMin) * scale;
    if (px < el.scrollLeft + 40 || px > el.scrollLeft + el.clientWidth - 80)
      el.scrollLeft = Math.max(0, px - el.clientWidth * 0.35);
  }, [seciliId, gorevById, tMin, scale]);

  // Sığdır: tüm plan görünür genişliğe
  const sigdir = () => {
    const w = scrollRef.current?.clientWidth ?? 1000;
    setScale(Math.max(0.5, Math.min(8, (w - 30) / Math.max(30, tMax - tMin))));
  };

  const kontrolIkon = { color: K.metinIkincil, p: 0.5, '&:hover': { color: K.metin }, '&.Mui-disabled': { color: 'rgba(124,141,176,.3)' } };
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        borderRadius: 1.5,
        overflow: 'hidden',
        bgcolor: K.kanvas,
        border: `1px solid ${K.ayrac}`,
        boxShadow: 'inset 0 0 60px rgba(0,0,0,.35)',
      }}
    >
      {/* BİLEŞEN-İÇİ KONTROLLER: zoom/sığdır + geri-ileri (yeniden kullanılabilir) */}
      <Box
        sx={{
          position: 'absolute',
          top: 48, // cetvelin ALTINDA — tik etiketlerini örtmez
          right: 10,
          zIndex: 9,
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'rgba(11,18,32,.88)',
          border: `1px solid ${K.ayrac}`,
          borderRadius: 1,
          px: 0.25,
        }}
      >
        <Tooltip title="Uzaklaş (Ctrl+tekerlek)"><IconButton size="small" sx={kontrolIkon} onClick={() => zoomYap(-1)}><ZoomOutIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
        <Tooltip title="Yakınlaş"><IconButton size="small" sx={kontrolIkon} onClick={() => zoomYap(1)}><ZoomInIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
        <Tooltip title="Planı sığdır"><IconButton size="small" sx={kontrolIkon} onClick={sigdir}><FitScreenIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
        <Tooltip title="Kaydır (pan) — ya da Space+sürükle / orta tuş">
          <IconButton
            size="small"
            sx={{ ...kontrolIkon, ...(spacePan ? { color: K.playhead } : {}) }}
            onClick={() => setSpacePan((v) => !v)}
          >
            <PanToolIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
        {onRenkMod && (
          <Tooltip title={renkMod === 'tur' ? 'Renk: Görev tipi → Domain' : 'Renk: Domain → Görev tipi'}>
            <IconButton size="small" sx={kontrolIkon} onClick={() => onRenkMod(renkMod === 'tur' ? 'domain' : 'tur')}>
              <Box component="span" sx={{ fontSize: 13, fontWeight: 800, fontFamily: K.mono, color: renkMod === 'tur' ? K.playhead : undefined }}>
                {renkMod === 'tur' ? 'T' : 'D'}
              </Box>
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Etkileşim rehberi">
          <IconButton size="small" sx={kontrolIkon} onClick={(e) => setYardimAnchor(e.currentTarget)}>
            <Box component="span" sx={{ fontSize: 13, fontWeight: 800 }}>?</Box>
          </IconButton>
        </Tooltip>
        {(onGeri || onIleri) && <Box sx={{ width: 1, height: 16, bgcolor: K.ayrac, mx: 0.25 }} />}
        {onGeri && (
          <Tooltip title="Geri al (Ctrl+Z)"><span><IconButton size="small" sx={kontrolIkon} disabled={!gecmis?.geri} onClick={onGeri}><UndoIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
        )}
        {onIleri && (
          <Tooltip title="İleri al (Ctrl+Shift+Z)"><span><IconButton size="small" sx={kontrolIkon} disabled={!gecmis?.ileri} onClick={onIleri}><RedoIcon sx={{ fontSize: 16 }} /></IconButton></span></Tooltip>
        )}
      </Box>
      {/* SOL: bölüm başlıkları (katlanabilir) + varlık etiketleri */}
      <Box sx={{ width: LABEL_W, flexShrink: 0, borderRight: `1px solid ${K.ayrac}`, bgcolor: K.panel }}>
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 6,
            height: headH,
            px: 1.5,
            display: 'flex',
            alignItems: 'center',
            bgcolor: K.cetvel,
            borderBottom: `1px solid ${K.ayrac}`,
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 800, color: K.metinIkincil, letterSpacing: 1, fontFamily: K.mono, fontSize: 10 }}>
            VARLIK / GÖREV
          </Typography>
        </Box>
        {rows.map((r, i) => {
          const bolumBasi = i === 0 || rows[i - 1].domain !== r.domain;
          const katli = kapali.has(r.domain);
          return (
            <Box key={r.key}>
              {bolumBasi && (
                <Box
                  onClick={() => bolumToggle(r.domain)}
                  sx={{
                    height: BOLUM_H,
                    px: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    bgcolor: K.bant,
                    borderBottom: `1px solid ${K.ayrac}`,
                    borderLeft: `3px solid ${DOMAIN_RENK[r.domain] ?? '#90a4ae'}`,
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background .15s',
                    '&:hover': { bgcolor: '#1b2b4a' },
                  }}
                >
                  <Box component="span" sx={{ fontSize: 9, color: K.bantMetin }}>
                    {katli ? '▶' : '▼'}
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: K.bantMetin, fontFamily: K.mono, fontSize: 10 }}
                  >
                    {r.domain}
                  </Typography>
                  <Typography variant="caption" sx={{ color: K.metinIkincil, fontSize: 10 }}>
                    ({yerlesim.bolumSayi.get(r.domain) ?? 0})
                  </Typography>
                </Box>
              )}
              {!katli && (
                <Box
                  onDragOver={(e) => {
                    // yalnız aynı bölüm (domain) içinde taşınabilir
                    if (surSatir && surSatir !== r.key && rows.find((x) => x.key === surSatir)?.domain === r.domain) {
                      e.preventDefault();
                      setHedefSatir(r.key);
                    }
                  }}
                  onDragLeave={() => setHedefSatir((h) => (h === r.key ? null : h))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!surSatir || surSatir === r.key || !onSatirTasi) return;
                    const keys = rows.map((x) => x.key);
                    keys.splice(keys.indexOf(surSatir), 1);
                    keys.splice(keys.indexOf(r.key), 0, surSatir);
                    onSatirTasi(keys);
                    setSurSatir(null);
                    setHedefSatir(null);
                  }}
                  onDragEnd={() => {
                    setSurSatir(null);
                    setHedefSatir(null);
                  }}
                  sx={{
                    position: 'relative',
                    height: yerlesim.rowH.get(r.key),
                    px: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    borderBottom: `1px solid ${K.ayrac}`,
                    borderLeft: `4px solid ${DOMAIN_RENK[r.domain] ?? '#90a4ae'}`,
                    opacity: surSatir === r.key ? 0.45 : 1,
                    boxShadow: hedefSatir === r.key ? `inset 0 3px 0 ${K.playhead}` : undefined,
                    transition: 'background .15s',
                    '&:hover': { bgcolor: 'rgba(56,189,248,0.06)' },
                    '&:hover .satir-grip': { opacity: 0.9 },
                  }}
                >
                  {/* GRIP: taşınabilirlik göstergesi — yalnız buradan sürüklenir */}
                  {onSatirTasi && (
                    <Box
                      className="satir-grip"
                      draggable
                      onDragStart={(e) => {
                        setSurSatir(r.key);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      title="Sürükle: satırı aynı bölümde taşı"
                      sx={{
                        position: 'absolute',
                        right: 2,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        cursor: 'grab',
                        opacity: 0.25,
                        transition: 'opacity .15s',
                        display: 'flex',
                        color: K.metinIkincil,
                        '&:active': { cursor: 'grabbing' },
                      }}
                    >
                      <DragIndicatorIcon sx={{ fontSize: 16 }} />
                    </Box>
                  )}
                  {r.varlikId && onVarlik ? (
                    <Typography
                      variant="body2"
                      onClick={() => onVarlik(r.varlikId!)}
                      sx={{
                        fontWeight: 700,
                        cursor: 'pointer',
                        color: '#7dd3fc',
                        '&:hover': { textDecoration: 'underline' },
                        lineHeight: 1.15,
                        fontFamily: K.mono,
                        fontSize: 13,
                      }}
                      noWrap
                    >
                      {r.label}
                    </Typography>
                  ) : (
                    <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.15, color: K.metin, fontFamily: K.mono, fontSize: 13 }} noWrap>
                      {r.label}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ color: K.metinIkincil, fontSize: 10 }} noWrap>
                    {r.domain}
                  </Typography>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* SAĞ: zaman çizelgesi (yatay kaydırmalı; Ctrl+tekerlek = zoom) */}
      <Box
        ref={scrollRef}
        onMouseDownCapture={(e) => {
          if (e.button === 1 || (e.button === 0 && spacePanRef.current)) {
            e.preventDefault();
            e.stopPropagation();
            panBaslat(e);
          }
        }}
        sx={{ flex: 1, overflowX: 'auto', position: 'relative', cursor: panDrag ? 'grabbing' : spacePan ? 'grab' : undefined }}
      >
        <Box sx={{ width: timelineW, position: 'relative' }}>
          {/* cetvel başlığı — çift satır: H± + duvar saati (UTC) */}
          <Box
            sx={{
              height: headH,
              position: 'sticky',
              top: 0,
              zIndex: 6,
              bgcolor: K.cetvel,
              borderBottom: `1px solid ${K.ayrac}`,
            }}
          >
            {ticks.map((t) => (
              <Box
                key={t}
                sx={{
                  position: 'absolute',
                  left: x(t),
                  top: 0,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: 'translateX(-50%)',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: t === 0 ? K.simdi : K.metinIkincil,
                    fontWeight: t === 0 ? 800 : 600,
                    lineHeight: 1.2,
                    fontFamily: K.mono,
                    fontSize: 11,
                  }}
                >
                  {t === 0 ? 'H' : fmtH(t)}
                </Typography>
                {dtg(t) && (
                  <Typography variant="caption" sx={{ fontSize: 10, color: 'rgba(124,141,176,.75)', lineHeight: 1.1, fontFamily: K.mono }}>
                    {dtg(t)}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>

          {/* gövde — boş alana ÇİFT TIK: o satır/o anda yeni görev */}
          <Box
            sx={{ position: 'relative', height: bodyH }}
            onMouseMove={(e) => {
              // React'e uğramadan DOM'a yaz — akıcılık için kritik
              const el = kilavuzRef.current;
              if (!el) return;
              if (dragRef.current || boyutRef.current || panRef.current) {
                el.style.display = 'none';
                return;
              }
              const rect = e.currentTarget.getBoundingClientRect();
              const dk = Math.round(tMin + (e.clientX - rect.left) / scale);
              el.style.display = 'block';
              el.style.left = `${(dk - tMin) * scale}px`;
              if (kilavuzYaziRef.current)
                kilavuzYaziRef.current.textContent = `${fmtH(dk)}${dtg(dk) ? ` · ${dtg(dk)}` : ''}`;
            }}
            onMouseLeave={() => {
              if (kilavuzRef.current) kilavuzRef.current.style.display = 'none';
            }}
            onClick={() => {
              if (linkKaynak) setLinkKaynak(null); // boş kanvasa tık → bağlantı modundan çık
            }}
            onDoubleClick={(e) => {
              if (!onBoslukCiftTik) return;
              if ((e.target as HTMLElement).closest('[role="button"]')) return; // blok çift tıkı değil
              const rect = e.currentTarget.getBoundingClientRect();
              const dk = Math.round((tMin + (e.clientX - rect.left) / scale) / 5) * 5;
              const ypx = e.clientY - rect.top;
              const satir = rows.find((r) => {
                const t = yerlesim.rowTop.get(r.key);
                const h = yerlesim.rowH.get(r.key);
                return t != null && h != null && ypx >= t && ypx < t + h;
              });
              onBoslukCiftTik(satir?.varlikId, dk);
            }}
          >
            {/* dikey ızgara */}
            {ticks.map((t) => (
              <Box
                key={t}
                sx={{
                  position: 'absolute',
                  left: x(t),
                  top: 0,
                  bottom: 0,
                  borderLeft: `1px solid ${t === 0 ? 'rgba(255,59,75,.35)' : K.izgara}`,
                }}
              />
            ))}
            {/* bölüm bantları (sağ tarafta da) */}
            {[...yerlesim.bolumTop.entries()].map(([d, top]) => (
              <Box
                key={`b-${d}`}
                sx={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top,
                  height: BOLUM_H,
                  bgcolor: K.bant,
                  borderBottom: `1px solid ${K.ayrac}`,
                  opacity: 0.75,
                }}
              />
            ))}
            {/* satır ayraçları (yalnız görünür satırlar) */}
            {rows
              .filter((r) => yerlesim.rowTop.has(r.key))
              .map((r) => (
                <Box
                  key={r.key}
                  sx={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: (yerlesim.rowTop.get(r.key) ?? 0) + (yerlesim.rowH.get(r.key) ?? 0) - 1,
                    borderBottom: `1px solid ${K.ayrac}`,
                  }}
                />
              ))}

            {/* bağımlılık okları */}
            <svg width={timelineW} height={bodyH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <defs>
                <marker id="ok" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" fill="#607d8b" />
                </marker>
                <marker id="okKritik" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" fill="#d32f2f" />
                </marker>
              </defs>
              {plan.bagimliliklar.map((d, k) => {
                const p = gorevById.get(d.oncekiId);
                const s = gorevById.get(d.sonrakiId);
                if (!p || !s) return null;
                if (!yerlesim.rowTop.has(rowKeyOf(p)) || !yerlesim.rowTop.has(rowKeyOf(s)))
                  return null; // katlanmış bölümdeki uçlar çizilmez
                // FS: önceki BİTİŞ → sonraki BAŞLANGIÇ; SS: önceki BAŞLANGIÇ → sonraki BAŞLANGIÇ
                // (sürükleme önizlemesi varsa oklar da birlikte akar)
                const x1 = x(d.tur === 'SS' ? efBas(p) : efBas(p) + p.sureDk);
                const y1 = blockCy(p);
                const x2 = x(efBas(s));
                const y2 = blockCy(s);
                const kritik = cpm.hesaplar[p.id]?.kritik && cpm.hesaplar[s.id]?.kritik;
                const zincirde = !zincir || (zincir.has(p.id) && zincir.has(s.id));
                const mx = (x1 + x2) / 2;
                const yol = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 8} ${y2}`;
                return (
                  <g key={k}>
                    {/* görünmez geniş vuruş: oka TIKLA → bağımlılık menüsü */}
                    {onBagimlilikSil && (
                      <path
                        d={yol}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={12}
                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                        onMouseEnter={() => setOkHover(k)}
                        onMouseLeave={() => setOkHover((o) => (o === k ? null : o))}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuBag({ x: e.clientX, y: e.clientY, d });
                        }}
                      />
                    )}
                  <path
                    d={yol}
                    fill="none"
                    stroke={okHover === k ? K.playhead : kritik ? '#ff5252' : zincir && zincirde ? K.playhead : K.ok}
                    strokeWidth={okHover === k ? 2.4 : kritik ? 2 : zincir && zincirde ? 1.8 : 1.3}
                    strokeDasharray={d.tur === 'SS' ? '4 3' : undefined}
                    markerEnd={`url(#${kritik ? 'okKritik' : 'ok'})`}
                    opacity={zincirde ? 0.9 : 0.12}
                  >
                    <title>
                      {p.ad} → {s.ad} ({d.tur === 'SS' ? 'birlikte başlar' : 'bitince başlar'}
                      {d.gecikmeDk ? `, ${d.gecikmeDk > 0 ? '+' : ''}${d.gecikmeDk}dk` : ''})
                    </title>
                  </path>
                  </g>
                );
              })}
            </svg>

            {/* baz plan hayaleti (senaryo) */}
            {bazGorevler?.map((bg) => {
              const cur = gorevById.get(bg.id);
              if (!cur || cur.baslangicDk === bg.baslangicDk) return null;
              if (!yerlesim.rowTop.has(rowKeyOf(cur))) return null;
              const kilometre = bg.tur === 'kilometre_tasi' || bg.sureDk === 0;
              return (
                <Tooltip key={`hayalet-${bg.id}`} title={`Baz plan konumu: ${fmtH(bg.baslangicDk)}`}>
                  <Box
                    sx={{
                      position: 'absolute',
                      left: x(bg.baslangicDk),
                      top: blockTop(cur),
                      height: BLOCK_H,
                      width: kilometre ? BLOCK_H : Math.max(bg.sureDk * scale, 8),
                      border: '1.5px dashed #9e9e9e',
                      borderRadius: 0.75,
                      bgcolor: 'rgba(158,158,158,0.10)',
                      zIndex: 1,
                      pointerEvents: 'none',
                    }}
                  />
                </Tooltip>
              );
            })}

            {/* görev blokları */}
            {plan.gorevler.map((g) => {
              if (!yerlesim.rowTop.has(rowKeyOf(g))) return null; // katlanmış bölüm
              const kritik = cpm.hesaplar[g.id]?.kritik;
              const dx = drag?.id === g.id ? drag.dx : 0;
              const kilometre = g.tur === 'kilometre_tasi' || g.sureDk === 0;
              const renk =
                renkMod === 'tur'
                  ? (TUR_RENK[g.tur] ?? '#607d8b')
                  : (DOMAIN_RENK[g.domain] ?? '#607d8b');
              const secili = seciliId === g.id;
              const cakisan = cakisanIdler.has(g.id);
              // playback imleci bu görevin üzerindeyse parlat
              const oynayan =
                playheadDk != null &&
                g.baslangicDk <= playheadDk &&
                playheadDk < g.baslangicDk + Math.max(1, g.sureDk);
              // Zincir önizlemesi: sürüklenen DEĞİL ama etkilenen blok → yeni yerine akar
              const onizBas = drag && drag.id !== g.id ? onizleme?.get(g.id) : undefined;
              // optimistik değerler (bırakıştan sunucu onayına dek yeni yerde kal)
              const optB = optBas.get(g.id);
              const efSure = optSure.get(g.id) ?? g.sureDk;
              // boyutlandırma önizlemesi: sağ kenar çekilirken genişlik canlı değişir
              const dwPx = boyut?.id === g.id ? boyut.dw : 0;
              const w = Math.max(efSure * scale + dwPx, kilometre ? 0 : 8);
              return (
                <Tooltip
                  key={g.id}
                  arrow
                  enterDelay={350}
                  disableHoverListener={!!drag || !!boyut || !!linkKaynak}
                  slotProps={{ tooltip: { sx: { maxWidth: 340, p: 0, bgcolor: 'transparent', pointerEvents: 'none' } } }}
                  title={hoverId !== g.id ? '' : ( // PERFORMANS: kart yalnız hover'da kurulur
                    <Box sx={{ bgcolor: '#141f35', border: `1px solid ${K.ayrac}`, borderRadius: 1, p: 1.25, boxShadow: 6 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.5 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: renk, flexShrink: 0 }} />
                        <Typography variant="body2" sx={{ fontWeight: 800, color: K.metin, lineHeight: 1.2 }}>
                          {g.gorevNo ? `${g.gorevNo} · ` : ''}{g.ad}
                        </Typography>
                      </Stack>
                      {(g.cagriAdi || g.kontrolMakami || g.frekans) && (
                        <Typography variant="caption" sx={{ color: K.metinIkincil, fontFamily: K.mono, display: 'block', fontSize: 10 }}>
                          {[g.cagriAdi && `📻 ${g.cagriAdi}`, g.kontrolMakami, g.frekans].filter(Boolean).join(' · ')}
                        </Typography>
                      )}
                      <Typography variant="caption" sx={{ color: K.playhead, fontFamily: K.mono, display: 'block' }}>
                        {fmtH(g.baslangicDk)} → {fmtH(g.baslangicDk + g.sureDk)} · {g.sureDk} dk
                        {dtg(g.baslangicDk) ? ` · ${dtg(g.baslangicDk)}` : ''}
                      </Typography>
                      <Stack direction="row" spacing={0.5} sx={{ my: 0.5, flexWrap: 'wrap' }} useFlexGap>
                        <Chip size="small" label={g.durum.toUpperCase()} sx={{ height: 16, fontSize: 9, fontWeight: 700, bgcolor: g.durum === 'gecikme' ? '#7c2d12' : g.durum === 'onayli' ? '#14532d' : '#1e293b', color: '#fff' }} />
                        {g.varlikAd && <Chip size="small" label={g.varlikAd} sx={{ height: 16, fontSize: 9, bgcolor: '#1e293b', color: '#7dd3fc', fontFamily: K.mono }} />}
                        {kritik ? (
                          <Chip size="small" label="KRİTİK YOL" sx={{ height: 16, fontSize: 9, fontWeight: 800, bgcolor: '#7f1d1d', color: '#fff' }} />
                        ) : (
                          <Chip size="small" label={`bolluk ${Math.round(cpm.hesaplar[g.id]?.bolluk ?? 0)}dk`} sx={{ height: 16, fontSize: 9, bgcolor: '#1e293b', color: K.metinIkincil }} />
                        )}
                        {cakisan && <Chip size="small" label="⚠ ÇAKIŞMA" sx={{ height: 16, fontSize: 9, fontWeight: 700, bgcolor: '#7c2d12', color: '#fed7aa' }} />}
                        {g.oncelik != null && (
                          <Chip size="small" label={`P${g.oncelik}`} sx={{ height: 16, fontSize: 9, fontWeight: 800, bgcolor: g.oncelik <= 2 ? '#7f1d1d' : '#1e293b', color: g.oncelik <= 2 ? '#fecaca' : K.metinIkincil }} />
                        )}
                        {g.istenenEtki && (
                          <Chip size="small" label={ETKI_AD[g.istenenEtki] ?? g.istenenEtki} sx={{ height: 16, fontSize: 9, bgcolor: '#1e293b', color: '#c4b5fd' }} />
                        )}
                      </Stack>
                      {(g.muhimmat || g.hedefKonum || g.konum) && (
                        <Typography variant="caption" sx={{ display: 'block', color: K.metinIkincil, fontSize: 10 }}>
                          {g.muhimmat ? `⚙ ${g.muhimmat}` : ''}
                          {g.hedefKonum ? `${g.muhimmat ? ' · ' : ''}🎯 ${g.hedefKonum.enlem.toFixed(3)}, ${g.hedefKonum.boylam.toFixed(3)}` : ''}
                          {!g.hedefKonum && g.konum ? `${g.muhimmat ? ' · ' : ''}📍 ${g.konum.enlem.toFixed(3)}, ${g.konum.boylam.toFixed(3)}${g.bolgeYaricapKm ? ` (r=${g.bolgeYaricapKm}km)` : ''}` : ''}
                        </Typography>
                      )}
                      {(bagAd.onculler.get(g.id)?.length || bagAd.ardillar.get(g.id)?.length) ? (
                        <Box sx={{ borderTop: `1px solid ${K.ayrac}`, pt: 0.5, mt: 0.25 }}>
                          {bagAd.onculler.get(g.id)?.length ? (
                            <Typography variant="caption" sx={{ display: 'block', color: K.metinIkincil, fontSize: 10 }}>
                              ⬅ önce: {kirpAd(bagAd.onculler.get(g.id)!)}
                            </Typography>
                          ) : null}
                          {bagAd.ardillar.get(g.id)?.length ? (
                            <Typography variant="caption" sx={{ display: 'block', color: K.metinIkincil, fontSize: 10 }}>
                              ➡ sonra: {kirpAd(bagAd.ardillar.get(g.id)!)}
                            </Typography>
                          ) : null}
                        </Box>
                      ) : null}
                      {g.gerekce && (
                        <Typography variant="caption" sx={{ display: 'block', color: K.metinIkincil, fontSize: 10, mt: 0.25, fontStyle: 'italic' }}>
                          {g.gerekce}
                        </Typography>
                      )}
                    </Box>
                  )}
                >
                  <Box
                    role="button"
                    tabIndex={0}
                    aria-label={`${g.ad}, ${g.domain}, ${fmtH(g.baslangicDk)}, ${g.durum}`}
                    onPointerDown={(e) => {
                      // Space-pan / orta tuş / sağ tık: blok sürüklemesini BAŞLATMA
                      // (aksi halde pan sırasında kazara plan mutasyonu commit'lenir)
                      if (e.button !== 0 || spacePanRef.current) return;
                      e.preventDefault();
                      movedRef.current = false;
                      setDrag({ id: g.id, dx: 0 });
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, g });
                    }}
                    onClick={() => {
                      if (movedRef.current) {
                        movedRef.current = false;
                        return;
                      }
                      // bağlantı modu: hedef bloğun HERHANGİ bir yerine tıkla → kur
                      if (linkKaynak) {
                        if (linkKaynak !== g.id) onBagimlilikEkle?.(linkKaynak, g.id);
                        setLinkKaynak(null);
                        return;
                      }
                      onGorevClick?.(g);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onGorevClick?.(g);
                      } else if (e.key === 'ArrowRight') {
                        e.preventDefault();
                        onKaydir(g.id, g.baslangicDk + 5);
                      } else if (e.key === 'ArrowLeft') {
                        e.preventDefault();
                        onKaydir(g.id, g.baslangicDk - 5);
                      }
                    }}
                    onMouseEnter={() => {
                      setHoverId(g.id);
                      onGorevHover?.(g.id);
                    }}
                    onMouseLeave={() => {
                      setHoverId((h) => (h === g.id ? null : h));
                      onGorevHover?.(null);
                    }}
                    sx={{
                      position: 'absolute',
                      left: onizBas != null ? x(onizBas) : x(optB ?? g.baslangicDk) + dx,
                      top: blockTop(g),
                      height: BLOCK_H,
                      width: kilometre ? BLOCK_H : w,
                      cursor: 'grab',
                      touchAction: 'none',
                      zIndex: drag?.id === g.id ? 5 : 2,
                      transition:
                        drag?.id === g.id
                          ? 'none'
                          : onizBas != null
                            ? 'left .15s ease' // canlı zincir akışı
                            : 'left .28s ease, width .28s ease',
                      // hover zinciri: ilgisiz bloklar söner; kendi zinciri aydınlık
                      opacity: zincir && !zincir.has(g.id) ? 0.22 : onizBas != null ? 0.88 : 1,
                      '&:hover': { transform: 'translateY(-1px)' },
                      '&:focus-visible': { outline: `2px solid ${K.playhead}`, outlineOffset: 2 },
                    }}
                  >
                    {kilometre ? (
                      <Box
                        sx={{
                          width: BLOCK_H * 0.7,
                          height: BLOCK_H * 0.7,
                          bgcolor: kritik ? '#d32f2f' : renk,
                          transform: 'rotate(45deg)',
                          mt: '4px',
                          ml: '-8px',
                          border: secili ? '2px solid #000' : undefined,
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          height: '100%',
                          borderRadius: 0.75,
                          px: 0.75,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          bgcolor: g.durum === 'tamam' ? 'grey.500' : renk,
                          color: '#fff',
                          border: kritik ? '2px solid #d32f2f' : secili ? '2px solid #000' : '2px solid transparent',
                          outline: cakisan
                            ? '2px dashed #ed6c02'
                            : onizBas != null
                              ? '1.5px dashed #1976d2' // önizlemede kayan adım
                              : undefined,
                          outlineOffset: cakisan || onizBas != null ? 1 : undefined,
                          boxShadow: oynayan
                            ? '0 0 0 3px rgba(56,189,248,.55)'
                            : secili
                              ? '0 0 0 2px #e2e8f0'
                              : kritik
                                ? '0 0 12px rgba(255,82,82,.4), 0 1px 3px rgba(0,0,0,.5)'
                                : '0 1px 3px rgba(0,0,0,.5)',
                          filter: playheadDk != null && !oynayan ? 'saturate(.5) opacity(.75)' : undefined,
                          opacity: g.durum === 'iptal' ? 0.4 : 1,
                          overflow: 'hidden',
                          ...(g.durum === 'gecikme' && {
                            backgroundImage:
                              'repeating-linear-gradient(45deg, rgba(255,255,255,.25) 0 6px, transparent 6px 12px)',
                          }),
                        }}
                      >
                        <Box component="span" sx={{ fontSize: 12, lineHeight: 1 }}>
                          {TUR_IKON[g.tur] ?? '▣'}
                        </Box>
                        <Typography variant="caption" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }} noWrap>
                          {g.ad}
                        </Typography>
                        {g.durum === 'onayli' && (
                          <Box component="span" sx={{ fontSize: 11 }}>
                            ✓
                          </Box>
                        )}
                        {g.durum === 'tamam' && (
                          <Box component="span" sx={{ fontSize: 11 }}>
                            ✔✔
                          </Box>
                        )}
                        {cakisan && <WarningAmberIcon sx={{ fontSize: 13, ml: 'auto' }} />}
                      </Box>
                    )}
                    {/* SAĞ KENAR: süre boyutlandırma (küçük bloklarda yalnız seçiliyken) */}
                    {onSureDegis && !kilometre && (secili || w >= 24) && (
                      <Box
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          e.preventDefault();
                          movedRef.current = true;
                          setBoyut({ id: g.id, dw: 0 });
                        }}
                        sx={{
                          position: 'absolute',
                          right: -3,
                          top: 0,
                          width: 10,
                          height: '100%',
                          cursor: 'ew-resize',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          '&:hover > span, &:active > span': { opacity: 1 },
                        }}
                      >
                        <Box component="span" sx={{ width: 3, height: '60%', borderRadius: 1, bgcolor: '#fff', opacity: 0.35, transition: 'opacity .1s' }} />
                      </Box>
                    )}
                    {/* BAĞLANTI PORTU: tıkla → hedef bloğa tıkla (bağımlılık kur) */}
                    {onBagimlilikEkle && (hoverId === g.id || secili || linkKaynak === g.id) && (
                      <Tooltip title="Zamanlama bağı kur: hedef göreve tıkla" placement="right">
                        <Box
                          onClick={(e) => {
                            e.stopPropagation();
                            setLinkKaynak(linkKaynak === g.id ? null : g.id);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          sx={{
                            position: 'absolute',
                            right: -22,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: 20,
                            height: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'crosshair',
                            zIndex: 6,
                          }}
                        >
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: linkKaynak === g.id ? K.playhead : 'transparent',
                              border: `2px solid ${K.playhead}`,
                              boxShadow: linkKaynak === g.id ? `0 0 8px ${K.playhead}` : undefined,
                            }}
                          />
                        </Box>
                      </Tooltip>
                    )}
                  </Box>
                </Tooltip>
              );
            })}

            {/* HOVER CROSSHAIR — DOM'a doğrudan yazılır (state yok, akıcı) */}
            <Box
              ref={kilavuzRef}
              sx={{ display: 'none', position: 'absolute', top: 0, bottom: 0, zIndex: 3, pointerEvents: 'none' }}
            >
              <Box sx={{ width: 1.5, height: '100%', bgcolor: 'rgba(125,211,252,.55)', boxShadow: '0 0 6px rgba(125,211,252,.35)' }} />
              <Box
                component="span"
                ref={kilavuzYaziRef}
                sx={{
                  position: 'absolute', top: 2, left: 3, px: 0.5, borderRadius: 0.5,
                  bgcolor: 'rgba(20,31,53,.92)', border: `1px solid ${K.ayrac}`,
                  fontFamily: K.mono, fontSize: 10, color: K.metin, whiteSpace: 'nowrap',
                }}
              />
            </Box>

            {/* BAĞLANTI MODU şeridi */}
            {linkKaynak && (
              <Box
                sx={{
                  position: 'sticky', left: 8, top: 4, zIndex: 8, display: 'inline-flex',
                  px: 1, py: 0.25, borderRadius: 1, bgcolor: K.playhead, color: '#062033',
                  fontSize: 11, fontWeight: 800, boxShadow: 3, pointerEvents: 'none',
                }}
              >
                🔗 Zamanlama bağı: {gorevById.get(linkKaynak)?.ad ?? ''} → hedef göreve tıkla · Esc: iptal
              </Box>
            )}

            {/* Sürükleme Δ rozeti — bırakmadan sonucu söyler */}
            {drag && snapDelta !== 0 && suruklenen && (
              <Chip
                size="small"
                label={`Δ ${snapDelta > 0 ? '+' : ''}${snapDelta} dk${
                  kayanSayisi > 0 ? ` · ${kayanSayisi} adım birlikte kayar` : ''
                } · Esc: iptal`}
                sx={{
                  position: 'absolute',
                  left: Math.max(0, x(suruklenen.baslangicDk) + drag.dx),
                  top: Math.max(2, blockTop(suruklenen) - 22),
                  zIndex: 7,
                  pointerEvents: 'none',
                  height: 18,
                  fontSize: 10,
                  fontWeight: 700,
                  bgcolor: '#1976d2',
                  color: '#fff',
                }}
              />
            )}

            {/* PLAYBACK imleci (Kairos playback) */}
            {playheadDk != null && playheadDk >= tMin && playheadDk <= tMax && (
              <Box sx={{ position: 'absolute', left: x(playheadDk), top: 0, bottom: 0, zIndex: 4, pointerEvents: 'none' }}>
                <Box sx={{ width: 2, height: '100%', bgcolor: '#2196f3' }} />
                <Chip
                  size="small"
                  label={fmtH(playheadDk)}
                  sx={{ position: 'absolute', top: -2, left: 2, height: 16, fontSize: 9, fontWeight: 800, bgcolor: '#2196f3', color: '#fff' }}
                />
              </Box>
            )}

            {/* ŞİMDİ çizgisi */}
            {nowGorunur && (
              <Box sx={{ position: 'absolute', left: x(nowDk!), top: 0, bottom: 0, zIndex: 4, pointerEvents: 'none' }}>
                <Box
                  sx={{
                    width: 2,
                    height: '100%',
                    bgcolor: K.simdi,
                    boxShadow: `0 0 8px ${K.simdi}`,
                    animation: 'simdiNabiz 2s ease-in-out infinite',
                    '@keyframes simdiNabiz': {
                      '0%, 100%': { opacity: 0.9 },
                      '50%': { opacity: 0.45 },
                    },
                  }}
                />
                <Chip
                  size="small"
                  label="ŞİMDİ"
                  sx={{ position: 'absolute', top: -2, left: 2, height: 16, fontSize: 9, fontWeight: 800, bgcolor: K.simdi, color: '#fff', fontFamily: K.mono }}
                />
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* SAĞ TIK bağlam menüsü — durum/onay/bağımlılık/sil kanvasın içinde */}
      <Menu
        open={!!menu}
        onClose={() => { setMenu(null); setOnayBekle(false); }}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
        slotProps={{ paper: { sx: { bgcolor: '#141f35', color: K.metin, border: `1px solid ${K.ayrac}`, minWidth: 210 } } }}
      >
        <Box sx={{ px: 1.5, py: 0.5 }}>
          <Typography variant="caption" sx={{ color: K.metinIkincil, fontFamily: K.mono }} noWrap>
            {menu?.g.ad}
          </Typography>
        </Box>
        <Divider sx={{ borderColor: K.ayrac }} />
        {onDurum && (
          <MenuItem
            dense
            onClick={() => {
              if (!menu) return;
              if (!onayBekle) { setOnayBekle(true); return; } // iki aşama: yanlış tık koruması
              onDurum(menu.g.id, 'onayli');
              setMenu(null);
              setOnayBekle(false);
            }}
            sx={{ color: onayBekle ? '#fbbf24' : '#4ade80', fontWeight: 700 }}
          >
            {onayBekle ? '⚠ Emin misin? ONAYLA (icra emri gider)' : '✓ Onayla'}
          </MenuItem>
        )}
        {onDurum && <MenuItem dense onClick={() => { menu && onDurum(menu.g.id, 'icrada'); setMenu(null); }}>▶ İcraya al</MenuItem>}
        {onDurum && <MenuItem dense onClick={() => { menu && onDurum(menu.g.id, 'tamam'); setMenu(null); }}>✔✔ Tamamlandı</MenuItem>}
        {onDurum && <MenuItem dense onClick={() => { menu && onDurum(menu.g.id, 'iptal'); setMenu(null); }}>∅ İptal et</MenuItem>}
        {onBagimlilikEkle && <Divider sx={{ borderColor: K.ayrac }} />}
        {onBagimlilikEkle && (
          <MenuItem dense onClick={() => { menu && setLinkKaynak(menu.g.id); setMenu(null); }}>
            🔗 Zamanlama bağı kur…
          </MenuItem>
        )}
        {(onDuzenle ?? onGorevClick) && (
          <MenuItem dense onClick={() => { menu && (onDuzenle ?? onGorevClick)!(menu.g); setMenu(null); }}>✎ Düzenle (çekmece)</MenuItem>
        )}
        {onHaritadaGoster && <MenuItem dense onClick={() => { menu && onHaritadaGoster(menu.g); setMenu(null); }}>🗺 Haritada göster</MenuItem>}
        {onSil && <Divider sx={{ borderColor: K.ayrac }} />}
        {onSil && (
          <MenuItem dense onClick={() => { menu && onSil(menu.g.id); setMenu(null); }} sx={{ color: '#f87171' }}>
            🗑 Görevi sil
          </MenuItem>
        )}
      </Menu>

      {/* OK menüsü — bağımlılık detay/kaldırma kanvasta */}
      <Menu
        open={!!menuBag}
        onClose={() => setMenuBag(null)}
        anchorReference="anchorPosition"
        anchorPosition={menuBag ? { top: menuBag.y, left: menuBag.x } : undefined}
        slotProps={{ paper: { sx: { bgcolor: '#141f35', color: K.metin, border: `1px solid ${K.ayrac}` } } }}
      >
        <Box sx={{ px: 1.5, py: 0.5, maxWidth: 280 }}>
          <Typography variant="caption" sx={{ color: K.metinIkincil }}>
            {gorevById.get(menuBag?.d.oncekiId ?? '')?.ad} → {gorevById.get(menuBag?.d.sonrakiId ?? '')?.ad}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: K.metin, fontWeight: 700 }}>
            {menuBag?.d.tur === 'SS' ? 'Birlikte başlar' : 'Bitince başlar'}
            {menuBag?.d.gecikmeDk
              ? menuBag.d.gecikmeDk > 0
                ? ` · gecikme +${menuBag.d.gecikmeDk} dk`
                : ` · öne alma ${menuBag.d.gecikmeDk} dk`
              : ''}
          </Typography>
        </Box>
        {onBagimlilikDegistir && <Divider sx={{ borderColor: K.ayrac }} />}
        {onBagimlilikDegistir && (
          <MenuItem
            dense
            onClick={() => {
              if (menuBag)
                onBagimlilikDegistir(menuBag.d, { tur: menuBag.d.tur === 'SS' ? 'FS' : 'SS' });
              setMenuBag(null);
            }}
          >
            ↔ {menuBag?.d.tur === 'SS' ? '"Bitince başlar" yap' : '"Birlikte başlar" yap'}
          </MenuItem>
        )}
        {onBagimlilikDegistir && (
          <MenuItem
            dense
            onClick={() => {
              if (menuBag)
                onBagimlilikDegistir(menuBag.d, { gecikmeDk: (menuBag.d.gecikmeDk ?? 0) + 5 });
              setMenuBag(null);
            }}
          >
            ＋ Gecikme +5 dk
          </MenuItem>
        )}
        {onBagimlilikDegistir && (
          <MenuItem
            dense
            onClick={() => {
              if (menuBag)
                onBagimlilikDegistir(menuBag.d, { gecikmeDk: (menuBag.d.gecikmeDk ?? 0) - 5 });
              setMenuBag(null);
            }}
          >
            － Gecikme −5 dk
          </MenuItem>
        )}
        {onBagimlilikSil && <Divider sx={{ borderColor: K.ayrac }} />}
        {onBagimlilikSil && (
          <MenuItem
            dense
            sx={{ color: '#f87171' }}
            onClick={() => {
              if (menuBag) onBagimlilikSil(menuBag.d.oncekiId, menuBag.d.sonrakiId);
              setMenuBag(null);
            }}
          >
            ✂ Bağı kaldır
          </MenuItem>
        )}
      </Menu>
      {/* ? YARDIM — etkileşim rehberi + işaret anahtarı (eski ipucu satırı + lejant) */}
      <Menu
        open={!!yardimAnchor}
        anchorEl={yardimAnchor}
        onClose={() => setYardimAnchor(null)}
        slotProps={{ paper: { sx: { bgcolor: '#141f35', color: K.metin, border: `1px solid ${K.ayrac}`, maxWidth: 340, p: 1.25 } } }}
      >
        <Box sx={{ px: 1, py: 0.5, fontSize: 12, lineHeight: 1.9 }}>
          <b>Etkileşim</b>
          <br />• Sürükle → yeniden planla (canlı zincir önizleme · Esc iptal)
          <br />• Sağ kenarı çek → süre · ⭘ port → zamanlama bağı kur
          <br />• Oka tıkla → bağı düzenle/kaldır · Sağ tık → durum menüsü
          <br />• Çift tık (boş alan) → yeni görev · ⠿ grip → satırı taşı
          <br />• Hover → zincir + zaman kılavuzu · Ctrl+tekerlek → zoom · Ctrl+Z/Y
          <br />• Space+sürükle veya orta tuş → kanvası kaydır (pan)
          <br />
          <b>İşaretler</b>
          <br />◆ kilometre taşı · ⚡ EW · ✜ angajman · ⛽ lojistik · 👁 keşif
          <br />⬚ taralı = gecikme · soluk = iptal · ✓ = onaylı · ✔✔ = tamam
          <br />kesik ok = birlikte başlar · turuncu kesik = kaynak çakışması
          <br /><span style={{ color: '#ff5252' }}>kırmızı</span> = kritik yol
        </Box>
      </Menu>
    </Box>
  );
}

/** Açıklama şeridi (lejant) — renk moduna göre kodlamalar. */
export function GanttLejant({ renkMod = 'domain' }: { renkMod?: RenkMod }) {
  const oge = (renk: string, etiket: string) => (
    <Stack key={etiket} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: renk }} />
      <Typography variant="caption" color="text.secondary">
        {etiket}
      </Typography>
    </Stack>
  );
  const renkler =
    renkMod === 'tur'
      ? [
          oge(TUR_RENK.angajman, 'Angajman/Taarruz'),
          oge(TUR_RENK.kesif, 'Keşif/ISR'),
          oge(TUR_RENK.elektronik_harp, 'Elektronik harp'),
          oge(TUR_RENK.hareket, 'İntikal/Transit'),
          oge(TUR_RENK.lojistik, 'Lojistik'),
          oge(TUR_RENK.gorev, 'Görev'),
        ]
      : [
          oge('#1565c0', 'Hava'),
          oge('#00838f', 'Deniz'),
          oge('#558b2f', 'Kara'),
          oge('#6a1b9a', 'Siber'),
          oge('#283593', 'Uzay'),
          oge('#c62828', 'Angajman'),
        ];
  return (
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
      {renkler}
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <Box sx={{ width: 14, height: 3, bgcolor: '#d32f2f' }} />
        <Typography variant="caption" color="text.secondary">
          kritik yol
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        ◆ kilometre taşı · ⚡ EW · ✜ angajman · ⛽ lojistik · ⬚ taralı=gecikme · turuncu-kesik=çakışma ·
        kesik-ok=birlikte başla · bölüm başlığına tıkla → katla · bloğu sürükle → yeniden planla
      </Typography>
    </Stack>
  );
}
