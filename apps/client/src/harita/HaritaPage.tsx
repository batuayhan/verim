import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Select,
  Slider,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// rolldown, maplibre'nin gömülü worker'ını bozuyor ("gC is not defined",
// GeoJSON katmanı çizilmiyor) — hazır worker dosyasını asset olarak sun
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url';

maplibregl.setWorkerUrl(maplibreWorkerUrl);
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { ForceLive, useLiveMode } from '../api/live';
import { KONSOL } from '../components/konsol';
import { TopNav } from '../components/TopNav';
import { useNesneDetay } from '../nesne/NesneDetay';
import type { ObjectSetDef } from '../types/mercek';
import { useObjectSet } from '../mercek/api';
import { GorevDetay } from '../senkron/SyncMatrixPage';
import {
  bagimlilikEkle,
  bagimlilikSil,
  geriAl,
  getVarliklar,
  getPlan,
  getPlanGeo,
  gorevDurum,
  gorevEkle,
  gorevGuncelle,
  gorevSil,
  ileriAl,
  isHata,
  kaydirGorev,
  satirSirala,
  sensorToShooter,
  type PlanGorev,
  type SenkronGeo,
  type SenkronPaket,
} from '../senkron/api';
import { GanttTimeline } from '../senkron/GanttTimeline';
import { readHaritaSeti } from './haritaSet';

/**
 * Harita (COP — ortak harekât resmi): omurgadan akan izlerin canlı harita
 * görünümü. Sayfa doğası gereği HER ZAMAN canlıdır (ForceLive); son N
 * dakikada gözlemi olan izler gösterilir — hareketi süren izler bunlardır.
 * Kapalı ağda tile sunucusu adresi values altında değiştirilir.
 */

/** Sync Matrix görev-tipi renkleri (GanttTimeline TUR_RENK ile uyumlu) */
const SENKRON_TUR_RENK: Record<string, string> = {
  angajman: '#c62828',
  kesif: '#f9a825',
  elektronik_harp: '#6a1b9a',
  hareket: '#1565c0',
  lojistik: '#2e7d32',
  gorev: '#455a64',
  kilometre_tasi: '#212121',
};
const fmtH = (dk: number) => {
  const s = dk < 0 ? '−' : '+';
  const a = Math.abs(dk);
  return `H${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
};

const SINIF_RENK: Record<string, string> = {
  Dost: '#1e88e5',
  Düşman: '#e53935',
  Şüpheli: '#fb8c00',
  Bilinmeyen: '#757575',
};
const SINIFLAR = Object.keys(SINIF_RENK);

const INTEL_RENK: Record<string, string> = {
  SIGINT: '#8e24aa',
  IMINT: '#00897b',
  OSINT: '#f4511e',
  HUMINT: '#3949ab',
};

/** Coğrafi daire → GeoJSON polygon (km yarıçapı, ~enlem düzeltmeli) */
function daireCevir(lon: number, lat: number, km: number, n = 48): number[][] {
  const dLat = km / 110.574;
  const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  const ring: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export function HaritaPage() {
  return (
    <ForceLive>
      <HaritaContent />
    </ForceLive>
  );
}

function HaritaContent() {
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // Harita olay işleyicisi bir kez kurulur; detay açıcıyı ref'ten okur
  const detay = useNesneDetay();
  const detayRef = useRef(detay.ac);
  detayRef.current = detay.ac;
  // Asistan yönlendirmesi / paylaşılabilir link:
  // ?sinif=Düşman,Şüpheli&pencere=60&lat=39.9&lon=32.8&zoom=9&etiket=IZ-0042
  // ?set=<ts> → asistan/analizden devredilen NESNE KÜMESİ (sessionStorage)
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // Özel küme modu: canlı COP yerine yalnız devredilen kümeyi göster
  const seti = useMemo(
    () => (searchParams.get('set') ? readHaritaSeti() : null),
    [searchParams],
  );
  const [windowMin, setWindowMin] = useState(() => {
    const p = Number(searchParams.get('pencere'));
    return [5, 15, 30, 60, 180].includes(p) ? p : 15;
  });
  const [hidden, setHidden] = useState<Set<string>>(() => {
    const s = searchParams.get('sinif');
    if (!s) return new Set();
    const gorunecek = new Set(s.split(','));
    return new Set(SINIFLAR.filter((x) => !gorunecek.has(x)));
  });
  // Katmanlar: nokta/ısı gösterimi + iz izleri (trails) + istihbarat + menzil
  // halkaları. Asistan haritayı URL parametreleriyle sürer (haritaya_git aracı):
  // ?izler=1&intel=1&menzil=1&gosterim=isi → katmanlar açık başlar.
  const [gosterim, setGosterim] = useState<'nokta' | 'isi'>(() =>
    searchParams.get('gosterim') === 'isi' ? 'isi' : 'nokta',
  );
  const [izlerAcik, setIzlerAcik] = useState(() => searchParams.get('izler') === '1');
  const [intelAcik, setIntelAcik] = useState(() => searchParams.get('intel') === '1');
  const [menzilAcik, setMenzilAcik] = useState(() => searchParams.get('menzil') === '1');
  // Kairos↔Gaia: Sync Matrix planı harita katmanı + gömülü mini matris
  const [senkronAcik, setSenkronAcik] = useState(() => searchParams.get('senkron') === '1');
  // Mini matris yüksekliği — üst kenardan çekilerek ayarlanır (dashboard gibi), hatırlanır
  const [senkronYuk, setSenkronYuk] = useState(() => {
    const v = Number(localStorage.getItem('verim-senkron-panel-yuk'));
    return Number.isFinite(v) && v >= 160 ? Math.min(v, 640) : 280;
  });
  const senkronYukRef = useRef(senkronYuk);
  senkronYukRef.current = senkronYuk;
  const [yukCek, setYukCek] = useState(false);
  // Gadget-tarzı GENİŞLİK (null = tam genişlik) — köşeden boyutlandır
  const [senkronGen, setSenkronGen] = useState<number | null>(() => {
    const v = Number(localStorage.getItem('verim-senkron-panel-gen'));
    return Number.isFinite(v) && v >= 420 ? v : null;
  });
  const senkronGenRef = useRef(senkronGen);
  senkronGenRef.current = senkronGen;
  const [koseCek, setKoseCek] = useState(false);
  // Mini matris ŞERİT modu (brif sırasında tek satır) — tercih kalıcı
  const [senkronSerit, setSenkronSerit] = useState(() => localStorage.getItem('verim-senkron-serit') === '1');
  const seritToggle = () =>
    setSenkronSerit((v) => {
      localStorage.setItem('verim-senkron-serit', v ? '0' : '1');
      return !v;
    });
  useEffect(() => {
    if (!koseCek) return;
    const panel = document.getElementById('senkron-mini-panel');
    const r0 = panel?.getBoundingClientRect();
    if (!r0) return;
    let raf = false;
    let son: PointerEvent | null = null;
    const move = (e: PointerEvent) => {
      son = e;
      if (raf) return;
      raf = true;
      requestAnimationFrame(() => {
        raf = false;
        if (!son) return;
        setSenkronYuk(Math.max(160, Math.min(Math.round(window.innerHeight * 0.75), r0.bottom - son.clientY)));
        setSenkronGen(Math.max(420, Math.min(window.innerWidth - 40, Math.round(r0.right - son.clientX))));
      });
    };
    const up = () => {
      localStorage.setItem('verim-senkron-panel-yuk', String(senkronYukRef.current));
      // tam genişliğe yaklaşınca kilitlen (gadget "genişlet" davranışı)
      if (senkronGenRef.current && senkronGenRef.current >= window.innerWidth - 80) {
        setSenkronGen(null);
        localStorage.removeItem('verim-senkron-panel-gen');
      } else if (senkronGenRef.current) {
        localStorage.setItem('verim-senkron-panel-gen', String(senkronGenRef.current));
      }
      setKoseCek(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [koseCek]);
  // Kamera animasyonu bitince ertelenen katman güncellemeleri yetişsin
  const [kameraSayac, setKameraSayac] = useState(0);
  // İz sağ-tık menüsü + harita bildirimi
  const [izMenu, setIzMenu] = useState<{ x: number; y: number; iz: Record<string, string> } | null>(null);
  const [angajeKur, setAngajeKur] = useState(false); // iki-adım: kur → onayla (karantina paritesi)
  // Mini matris TAM YETENEK paritesi: playback + renk modu + hover
  const [playDk, setPlayDk] = useState<number | null>(null);
  const [oynuyor, setOynuyor] = useState(false);
  const [panelRenk, setPanelRenk] = useState<'domain' | 'tur'>('tur');
  const [hoverGorev, setHoverGorev] = useState<string | null>(null);
  const [seciliGorevId, setSeciliGorevId] = useState<string | null>(null);
  // ✎ Düzenle: senkron sayfasındaki çekmecenin AYNISI haritada da açılır
  const [duzenleGorev, setDuzenleGorev] = useState<PlanGorev | null>(null);
  const odakIslendi = useRef<string | null>(null);
  const oncekiAktifRef = useRef<Set<string>>(new Set());
  const [haritaBildirim, setHaritaBildirim] = useState<string | null>(null);
  // Zengin hover tooltip (tek Popup örneği yeniden kullanılır — performans)
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const popupTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!yukCek) return;
    let y0: number | null = null;
    const bas = senkronYukRef.current;
    const move = (e: PointerEvent) => {
      if (y0 == null) y0 = e.clientY;
      const yeni = Math.max(160, Math.min(Math.round(window.innerHeight * 0.7), bas + (y0 - e.clientY)));
      setSenkronYuk(yeni);
    };
    const up = () => {
      localStorage.setItem('verim-senkron-panel-yuk', String(senkronYukRef.current));
      setYukCek(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [yukCek]);

  // Sayfa AÇIKKEN gelen URL değişikliklerini de uygula (asistan aksiyonu,
  // tarayıcı geri/ileri): parametre VARSA state'e yansıt, yoksa dokunma —
  // kullanıcının elle açtığı katman URL'siz gezinmede kapanmaz.
  useEffect(() => {
    const g = searchParams.get('gosterim');
    if (g === 'isi' || g === 'nokta') setGosterim(g);
    const iz = searchParams.get('izler');
    if (iz != null) setIzlerAcik(iz === '1');
    const it = searchParams.get('intel');
    if (it != null) setIntelAcik(it === '1');
    const mz = searchParams.get('menzil');
    if (mz != null) setMenzilAcik(mz === '1');
    const sk = searchParams.get('senkron');
    if (sk != null) setSenkronAcik(sk === '1');
    const p = Number(searchParams.get('pencere'));
    if ([5, 15, 30, 60, 180].includes(p)) setWindowMin(p);
    const s = searchParams.get('sinif');
    if (s != null) {
      const gorunecek = new Set(s.split(','));
      setHidden(new Set(SINIFLAR.filter((x) => !gorunecek.has(x))));
    }
  }, [searchParams]);
  // AOI (ilgi alanı): kullanıcı harita üstünde dikdörtgen çizer → içi filtrelenir
  const [aoiCizim, setAoiCizim] = useState(false);
  const [aoi, setAoi] = useState<[number, number, number, number] | null>(null); // [w,s,e,n]
  const aoiStart = useRef<[number, number] | null>(null);

  // Canlı pencere GÖRELİ zamanla filtrelenir: {kind:'relative'} sunucuda
  // her tazelemede "şimdi − N dk" olarak hesaplanır. Sorgu anahtarı sabit
  // (windowMin), canlı mod 3 sn'de bir tazeler → gerçekten "son N dakika".
  const pencereKosulu = useMemo(
    () => ({
      id: 'pencere',
      column: 'tespit_zamani',
      operator: 'gte' as const,
      values: [{ kind: 'relative' as const, unit: 'minute' as const, amount: windowMin }],
    }),
    [windowMin],
  );

  const def = useMemo<ObjectSetDef>(
    () =>
      seti
        ? // Devredilen küme — kümenin kendi tanımı (kendi filtresiyle)
          (seti.def as ObjectSetDef)
        : {
            type: 'filter',
            base: { type: 'base', objectType: 'iz' },
            combinator: 'and',
            conditions: [pencereKosulu],
          },
    [pencereKosulu, seti],
  );
  const { data } = useObjectSet(def, {}, 5000);

  // İz izleri: yalnız trail açıkken, GÖRÜNÜR izlerin tehdit-öncelikli alt kümesi
  // için TÜM pencere geçmişi çekilir. (Düz sorgu 5000 gözlemi ~30 sn'lik rastgele
  // dilime sıkıştırıyordu → izler mikroskobik/görünmezdi.) İz sayısı pencereyle
  // ölçeklenir ki 5000'lik kontrat tavanı içinde iz başına TAM yol gelsin.
  const TRAIL_IZ_TAVANI: Record<number, number> = { 5: 60, 15: 40, 30: 25, 60: 12, 180: 4 };
  const trailIzler = useMemo(() => {
    // set devri iz değilse trail anlamsız (iz_no yok)
    if (!izlerAcik || !data || (seti && seti.objectType && seti.objectType !== 'iz'))
      return [] as string[];
    const oncelik = (s: string) =>
      s === 'Düşman' ? 0 : s === 'Şüpheli' ? 1 : s === 'Bilinmeyen' ? 2 : 3;
    const kutuIci = (o: Record<string, unknown>) =>
      !aoi ||
      (Number(o.boylam) >= aoi[0] && Number(o.boylam) <= aoi[2] &&
        Number(o.enlem) >= aoi[1] && Number(o.enlem) <= aoi[3]);
    const adaylar = data.objects.filter(
      (o) =>
        o.iz_no != null &&
        (seti || !hidden.has(String(o.siniflandirma))) &&
        o.enlem != null &&
        o.boylam != null &&
        kutuIci(o), // AOI çizildiyse yalnız kutu içindeki izlerin yolu
    );
    adaylar.sort(
      (a, b) =>
        oncelik(String(a.siniflandirma)) - oncelik(String(b.siniflandirma)) ||
        Number(b.tehdit_skoru ?? -1) - Number(a.tehdit_skoru ?? -1) || // gerçek tehdit sırası
        String(a.iz_no).localeCompare(String(b.iz_no)), // deterministik
    );
    const tavan = TRAIL_IZ_TAVANI[windowMin] ?? 40;
    // benzersiz + sıralı → queryKey üyelik değişmedikçe stabil (cache churn yok)
    return [...new Set(adaylar.map((o) => String(o.iz_no)))].slice(0, tavan).sort();
  }, [izlerAcik, data, hidden, seti, windowMin, aoi]);

  const trailDef = useMemo<ObjectSetDef | null>(
    () =>
      izlerAcik && trailIzler.length
        ? {
            type: 'filter',
            base: { type: 'base', objectType: 'iz_gozlem' },
            combinator: 'and',
            conditions: [
              pencereKosulu,
              {
                id: 'izf',
                column: 'iz_no',
                operator: 'in' as const,
                values: trailIzler.map((v) => ({ kind: 'literal' as const, value: v })),
              },
            ],
          }
        : null,
    [izlerAcik, pencereKosulu, trailIzler],
  );
  const { data: trailData } = useObjectSet(trailDef, {}, 5000); // kontrat tavanı 5000

  // İstihbarat raporları — pencere içindeki multi-INT raporları (katman açıkken)
  const intelDef = useMemo<ObjectSetDef | null>(
    () =>
      intelAcik && !seti
        ? {
            type: 'filter',
            base: { type: 'base', objectType: 'istihbarat_raporu' },
            combinator: 'and',
            conditions: [
              {
                id: 'ip',
                column: 'rapor_zamani',
                operator: 'gte',
                values: [{ kind: 'relative', unit: 'minute', amount: windowMin }],
              },
            ],
          }
        : null,
    [intelAcik, seti, windowMin],
  );
  const { data: intelData } = useObjectSet(intelDef, {}, 2000);

  // Kairos↔Gaia: Sync Matrix planı (mini matris) + coğrafi izdüşümü (katman)
  const { refetchInterval } = useLiveMode();
  const qc = useQueryClient();
  const senkronPlanQ = useQuery({
    queryKey: ['senkron-plan', 'canli'],
    queryFn: getPlan,
    enabled: senkronAcik,
    refetchInterval,
  });
  const varliklarQ = useQuery({ queryKey: ['senkron-varliklar'], queryFn: getVarliklar, enabled: senkronAcik });
  const senkronGeoQ = useQuery({
    queryKey: ['senkron-geo', 'canli'],
    queryFn: () => getPlanGeo('canli'),
    enabled: senkronAcik,
    refetchInterval,
  });
  const senkronPaket =
    senkronPlanQ.data && !isHata(senkronPlanQ.data) ? (senkronPlanQ.data as SenkronPaket) : undefined;
  const senkronGeo =
    senkronGeoQ.data && !isHata(senkronGeoQ.data) ? (senkronGeoQ.data as SenkronGeo) : undefined;

  // Menzil halkaları — sensörleri taşıyan platformların konumu + sensör menzili
  // (joinLinked ile platform enlem/boylam eklenir; ring = menzil_km yarıçapı)
  const menzilDef = useMemo<ObjectSetDef | null>(
    () =>
      menzilAcik && !seti
        ? {
            type: 'joinLinked',
            base: { type: 'base', objectType: 'sensor' },
            linkType: 'sensor-platform',
            columns: ['enlem', 'boylam'],
          }
        : null,
    [menzilAcik, seti],
  );
  const { data: menzilData } = useObjectSet(menzilDef, {}, 400);

  // Harita bir kez kurulur
  useEffect(() => {
    if (!mapDiv.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapDiv.current,
      style: MAP_STYLE,
      center: [32.5, 39.0],
      zoom: 5.2,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    map.on('load', () => {
      map.addSource('izler', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      // İz izleri (trails) — gözlem geçmişinden LineString'ler
      map.addSource('izler-trail', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      // Menzil halkaları (sensör kapsama alanları), istihbarat, AOI kaynakları
      map.addSource('menzil', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('intel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('aoi', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'menzil-dolgu', type: 'fill', source: 'menzil',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#1e88e5', 'fill-opacity': 0.06 },
      });
      map.addLayer({
        id: 'menzil-cizgi', type: 'line', source: 'menzil',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#1e88e5', 'line-width': 1, 'line-opacity': 0.5, 'line-dasharray': [2, 2] },
      });
      map.addLayer({
        id: 'aoi-dolgu', type: 'fill', source: 'aoi',
        paint: { 'fill-color': '#7b1fa2', 'fill-opacity': 0.08 },
      });
      map.addLayer({
        id: 'aoi-cizgi', type: 'line', source: 'aoi',
        paint: { 'line-color': '#7b1fa2', 'line-width': 2 },
      });
      map.addLayer({
        id: 'iz-izleri',
        type: 'line',
        source: 'izler-trail',
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
        paint: {
          'line-color': [
            'match',
            ['get', 'siniflandirma'],
            'Dost', SINIF_RENK.Dost,
            'Düşman', SINIF_RENK['Düşman'],
            'Şüpheli', SINIF_RENK['Şüpheli'],
            SINIF_RENK.Bilinmeyen,
          ],
          'line-width': 2,
          'line-opacity': 0.55,
        },
      });
      // Isı haritası (yoğunluk) — varsayılan gizli
      map.addLayer({
        id: 'iz-isi',
        type: 'heatmap',
        source: 'izler',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 1, 10, 3],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 12, 10, 30],
          'heatmap-opacity': 0.75,
        },
      });
      map.addLayer({
        id: 'iz-noktalari',
        type: 'circle',
        source: 'izler',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 9, 7],
          'circle-color': [
            'match',
            ['get', 'siniflandirma'],
            'Dost', SINIF_RENK.Dost,
            'Düşman', SINIF_RENK['Düşman'],
            'Şüpheli', SINIF_RENK['Şüpheli'],
            SINIF_RENK.Bilinmeyen,
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      });
      // İstihbarat raporu noktaları (INT disiplinine göre renkli) — üstte
      map.addLayer({
        id: 'intel-noktalari', type: 'circle', source: 'intel',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 9, 8],
          'circle-color': [
            'match', ['get', 'tur'],
            'SIGINT', INTEL_RENK.SIGINT, 'IMINT', INTEL_RENK.IMINT,
            'OSINT', INTEL_RENK.OSINT, 'HUMINT', INTEL_RENK.HUMINT, '#616161',
          ],
          'circle-stroke-width': 2, 'circle-stroke-color': '#fff', 'circle-opacity': 0.9,
        },
      });
      map.on('click', 'intel-noktalari', (e) => {
        const f = e.features?.[0];
        if (f?.properties?.rapor_no) detayRef.current('istihbarat_raporu', String(f.properties.rapor_no));
      });
      map.on('mouseenter', 'intel-noktalari', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'intel-noktalari', () => { map.getCanvas().style.cursor = ''; });
      // İZ SAĞ-TIK: detay / angaje / Sync Matrix köprüsü
      map.on('contextmenu', 'iz-noktalari', (e) => {
        e.preventDefault();
        const pr = e.features?.[0]?.properties as Record<string, string> | undefined;
        if (pr) setIzMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, iz: pr });
      });
      // UZUN HOVER (350ms): okunaklı koyu kart tooltip — tek Popup yeniden kullanılır
      popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: '260px' });
      const kartHtml = (pr: Record<string, string>) => {
        const renk = { 'Dost': '#1e88e5', 'Düşman': '#e53935', 'Şüpheli': '#fb8c00' }[pr.siniflandirma] ?? '#9e9e9e';
        const sat = (k: string, v?: string) => (v && v !== 'null' && v !== 'undefined' ? `<div style="display:flex;gap:6px"><span style="color:#7c8db0;min-width:52px">${k}</span><span>${v}</span></div>` : '');
        return `<div style="background:#141f35;border:1px solid rgba(148,163,184,.2);border-radius:8px;padding:8px 10px;color:#e2e8f0;font:11px ui-monospace,Menlo,monospace;line-height:1.5">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px"><span style="width:9px;height:9px;border-radius:50%;background:${renk}"></span><b style="font-size:12px">${pr.iz_no ?? pr.__pk ?? ''}</b><span style="color:${renk}">${pr.siniflandirma ?? ''}</span></div>
          ${sat('domain', pr.domain)}${sat('sürat', pr.surat_knot ? pr.surat_knot + ' kt' : undefined)}${sat('rota', pr.rota_derece ? pr.rota_derece + '°' : undefined)}${sat('irtifa', pr.irtifa_ft ? pr.irtifa_ft + ' ft' : undefined)}${sat('tehdit', pr.tehdit_skoru ? pr.tehdit_skoru + (pr.tehdit_onceligi ? ' · ' + pr.tehdit_onceligi : '') : undefined)}
          <div style="color:#5c6f8f;margin-top:3px">tıkla: detay · sağ tık: menü</div></div>`;
      };
      map.on('mouseenter', 'iz-noktalari', (e) => {
        const f = e.features?.[0];
        if (!f || f.geometry.type !== 'Point') return;
        if (popupTimer.current) window.clearTimeout(popupTimer.current);
        const koord = f.geometry.coordinates as [number, number];
        const pr = f.properties as Record<string, string>;
        popupTimer.current = window.setTimeout(() => {
          popupRef.current?.setLngLat(koord).setHTML(kartHtml(pr)).addTo(map);
        }, 350);
      });
      map.on('mouseleave', 'iz-noktalari', () => {
        if (popupTimer.current) window.clearTimeout(popupTimer.current);
        popupRef.current?.remove();
      });
      map.on('click', 'iz-noktalari', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, string>;
        // Nokta ontolojik bir nesnedir: tıklama gezilebilir DETAY çekmecesini
        // açar. __type/__pk kümenin tipini taşır (canlı COP'ta iz).
        const tip = p.__type ?? 'iz';
        const pk = p.__pk ?? p.iz_no;
        if (pk) detayRef.current(tip, pk);
      });
      map.on('mouseenter', 'iz-noktalari', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'iz-noktalari', () => {
        map.getCanvas().style.cursor = '';
      });

      // SYNC MATRIX katmanları (Kairos↔Gaia): görev noktaları, hedefler, rotalar
      map.addSource('senkron', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      // Görev bölgesi çemberleri (killbox/ROZ benzeri) — soluk dolgu + kesikli sınır
      map.addLayer({
        id: 'senkron-bolge',
        type: 'fill',
        source: 'senkron',
        filter: ['==', ['get', 'rol'], 'bolge'],
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#7dd3fc', 'fill-opacity': 0.06 },
      });
      map.addLayer({
        id: 'senkron-bolge-sinir',
        type: 'line',
        source: 'senkron',
        filter: ['==', ['get', 'rol'], 'bolge'],
        layout: { visibility: 'none' },
        paint: { 'line-color': '#38bdf8', 'line-width': 1.4, 'line-dasharray': [3, 2], 'line-opacity': 0.7 },
      });
      map.addLayer({
        id: 'senkron-rota',
        type: 'line',
        source: 'senkron',
        filter: ['==', ['get', 'rol'], 'rota'],
        layout: { visibility: 'none', 'line-cap': 'round' },
        paint: { 'line-color': '#c62828', 'line-width': 2.5, 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'senkron-gorevler',
        type: 'circle',
        source: 'senkron',
        filter: ['==', ['get', 'rol'], 'gorev'],
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 9,
          'circle-color': [
            'match', ['get', 'tur'],
            'angajman', SENKRON_TUR_RENK.angajman,
            'kesif', SENKRON_TUR_RENK.kesif,
            'elektronik_harp', SENKRON_TUR_RENK.elektronik_harp,
            'hareket', SENKRON_TUR_RENK.hareket,
            'lojistik', SENKRON_TUR_RENK.lojistik,
            SENKRON_TUR_RENK.gorev,
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'senkron-hedefler',
        type: 'circle',
        source: 'senkron',
        filter: ['==', ['get', 'rol'], 'hedef'],
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 8,
          'circle-color': '#c62828',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffeb3b', // hedef: sarı halka — atıcıdan ayrışsın
          'circle-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'senkron-etiket',
        type: 'symbol',
        source: 'senkron',
        filter: ['==', ['get', 'rol'], 'gorev'],
        layout: {
          visibility: 'none',
          'text-field': ['coalesce', ['get', 'etiket'], ['get', 'ad']],
          'text-size': 10,
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: { 'text-color': '#263238', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
      });
      map.on('click', 'senkron-gorevler', (e) => {
        const p = e.features?.[0]?.properties as Record<string, string> | undefined;
        if (p?.varlikId) detayRef.current('platform', p.varlikId);
      });
      map.on('click', 'senkron-hedefler', (e) => {
        const p = e.features?.[0]?.properties as Record<string, string> | undefined;
        if (p?.hedefIz) detayRef.current('iz', p.hedefIz);
      });
      for (const l of ['senkron-gorevler', 'senkron-hedefler']) {
        map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
      }
      // AKICILIK: uçuş bitince ertelenmiş veri güncellemelerini tetikle
      map.on('moveend', () => setKameraSayac((c) => c + 1));
      setMapReady(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Konum odağı: asistan "haritada aç" aksiyonu / panel pin'i buraya düşer.
  // Harita hazırken VE parametre her değiştiğinde uçarak odaklanır, işaretler.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const lat = Number(searchParams.get('lat'));
    const lon = Number(searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) return;
    const zoom = Number(searchParams.get('zoom')) || 9;
    const etiket = searchParams.get('etiket');

    markerRef.current?.remove();
    const marker = new maplibregl.Marker({ color: '#7b1fa2' }).setLngLat([lon, lat]);
    if (etiket) {
      marker.setPopup(
        new maplibregl.Popup({ closeButton: false, offset: 28 }).setHTML(
          `<div style="font: 12px/1.4 system-ui"><b>${etiket}</b></div>`,
        ),
      );
    }
    marker.addTo(map);
    if (etiket) marker.togglePopup();
    markerRef.current = marker;
    map.stop();
    map.flyTo({ center: [lon, lat], zoom, duration: 800, essential: true });
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [mapReady, searchParams]);

  // ODAK köprüsü: /senkron sağ-tık "🗺 Haritada göster" → ?odak=<gorevId>
  // Geo geldiğinde göreve uçulur ve panel matrisinde blok seçili gelir.
  useEffect(() => {
    const map = mapRef.current;
    const odak = searchParams.get('odak');
    if (!map || !mapReady || !odak || !senkronGeo || odakIslendi.current === odak) return;
    odakIslendi.current = odak;
    setSeciliGorevId(odak);
    const f = senkronGeo.features.find(
      (x) => x.properties.gorevId === odak && x.geometry.type === 'Point' && (x.properties.rol === 'gorev' || x.properties.rol === 'hedef'),
    );
    if (f && f.geometry.type === 'Point') {
      map.stop();
      map.flyTo({ center: f.geometry.coordinates, zoom: 8.5, duration: 900, essential: true });
    }
  }, [mapReady, senkronGeo, searchParams]);

  // Nokta AOI (ilgi alanı) kutusunun içinde mi? (kutu yoksa her nokta geçer)
  const iceriDe = (lon: number, lat: number) =>
    !aoi || (lon >= aoi[0] && lon <= aoi[2] && lat >= aoi[1] && lat <= aoi[3]);

  // Kümenin/izin pk kolonu (detay tıklaması için); küme modunda kümenin tipi
  const setTip = seti?.objectType ?? 'iz';
  const pkKol = setTip === 'iz' ? 'iz_no' : `${setTip.replace(/_.*/, '')}_no`;

  // Veri her tazelendiğinde noktalar güncellenir — haritada hareket bu satırdır
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !data) return;
    const src = map.getSource('izler') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (map.isMoving()) return; // AKICILIK: uçuş sırasında setData = kasma; moveend'de yetişir
    const koordlu = data.objects.filter(
      (o) =>
        (seti || !hidden.has(String(o.siniflandirma))) &&
        o.enlem !== null &&
        o.enlem !== undefined &&
        o.boylam != null &&
        iceriDe(Number(o.boylam), Number(o.enlem)),
    );
    src.setData({
      type: 'FeatureCollection',
      features: koordlu.map((o) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [Number(o.boylam), Number(o.enlem)],
        },
        properties: { ...o, __type: setTip, __pk: String(o[pkKol] ?? o.iz_no ?? '') },
      })),
    });
    // Küme modunda: noktaların sınırına sığdır (tek noktaya değil, TAMAMINA)
    if (seti && koordlu.length > 0) {
      const b = new maplibregl.LngLatBounds();
      for (const o of koordlu) b.extend([Number(o.boylam), Number(o.enlem)]);
      map.fitBounds(b, { padding: 60, maxZoom: 11, duration: 800 });
    }
  }, [data, hidden, mapReady, seti, setTip, pkKol, aoi, kameraSayac]);

  // Katman görünürlüğü
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const v = (id: string, on: boolean) =>
      map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    v('iz-noktalari', gosterim === 'nokta');
    v('iz-isi', gosterim === 'isi');
    v('iz-izleri', izlerAcik);
    v('intel-noktalari', intelAcik);
    v('menzil-dolgu', menzilAcik);
    v('menzil-cizgi', menzilAcik);
    for (const id of ['senkron-bolge', 'senkron-bolge-sinir', 'senkron-rota', 'senkron-gorevler', 'senkron-hedefler', 'senkron-etiket'])
      v(id, senkronAcik);
  }, [gosterim, izlerAcik, intelAcik, menzilAcik, senkronAcik, mapReady]);

  // Ortak sonuç işleyici: hata görünür, plan+geo tazelenir, optimistik sözleşme
  const uygulaH = async (pr: Promise<SenkronPaket | { hata: string }>, mesaj: string): Promise<boolean> => {
    try {
      const r = await pr;
      qc.invalidateQueries({ queryKey: ['senkron-plan'] });
      qc.invalidateQueries({ queryKey: ['senkron-geo'] });
      if (isHata(r)) {
        setHaritaBildirim(`⚠ ${r.hata}`);
        return false;
      }
      setHaritaBildirim(mesaj);
      return true;
    } catch (e) {
      setHaritaBildirim(`⚠ Sunucuya ulaşılamadı: ${e instanceof Error ? e.message : 'hata'}`);
      return false;
    }
  };

  // PLAYBACK motoru (senkron sayfasıyla aynı tempo)
  const { tMin: pTMin, tMax: pTMax } = useMemo(() => {
    const g = senkronPaket?.plan.gorevler ?? [];
    if (!g.length) return { tMin: 0, tMax: 60 };
    return {
      tMin: Math.floor((Math.min(0, ...g.map((x) => x.baslangicDk)) - 15) / 15) * 15,
      tMax: Math.ceil((Math.max(0, ...g.map((x) => x.baslangicDk + x.sureDk)) + 15) / 15) * 15,
    };
  }, [senkronPaket?.plan.gorevler]);
  useEffect(() => {
    if (!senkronAcik && (oynuyor || playDk != null)) {
      setOynuyor(false);
      setPlayDk(null);
    }
  }, [senkronAcik, oynuyor, playDk]);
  useEffect(() => {
    if (!oynuyor || !senkronAcik) return;
    const t = setInterval(() => {
      setPlayDk((d) => {
        const y = (d ?? pTMin) + 1;
        if (y >= pTMax) {
          setOynuyor(false);
          return pTMax;
        }
        return y;
      });
    }, 50);
    return () => clearInterval(t);
  }, [oynuyor, senkronAcik, pTMin, pTMax]);

  // O anda AKTİF görevler (playback imleci altında)
  const aktifGorevler = useMemo(() => {
    if (playDk == null || !senkronPaket) return new Set<string>();
    return new Set(
      senkronPaket.plan.gorevler
        .filter((g) => g.baslangicDk <= playDk && playDk < g.baslangicDk + Math.max(1, g.sureDk))
        .map((g) => g.id),
    );
  }, [playDk, senkronPaket]);

  // Matris hover + playback aktifleri → haritada BÜYÜYEREK vurgulanır
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer('senkron-gorevler')) return;
    const idler = [...aktifGorevler, ...(hoverGorev ? [hoverGorev] : [])];
    const es = (idler.length
      ? ['in', ['get', 'gorevId'], ['literal', idler]]
      : ['==', ['get', 'gorevId'], '__yok__']) as unknown as maplibregl.ExpressionSpecification;
    map.setPaintProperty('senkron-gorevler', 'circle-radius', ['case', es, 14, 9]);
    map.setPaintProperty('senkron-gorevler', 'circle-stroke-width', ['case', es, 4, 2.5]);
    map.setPaintProperty('senkron-hedefler', 'circle-radius', ['case', es, 13, 8]);
    map.setPaintProperty('senkron-rota', 'line-width', ['case', es, 5, 2.5]);
    map.setPaintProperty('senkron-rota', 'line-opacity', ['case', es, 1, 0.9]);
  }, [hoverGorev, aktifGorevler, mapReady]);

  // OYNATIRKEN KAMERA TAKİBİ: yeni bir görev aktifleşince harita ona süzülür
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !oynuyor || !senkronGeo) {
      oncekiAktifRef.current = aktifGorevler;
      return;
    }
    const yeni = [...aktifGorevler].find((id) => !oncekiAktifRef.current.has(id));
    oncekiAktifRef.current = aktifGorevler;
    if (!yeni) return;
    const f = senkronGeo.features.find(
      (x) => x.properties.gorevId === yeni && x.geometry.type === 'Point' && (x.properties.rol === 'gorev' || x.properties.rol === 'hedef'),
    );
    if (f && f.geometry.type === 'Point') {
      map.stop();
      map.easeTo({ center: f.geometry.coordinates, duration: 650, essential: true });
    }
  }, [aktifGorevler, oynuyor, senkronGeo]);

  // Sync Matrix geo verisi kaynağa akar (görevler/hedefler/rotalar)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('senkron') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (map.isMoving()) return;
    src.setData(
      senkronAcik && senkronGeo ? senkronGeo : { type: 'FeatureCollection', features: [] },
    );
  }, [senkronGeo, senkronAcik, mapReady, kameraSayac]);

  // İstihbarat noktaları — konumlu raporlar (AOI varsa kutu içine kırpılır)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('intel') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (map.isMoving()) return;
    const konumlu = (intelAcik ? intelData?.objects ?? [] : []).filter(
      (o) => o.enlem != null && o.boylam != null && iceriDe(Number(o.boylam), Number(o.enlem)),
    );
    src.setData({
      type: 'FeatureCollection',
      features: konumlu.map((o) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [Number(o.boylam), Number(o.enlem)] },
        properties: { ...o },
      })),
    });
  }, [intelData, intelAcik, mapReady, aoi, kameraSayac]);

  // Menzil halkaları — her sensörün platform konumunda menzil_km yarıçaplı halka
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('menzil') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const rows = menzilAcik ? menzilData?.objects ?? [] : [];
    const features = rows
      .filter((s) => s.enlem != null && s.boylam != null && s.durum === 'Aktif' && Number(s.menzil_km) > 0)
      .map((s) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [daireCevir(Number(s.boylam), Number(s.enlem), Number(s.menzil_km))],
        },
        properties: { sensor_no: s.sensor_no, menzil_km: s.menzil_km },
      }));
    src.setData({ type: 'FeatureCollection', features });
  }, [menzilData, menzilAcik, mapReady]);

  // AOI dikdörtgeni çizimi: "AOI çiz" açıkken haritada sürükle (köşe→köşe)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = () => map.getSource('aoi') as maplibregl.GeoJSONSource | undefined;
    const kutu = (w: number, s: number, e: number, n: number) => ({
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
        properties: {},
      }],
    });
    if (!aoiCizim) {
      map.dragPan.enable();
      return;
    }
    map.dragPan.disable();
    map.getCanvas().style.cursor = 'crosshair';
    const down = (ev: maplibregl.MapMouseEvent) => { aoiStart.current = [ev.lngLat.lng, ev.lngLat.lat]; };
    const move = (ev: maplibregl.MapMouseEvent) => {
      if (!aoiStart.current) return;
      const [x0, y0] = aoiStart.current;
      const x1 = ev.lngLat.lng, y1 = ev.lngLat.lat;
      src()?.setData(kutu(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)));
    };
    const up = (ev: maplibregl.MapMouseEvent) => {
      if (!aoiStart.current) return;
      const [x0, y0] = aoiStart.current;
      const x1 = ev.lngLat.lng, y1 = ev.lngLat.lat;
      aoiStart.current = null;
      const box: [number, number, number, number] = [
        Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1),
      ];
      if (box[2] - box[0] > 0.01 && box[3] - box[1] > 0.01) {
        setAoi(box);
        setAoiCizim(false);
      }
    };
    map.on('mousedown', down);
    map.on('mousemove', move);
    map.on('mouseup', up);
    return () => {
      map.off('mousedown', down);
      map.off('mousemove', move);
      map.off('mouseup', up);
      map.getCanvas().style.cursor = '';
      map.dragPan.enable();
    };
  }, [aoiCizim, mapReady]);

  // AOI temizlenince kutu geometrisini de sil
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || aoi) return;
    (map.getSource('aoi') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection', features: [],
    });
  }, [aoi, mapReady]);

  // İz izleri verisi — gözlemleri iz_no'ya göre grupla, zamana göre sırala,
  // LineString kur; renk için izin sınıflandırması (data'dan) eklenir
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('izler-trail') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (map.isMoving()) return;
    if (!izlerAcik || !trailData) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const sinifByIz = new Map<string, string>();
    for (const o of data?.objects ?? []) sinifByIz.set(String(o.iz_no), String(o.siniflandirma));
    const byIz = new Map<string, Array<{ t: string; lon: number; lat: number }>>();
    for (const o of trailData.objects) {
      if (o.enlem == null || o.boylam == null) continue;
      const key = String(o.iz_no);
      // sınıfı gizlenen izin yolu da gizlenir (eski trailData bir tur gecikebilir)
      if (!seti && hidden.has(sinifByIz.get(key) ?? '')) continue;
      (byIz.get(key) ?? byIz.set(key, []).get(key)!).push({
        t: String(o.tespit_zamani),
        lon: Number(o.boylam),
        lat: Number(o.enlem),
      });
    }
    const features = [...byIz.entries()]
      .filter(([, pts]) => pts.length >= 2)
      .map(([iz, pts]) => {
        pts.sort((a, b) => a.t.localeCompare(b.t));
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: pts.map((p) => [p.lon, p.lat]),
          },
          properties: { iz_no: iz, siniflandirma: sinifByIz.get(iz) ?? 'Bilinmeyen' },
        };
      });
    src.setData({ type: 'FeatureCollection', features });
  }, [trailData, izlerAcik, data, mapReady, hidden, seti, kameraSayac]);

  const sayilar = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of data?.objects ?? []) {
      const s = String(o.siniflandirma);
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return m;
  }, [data]);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopNav />
      <Box
        sx={{
          position: 'relative',
          flexGrow: 1,
          minHeight: 0,
          // maplibre kontrolleri konsol dilinde
          '& .maplibregl-ctrl-group': { bgcolor: KONSOL.yuzey, border: `1px solid ${KONSOL.kenar}` },
          '& .maplibregl-ctrl-group button + button': { borderTop: `1px solid ${KONSOL.kenarSoluk}` },
          '& .maplibregl-ctrl-group button .maplibregl-ctrl-icon': { filter: 'invert(.85)' },
        }}
      >
        <div ref={mapDiv} style={{ position: 'absolute', inset: 0 }} />

        {/* ═══ KOMUTA ŞERİDİ — tüm COP kromu tek koyu satırda (UX×ALAN mutabakatı) ═══ */}
        <Stack
          direction="row"
          spacing={0.75}
          useFlexGap
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 6,
            alignItems: 'center',
            flexWrap: 'wrap',
            rowGap: 0.5,
            px: 1.25,
            py: 0.5,
            bgcolor: 'rgba(13,21,38,.92)',
            backdropFilter: 'blur(6px)',
            borderBottom: `1px solid ${KONSOL.kenar}`,
          }}
        >
          {seti ? (
            <>
              {/* KÜME MODU: devredilen nesne kümesi */}
              <Typography sx={{ fontWeight: 800, color: KONSOL.metin, fontSize: 13 }} noWrap>
                KÜME: {seti.baslik}
              </Typography>
              <Typography sx={{ color: KONSOL.metinIkincil, fontSize: 12 }}>
                {data?.totalCount ?? '…'} nesne
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Button size="small" onClick={() => setSearchParams({})} sx={{ textTransform: 'none', color: KONSOL.vurgu }}>
                Canlı COP'a dön
              </Button>
            </>
          ) : (
            <>
              <Tooltip title="Ortak Harekât Resmi · 3 sn'de bir tazelenir">
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#4ade80' }} />
                  <Typography sx={{ fontWeight: 800, color: KONSOL.metin, fontSize: 12, letterSpacing: 1, fontFamily: KONSOL.mono }}>
                    OHR
                  </Typography>
                </Stack>
              </Tooltip>
              <Select
                size="small"
                value={windowMin}
                onChange={(e) => setWindowMin(Number(e.target.value))}
                sx={{
                  color: KONSOL.metin,
                  fontSize: 12,
                  height: 28,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: KONSOL.kenar },
                  '& .MuiSvgIcon-root': { color: KONSOL.metinIkincil },
                }}
              >
                <MenuItem value={5}>son 5 dk</MenuItem>
                <MenuItem value={15}>son 15 dk</MenuItem>
                <MenuItem value={30}>son 30 dk</MenuItem>
                <MenuItem value={60}>son 1 saat</MenuItem>
                <MenuItem value={180}>son 3 saat</MenuItem>
              </Select>
              {/* SINIF çipleri — sayılı, her an görünür (alan-uzmanı şartı) */}
              {SINIFLAR.map((sn) => (
                <Chip
                  key={sn}
                  size="small"
                  label={`${sn} ${sayilar.get(sn) ?? 0}`}
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (next.has(sn)) next.delete(sn);
                      else next.add(sn);
                      return next;
                    })
                  }
                  sx={{
                    height: 22,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: KONSOL.mono,
                    bgcolor: hidden.has(sn) ? 'transparent' : SINIF_RENK[sn],
                    color: hidden.has(sn) ? KONSOL.metinIkincil : '#fff',
                    border: `1px solid ${SINIF_RENK[sn]}`,
                    textDecoration: hidden.has(sn) ? 'line-through' : undefined,
                  }}
                />
              ))}
              <Box sx={{ width: 1, height: 18, bgcolor: KONSOL.kenar, mx: 0.5 }} />
              {/* Gösterim + katmanlar: ikon+etiket chip (novice-first) */}
              <Chip
                size="small"
                label={gosterim === 'isi' ? '🔥 Isı' : '● Nokta'}
                onClick={() => setGosterim((g) => (g === 'isi' ? 'nokta' : 'isi'))}
                sx={{ height: 22, cursor: 'pointer', bgcolor: KONSOL.bant, color: KONSOL.vurgu, fontWeight: 700 }}
              />
              {(
                [
                  ['İzler', izlerAcik, setIzlerAcik, '〰'],
                  ['İstihbarat', intelAcik, setIntelAcik, '🕵'],
                  ['Menzil', menzilAcik, setMenzilAcik, '◎'],
                  ['Plan', senkronAcik, setSenkronAcik, '📊'],
                ] as Array<[string, boolean, (v: boolean) => void, string]>
              ).map(([ad, acik, setAcik, ikon]) => (
                <Chip
                  key={ad}
                  size="small"
                  label={`${ikon} ${ad}`}
                  onClick={() => setAcik(!acik)}
                  sx={{
                    height: 22,
                    cursor: 'pointer',
                    fontWeight: 700,
                    bgcolor: acik ? 'rgba(125,211,252,.18)' : 'transparent',
                    color: acik ? KONSOL.vurgu : KONSOL.metinIkincil,
                    border: `1px solid ${acik ? 'rgba(125,211,252,.5)' : KONSOL.kenar}`,
                  }}
                />
              ))}
              <Chip
                size="small"
                label="⬚ AOI"
                onClick={() => {
                  setAoiCizim((v) => !v);
                  setAoi(null);
                }}
                sx={{
                  height: 22,
                  cursor: 'pointer',
                  fontWeight: 700,
                  bgcolor: aoiCizim ? 'rgba(186,104,200,.25)' : 'transparent',
                  color: aoiCizim || aoi ? '#ce93d8' : KONSOL.metinIkincil,
                  border: `1px solid ${aoiCizim || aoi ? 'rgba(186,104,200,.6)' : KONSOL.kenar}`,
                }}
              />
              <Box sx={{ flexGrow: 1 }} />
              <Typography sx={{ color: KONSOL.metinIkincil, fontSize: 11, fontFamily: KONSOL.mono }} noWrap>
                {data?.totalCount ?? '…'} iz · tıkla: detay · sağ tık: menü
              </Typography>
            </>
          )}
        </Stack>

        {/* AOI aktif pili — şeride asılı */}
        {!seti && (aoiCizim || aoi) && (
          <Chip
            size="small"
            label={
              aoiCizim
                ? 'Haritada sürükle: köşe → köşe'
                : `Kutu içi ${data?.objects.filter((o) => o.enlem != null && o.boylam != null && iceriDe(Number(o.boylam), Number(o.enlem)) && !hidden.has(String(o.siniflandirma))).length ?? 0} iz`
            }
            onDelete={aoi ? () => setAoi(null) : undefined}
            sx={{ position: 'absolute', top: 44, left: 12, zIndex: 6, bgcolor: 'rgba(13,21,38,.92)', color: '#ce93d8', border: '1px solid rgba(186,104,200,.5)' }}
          />
        )}

        {/* Sol-alt koşullu LEJANT pilleri — yalnız ilgili katman açıkken */}
        <Stack spacing={0.5} sx={{ position: 'absolute', left: 12, bottom: senkronAcik ? undefined : 12, top: senkronAcik ? (aoiCizim || aoi ? 84 : 52) : undefined, zIndex: 5 }}>
          {intelAcik && !seti && (
            <Stack direction="row" spacing={0.75} sx={{ px: 1, py: 0.4, borderRadius: 1, bgcolor: 'rgba(13,21,38,.9)', border: `1px solid ${KONSOL.kenar}`, alignItems: 'center' }}>
              {Object.entries(INTEL_RENK).map(([tur, renk]) => (
                <Stack key={tur} direction="row" spacing={0.4} sx={{ alignItems: 'center' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: renk }} />
                  <Typography sx={{ fontSize: 10, color: KONSOL.metinIkincil }}>{tur}</Typography>
                </Stack>
              ))}
            </Stack>
          )}
          {senkronAcik && (
            <Stack direction="row" spacing={0.75} sx={{ px: 1, py: 0.4, borderRadius: 1, bgcolor: 'rgba(13,21,38,.9)', border: `1px solid ${KONSOL.kenar}`, alignItems: 'center' }}>
              <Typography sx={{ fontSize: 10, color: KONSOL.metinIkincil }}>● görev</Typography>
              <Typography sx={{ fontSize: 10, color: '#ffeb3b' }}>◉ hedef</Typography>
              <Typography sx={{ fontSize: 10, color: '#ff8a80' }}>┅ rota</Typography>
              <Typography sx={{ fontSize: 10, color: '#7dd3fc' }}>⬡ koordinasyon alanı</Typography>
            </Stack>
          )}
        </Stack>


        {!seti && (data?.totalCount ?? 0) === 0 && (
          <Paper
            elevation={3}
            sx={{
              position: 'absolute',
              top: '45%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              p: 2,
              zIndex: 5,
              bgcolor: KONSOL.yuzey,
              border: `1px solid ${KONSOL.kenar}`,
            }}
          >
            <Typography variant="body2" sx={{ color: KONSOL.metinIkincil }}>
              Seçili pencerede gözlem yok — kaynaklar akmaya başlayınca izler
              burada belirir (docker ortamında source-* servisleri).
            </Typography>
          </Paper>
        )}

        {/* KAIROS↔GAIA: haritaya gömülü mini Sync Matrix — blok tıkla → haritada
            odaklan; blok sürükle → GERÇEK planı yeniden zamanla */}
        {senkronAcik && senkronPaket && (
          <Paper
            id="senkron-mini-panel"
            elevation={6}
            sx={{
              position: 'absolute',
              ...(senkronGen ? { right: 12, width: senkronGen } : { left: 12, right: 12 }),
              bottom: 12,
              zIndex: 6,
              p: 1,
              pt: 1.25,
              height: senkronSerit ? 40 : senkronYuk,
              overflow: senkronSerit ? 'hidden' : 'auto',
              bgcolor: 'rgba(20,31,53,.96)',
              border: `1px solid ${KONSOL.kenar}`,
              color: KONSOL.metin,
              userSelect: yukCek || koseCek ? 'none' : undefined,
            }}
          >
            {/* SOL-ÜST KÖŞE: gadget gibi iki eksenli boyutlandırma */}
            <Box
              onPointerDown={(e) => {
                e.preventDefault();
                setKoseCek(true);
              }}
              title="Köşeden çek: genişlik + yükseklik"
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 18,
                height: 18,
                cursor: 'nwse-resize',
                zIndex: 2,
                '&:hover > span, &:active > span': { borderColor: 'primary.main', opacity: 1 },
              }}
            >
              <Box
                component="span"
                sx={{
                  position: 'absolute',
                  top: 3,
                  left: 3,
                  width: 10,
                  height: 10,
                  borderTop: '2.5px solid',
                  borderLeft: '2.5px solid',
                  borderColor: 'grey.400',
                  borderTopLeftRadius: 3,
                  opacity: 0.7,
                  transition: 'all .15s',
                }}
              />
            </Box>
            {senkronSerit ? (
              <Stack direction="row" spacing={1} onClick={seritToggle} sx={{ alignItems: 'center', height: '100%', px: 1, cursor: 'pointer' }}>
                <Typography sx={{ fontSize: 11, fontWeight: 800, fontFamily: KONSOL.mono, color: KONSOL.metinIkincil, letterSpacing: 1 }}>
                  SYNC MATRIX
                </Typography>
                {senkronPaket && (
                  <>
                    <Typography sx={{ fontSize: 11, color: KONSOL.metin }} noWrap>{senkronPaket.plan.ad}</Typography>
                    <Chip size="small" label={`bitiş ${fmtH(senkronPaket.bitisDk)}`} sx={{ height: 18, fontSize: 10, bgcolor: KONSOL.bant, color: KONSOL.vurgu, fontFamily: KONSOL.mono }} />
                    <Chip size="small" label={`${senkronPaket.plan.gorevler.length} görev`} sx={{ height: 18, fontSize: 10, bgcolor: KONSOL.bant, color: KONSOL.metinIkincil }} />
                    <Chip size="small" label={`kritik ${senkronPaket.cpm.kritikSayisi}`} sx={{ height: 18, fontSize: 10, bgcolor: '#7f1d1d', color: '#fecaca' }} />
                    {(senkronPaket.cakismalar?.length ?? 0) > 0 && (
                      <Chip size="small" label={`⚠ ${senkronPaket.cakismalar!.length} çakışma`} sx={{ height: 18, fontSize: 10, bgcolor: '#7c2d12', color: '#fed7aa' }} />
                    )}
                  </>
                )}
                <Box sx={{ flexGrow: 1 }} />
                <Typography sx={{ fontSize: 11, color: KONSOL.vurgu }}>▲ genişlet</Typography>
              </Stack>
            ) : (
              <>
            {/* ÜST KENAR: çek → panel yüksekliği (dashboard gibi ayarlanabilir) */}
            <Box
              onPointerDown={(e) => {
                e.preventDefault();
                setYukCek(true);
              }}
              title="Çek: panel yüksekliğini ayarla"
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 8,
                cursor: 'ns-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                '&:hover > span, &:active > span': { bgcolor: 'primary.main', opacity: 1 },
              }}
            >
              <Box component="span" sx={{ width: 44, height: 4, borderRadius: 2, bgcolor: 'grey.400', opacity: 0.7, transition: 'all .15s' }} />
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 0.5, mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: KONSOL.metin }}>
                SYNC MATRIX — {senkronPaket.plan.ad}
              </Typography>
              <Typography variant="caption" sx={{ color: KONSOL.metinIkincil }}>
                bitiş {fmtH(senkronPaket.bitisDk)} · {senkronPaket.plan.gorevler.length} görev ·
                kritik {senkronPaket.cpm.kritikSayisi} · blok tıkla → haritada odak · sürükle → yeniden planla
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              {/* PLAYBACK — haritayla entegre: oynarken kamera aktif göreve süzülür */}
              <IconButton
                size="small"
                sx={{ color: KONSOL.vurgu, py: 0 }}
                onClick={() => {
                  if (!oynuyor && playDk == null) setPlayDk(pTMin);
                  setOynuyor((v) => !v);
                }}
              >
                {oynuyor ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
              </IconButton>
              <Slider
                size="small"
                min={pTMin}
                max={pTMax}
                step={5}
                value={playDk ?? pTMin}
                onChange={(_, v) => {
                  setOynuyor(false);
                  setPlayDk(v as number);
                }}
                sx={{ width: 130, color: '#38bdf8', py: 0 }}
              />
              <Chip
                size="small"
                label={playDk != null ? fmtH(playDk) : '● CANLI'}
                onClick={() => {
                  setOynuyor(false);
                  setPlayDk(null);
                }}
                sx={{ height: 18, fontSize: 10, fontWeight: 800, fontFamily: KONSOL.mono, bgcolor: playDk != null ? '#0c4a6e' : '#14532d', color: playDk != null ? '#7dd3fc' : '#86efac', cursor: 'pointer' }}
              />
              <Button
                size="small"
                sx={{ textTransform: 'none', py: 0 }}
                onClick={() => navigate('/senkron')}
              >
                Tam ekran
              </Button>
              <Button size="small" sx={{ textTransform: 'none', py: 0, color: KONSOL.metinIkincil }} onClick={seritToggle}>
                ▼ şerit
              </Button>
              <Button size="small" sx={{ textTransform: 'none', py: 0, color: KONSOL.metinIkincil }} onClick={() => setSenkronAcik(false)}>
                Kapat
              </Button>
            </Stack>
            <GanttTimeline
              plan={senkronPaket.plan}
              cpm={senkronPaket.cpm}
              scale={2.5}
              renkMod={panelRenk}
              onRenkMod={setPanelRenk}
              playheadDk={playDk}
              gecmis={senkronPaket.gecmis}
              onGeri={() => void uygulaH(geriAl('canli'), '↶ Geri alındı')}
              onIleri={() => void uygulaH(ileriAl('canli'), '↷ İleri alındı')}
              onDurum={(id, durum) => void uygulaH(gorevDurum('canli', id, durum), `Durum: ${durum}`)}
              onSil={(id) => {
                if (window.confirm('Görev silinsin mi?')) void uygulaH(gorevSil('canli', id), 'Görev silindi');
              }}
              onBagimlilikEkle={(o, sn) => void uygulaH(bagimlilikEkle('canli', { oncekiId: o, sonrakiId: sn, tur: 'FS' }), '🔗 Bağ kuruldu')}
              onBagimlilikSil={(o, sn) => void uygulaH(bagimlilikSil('canli', o, sn), '✂ Bağ kaldırıldı')}
              onBagimlilikDegistir={async (d, yeni) => {
                const r1 = await bagimlilikSil('canli', d.oncekiId, d.sonrakiId);
                if (isHata(r1)) {
                  setHaritaBildirim(`⚠ ${r1.hata}`);
                  return;
                }
                void uygulaH(
                  bagimlilikEkle('canli', { oncekiId: d.oncekiId, sonrakiId: d.sonrakiId, tur: yeni.tur ?? d.tur, gecikmeDk: yeni.gecikmeDk ?? d.gecikmeDk }),
                  'Bağ güncellendi',
                );
              }}
              onSureDegis={(id, sure) => uygulaH(gorevGuncelle('canli', id, { sureDk: sure }), `Süre: ${sure} dk`)}
              onSatirTasi={(sira) => void uygulaH(satirSirala('canli', sira), 'Satır sıralaması kaydedildi')}
              onBoslukCiftTik={(varlikId, baslangicDk) =>
                void uygulaH(
                  gorevEkle('canli', { ad: 'Yeni görev', varlikId, baslangicDk, sureDk: 20 }),
                  `Görev eklendi (${fmtH(baslangicDk)}) — sağ tık/kenardan düzenle`,
                )
              }
              cakismalar={senkronPaket.cakismalar}
              onKaydir={async (gorevId, baslangicDk) => {
                const r = await kaydirGorev('canli', gorevId, baslangicDk);
                qc.invalidateQueries({ queryKey: ['senkron-plan'] });
                qc.invalidateQueries({ queryKey: ['senkron-geo'] });
                return !isHata(r); // başarısızsa blok eski konumuna döner
              }}
              onGorevClick={(g) => {
                setSeciliGorevId(g.id); // seçim köprüsü: matris ↔ harita aynı görevi konuşur
                // görevin geo özelliğine uç (varlık konumu; yoksa hedef)
                const f = senkronGeo?.features.find(
                  (x) =>
                    x.properties.gorevId === g.id &&
                    (x.properties.rol === 'gorev' || x.properties.rol === 'hedef') &&
                    x.geometry.type === 'Point',
                );
                const map = mapRef.current;
                if (f && map && f.geometry.type === 'Point') {
                  map.stop(); // önceki animasyonla çakışma = kasma
                  map.flyTo({ center: f.geometry.coordinates, zoom: 8, duration: 700, essential: true, curve: 1.25 });
                }
              }}
              onVarlik={(id) => detay.ac('platform', id)}
              onGorevHover={setHoverGorev}
              onDuzenle={setDuzenleGorev}
              seciliId={seciliGorevId}
            />
              </>
            )}
          </Paper>
        )}

        {/* İZ SAĞ-TIK MENÜSÜ — haritadan detay/angaje/Sync Matrix */}
        <Menu
          open={!!izMenu}
          onClose={() => { setIzMenu(null); setAngajeKur(false); }}
          anchorReference="anchorPosition"
          anchorPosition={izMenu ? { top: izMenu.y, left: izMenu.x } : undefined}
          slotProps={{ paper: { sx: { bgcolor: '#141f35', color: '#e2e8f0', border: '1px solid rgba(148,163,184,.2)', minWidth: 200 } } }}
        >
          <Box sx={{ px: 1.5, py: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#7c8db0', fontFamily: 'monospace' }}>
              {izMenu?.iz.iz_no ?? izMenu?.iz.__pk} · {izMenu?.iz.siniflandirma}
            </Typography>
          </Box>
          <Divider sx={{ borderColor: 'rgba(148,163,184,.2)' }} />
          <MenuItem
            dense
            onClick={() => {
              if (izMenu) detayRef.current(izMenu.iz.__type ?? 'iz', izMenu.iz.__pk ?? izMenu.iz.iz_no);
              setIzMenu(null);
            }}
          >
            🔎 Nesne detayı
          </MenuItem>
          <Divider sx={{ borderColor: 'rgba(148,163,184,.2)' }} />
          <MenuItem
            dense
            sx={{ color: angajeKur ? '#fbbf24' : '#f87171', fontWeight: 700 }}
            onClick={async () => {
              if (!angajeKur) { setAngajeKur(true); return; } // adım 1: KUR
              const izNo = izMenu?.iz.iz_no;
              setIzMenu(null);
              setAngajeKur(false);
              if (!izNo) return;
              const r = await sensorToShooter(izNo);
              setHaritaBildirim(isHata(r) ? `⚠ ${r.hata}` : `✜ Angajman görevi eklendi: ${izNo}`);
              qc.invalidateQueries({ queryKey: ['senkron-plan'] });
              qc.invalidateQueries({ queryKey: ['senkron-geo'] });
              if (!senkronAcik) setSenkronAcik(true); // sonuç haritada hemen görünsün
            }}
          >
            {angajeKur ? '⚠ ONAYLA — COA → plana angajman görevi' : '⚡ Angaje et…'}
          </MenuItem>
          <MenuItem dense onClick={() => { setIzMenu(null); navigate('/senkron'); }}>
            📊 Sync Matrix'i aç
          </MenuItem>
        </Menu>
        <Drawer
          anchor="right"
          open={!!duzenleGorev}
          onClose={() => setDuzenleGorev(null)}
          slotProps={{ paper: { sx: { bgcolor: KONSOL.yuzey, color: KONSOL.metin } } }}
        >
          {duzenleGorev && senkronPaket && (
            <GorevDetay
              key={duzenleGorev.id}
              gorev={senkronPaket.plan.gorevler.find((g) => g.id === duzenleGorev.id) ?? duzenleGorev}
              plan={senkronPaket.plan}
              cpm={senkronPaket.cpm}
              planId="canli"
              varliklar={varliklarQ.data ?? []}
              onClose={() => setDuzenleGorev(null)}
              onDegisti={() => {
                qc.invalidateQueries({ queryKey: ['senkron-plan'] });
                qc.invalidateQueries({ queryKey: ['senkron-geo'] });
              }}
              onDurum={(id, durum) => void uygulaH(gorevDurum('canli', id, durum), `Durum: ${durum}`)}
              onBildirim={setHaritaBildirim}
              onVarlik={(id) => detay.ac('platform', id)}
            />
          )}
        </Drawer>
        <Snackbar
          open={!!haritaBildirim}
          autoHideDuration={4000}
          onClose={() => setHaritaBildirim(null)}
          message={haritaBildirim}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          slotProps={{ content: { sx: { bgcolor: KONSOL.yuzey, color: KONSOL.metin, border: `1px solid ${KONSOL.kenar}` } } }}
        />
      </Box>
    </Box>
  );
}
