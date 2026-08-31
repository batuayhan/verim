import AddIcon from '@mui/icons-material/Add';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BoltIcon from '@mui/icons-material/Bolt';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import LayersIcon from '@mui/icons-material/Layers';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SendIcon from '@mui/icons-material/Send';
import TimelineIcon from '@mui/icons-material/Timeline';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  Slider,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLiveMode } from '../api/live';
import { assistantChat } from '../asistan/api';
import { TopNav } from '../components/TopNav';
import { getTehditler } from '../karar/api';
import { useNesneDetay } from '../nesne/NesneDetay';
import {
  bagimlilikEkle,
  bagimlilikSil,
  gorevDurum,
  gorevEkle,
  gorevGuncelle,
  gorevSil,
  getFark,
  getPlan,
  getPlanById,
  getPlanlar,
  geriAl,
  getVarliklar,
  hSaatiAyarla,
  ileriAl,
  isHata,
  kaydirGorev,
  satirSirala,
  planSil,
  planTerfi,
  senaryoTuret,
  sensorToShooter,
  topluKaydir,
  type GorevDurum,
  type GorevTur,
  type PlanFarki,
  ISTENEN_ETKI_AD,
  type PlanGorev,
  type SenkronPaket,
  type Varlik,
} from './api';
import { KONSOL, KonsolTema, KpiRozet } from '../components/konsol';
import { MdMetin } from '../components/MdMetin';
import { GanttTimeline, type RenkMod } from './GanttTimeline';

const fmtH = (dk: number) => {
  const s = dk < 0 ? '−' : '+';
  const a = Math.abs(dk);
  return `H${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
};
const DURUM_ETIKET: Record<GorevDurum, string> = {
  planli: 'Planlı',
  onayli: 'Onaylı',
  icrada: 'İcrada',
  tamam: 'Tamam',
  gecikme: 'Gecikme',
  iptal: 'İptal',
};
const TUR_ADI: Record<GorevTur, string> = {
  kilometre_tasi: 'Kilometre taşı',
  hareket: 'İntikal',
  gorev: 'Görev',
  angajman: 'Angajman',
  elektronik_harp: 'Elektronik harp',
  kesif: 'Keşif',
  lojistik: 'Lojistik',
};
const TUR_LISTE = Object.keys(TUR_ADI) as GorevTur[];
/** Header'daki domain çipleri hem filtre hem LEJANT — kanvas renkleriyle birebir */
const DOMAIN_RENKLER: Record<string, string> = {
  Hava: '#1565c0', Deniz: '#00838f', Kara: '#558b2f', Siber: '#6a1b9a', Uzay: '#283593', Angajman: '#c62828',
};
/** Durum çubuğundaki görev-tipi anahtarı (renkMod=tur iken, sıfır tık) */
const TUR_ANAHTAR: Record<string, string> = {
  'Angajman': '#c62828', 'Keşif/ISR': '#f9a825', 'EW': '#6a1b9a', 'İntikal': '#1565c0', 'Lojistik': '#2e7d32', 'Görev': '#455a64',
};


export function SyncMatrixPage() {
  const { refetchInterval } = useLiveMode();
  const qc = useQueryClient();
  const detay = useNesneDetay();
  const navigate = useNavigate();
  const [planId, setPlanId] = useState('canli');
  const [seciliGorev, setSeciliGorev] = useState<PlanGorev | null>(null);
  // BİLEŞENLER KONUŞUR: kritik yol şeridi / uyarı popover'ı bir görevi işaret
  // edince Gantt'ta zinciri yanar (dış hover köprüsü)
  const [hoverDis, setHoverDis] = useState<string | null>(null);
  // Odak köprüsü: görevi SEÇ (kanvas kayar + vurgu) ama DÜZENLEME çekmecesini açma
  const [odakId, setOdakId] = useState<string | null>(null);
  const [s2sIz, setS2sIz] = useState('');
  const [bildirim, setBildirim] = useState<string | null>(null);
  const [fark, setFark] = useState<PlanFarki | null>(null);
  const [domainKapali, setDomainKapali] = useState<Set<string>>(new Set());
  const [bazOverlay, setBazOverlay] = useState(false);
  const [ekleAcik, setEkleAcik] = useState(false);
  // Çift-tık ön-dolgusu: boş alana çift tıklanınca varlık+zaman hazır gelir
  const [ekleOn, setEkleOn] = useState<{ varlikId?: string; baslangicDk?: number }>({});
  const [hAcik, setHAcik] = useState(false);
  const [hDeger, setHDeger] = useState('');
  const [renkMod, setRenkMod] = useState<RenkMod>('domain');
  // Konsol durum çubuğu etkileşimleri
  const [kritikAcik, setKritikAcik] = useState(true); // kritik yol şeridi (Kritik rozeti açar/kapar)
  const [uyariAnchor, setUyariAnchor] = useState<{ el: HTMLElement; tur: 'ihlal' | 'cakisma' } | null>(null);
  const [aipKomut, setAipKomut] = useState(''); // AIP dock girdisi (uyarı önerileri buraya yazar)
  const [tasmaAnchor, setTasmaAnchor] = useState<HTMLElement | null>(null); // ⋯ taşma menüsü
  // Playback (Kairos): imleç konumu (H'e göre dk) + oynatma durumu
  const [playDk, setPlayDk] = useState<number | null>(null);
  const [oynuyor, setOynuyor] = useState(false);

  const planlar = useQuery({ queryKey: ['senkron-planlar'], queryFn: getPlanlar, refetchInterval });
  const paketQ = useQuery({
    queryKey: ['senkron-plan', planId],
    queryFn: () => (planId === 'canli' ? getPlan() : getPlanById(planId)),
    refetchInterval,
  });
  const tehditler = useQuery({ queryKey: ['tehditler', 'senkron'], queryFn: () => getTehditler(15) });
  const varliklarQ = useQuery({ queryKey: ['senkron-varliklar'], queryFn: getVarliklar });

  const paket = paketQ.data && !isHata(paketQ.data) ? (paketQ.data as SenkronPaket) : undefined;
  const senaryoMu = paket?.plan.tur === 'senaryo';
  const varliklar = varliklarQ.data ?? [];

  const domainler = useMemo(
    () => [...new Set((paket?.plan.gorevler ?? []).map((g) => g.domain))].sort(),
    [paket?.plan.gorevler],
  );
  // domain filtreli görünüm (CPM tam plandan; Gantt sadece görünür satırları çizer)
  const gorunenPlan = useMemo(() => {
    if (!paket) return undefined;
    if (domainKapali.size === 0) return paket.plan;
    const gorevler = paket.plan.gorevler.filter((g) => !domainKapali.has(g.domain));
    const gorunur = new Set(gorevler.map((g) => g.id));
    return {
      ...paket.plan,
      gorevler,
      bagimliliklar: paket.plan.bagimliliklar.filter(
        (d) => gorunur.has(d.oncekiId) && gorunur.has(d.sonrakiId),
      ),
    };
  }, [paket, domainKapali]);

  // PLANA DAYALI öneriler — uyarı popover'ında asistan eylemi olarak sunulur
  const dinamikOneriler = useMemo(() => {
    const d: string[] = [];
    for (const c of (paket?.cakismalar ?? []).slice(0, 2))
      d.push(`${c.varlikAd ?? c.varlikId} üzerindeki çakışmayı çöz (${c.aAd} ↔ ${c.bAd})`);
    if (paket?.cpm?.ihlaller?.length) d.push('Bağımlılık ihlallerini düzelt');
    const gecikmis = paket?.plan.gorevler.filter((g) => g.durum === 'gecikme').length ?? 0;
    if (gecikmis) d.push(`${gecikmis} gecikmiş görevi yeniden planla`);
    return d;
  }, [paket]);

  // Plan zaman aralığı (playback kaydırıcısı + sığdır için)
  const { tMin, tMax } = useMemo(() => {
    const gorevler = paket?.plan.gorevler ?? [];
    if (!gorevler.length) return { tMin: 0, tMax: 60 };
    const starts = gorevler.map((g) => g.baslangicDk);
    const ends = gorevler.map((g) => g.baslangicDk + g.sureDk);
    return {
      tMin: Math.floor((Math.min(0, ...starts) - 15) / 15) * 15,
      tMax: Math.ceil((Math.max(0, ...ends) + 15) / 15) * 15,
    };
  }, [paket?.plan.gorevler]);

  // Playback: ~50 ms'de +1 dk (tüm plan saniyeler içinde akar), sonda durur
  useEffect(() => {
    if (!oynuyor) return;
    const t = setInterval(() => {
      setPlayDk((d) => {
        const y = (d ?? tMin) + 1;
        if (y >= tMax) {
          setOynuyor(false);
          return tMax;
        }
        return y;
      });
    }, 50);
    return () => clearInterval(t);
  }, [oynuyor, tMin, tMax]);

  // zoom/sığdır/geri-ileri artık BİLEŞENİN İÇİNDE (yeniden kullanılabilirlik)

  const tazele = () => {
    qc.invalidateQueries({ queryKey: ['senkron-plan'] });
    qc.invalidateQueries({ queryKey: ['senkron-planlar'] });
  };
  const uygula = async (
    p: Promise<SenkronPaket | { hata: string }>,
    basari: (r: SenkronPaket) => string,
  ): Promise<boolean> => {
    try {
      const r = await p;
      if (isHata(r)) {
        setBildirim(`⚠ ${r.hata}`); // hata KULLANICIYA görünür
        tazele();
        return false; // bileşen optimistik konumu geri alır
      }
      setBildirim(basari(r));
      tazele();
      return true;
    } catch (e) {
      setBildirim(`⚠ Sunucuya ulaşılamadı: ${e instanceof Error ? e.message : 'bilinmeyen hata'}`);
      return false;
    }
  };

  const handleKaydir = (gorevId: string, baslangicDk: number) =>
    uygula(kaydirGorev(planId, gorevId, baslangicDk), (r) => {
      const n = r.kaydirilanlar?.length ?? 0;
      return n > 1 ? `${n} adım zincirleme yeniden planlandı` : 'Adım yeniden planlandı';
    });
  const handleDurum = (gorevId: string, durum: GorevDurum) =>
    uygula(gorevDurum(planId, gorevId, durum), (r) =>
      r.emir ? `⚡ ${r.emir.mesaj}` : `Durum: ${DURUM_ETIKET[durum]}`,
    ); // drawer durumu refetch'ten okunur (hata olursa değişmez)
  const handleSenaryo = async () => {
    const r = await senaryoTuret();
    if (isHata(r)) {
      setBildirim(`⚠ ${r.hata}`);
      return;
    }
    setPlanId(r.plan.id);
    setBildirim('What-if senaryo dalı oluşturuldu — canlı plan korunuyor');
    qc.invalidateQueries({ queryKey: ['senkron-planlar'] });
  };
  const handleTerfi = () => {
    if (
      !window.confirm(
        'Bu senaryo CANLI planın YERİNE geçecek (canlıda dallanma sonrası yapılan düzenlemeler kaybolabilir). Terfi edilsin mi?',
      )
    )
      return;
    return uygula(planTerfi(planId), () => 'Senaryo canlı plana terfi edildi').then(() =>
      setPlanId('canli'),
    );
  };
  const handleS2S = () => {
    if (!s2sIz) return;
    uygula(sensorToShooter(s2sIz, planId) as Promise<SenkronPaket | { hata: string }>, (r) =>
      `Sensörden-atıcıya: ${r.yeniGorev?.ad ?? 'angajman eklendi'}`,
    );
    setS2sIz('');
  };
  const handleTopluKaydir = (deltaDk: number) =>
    uygula(topluKaydir(planId, deltaDk), () => `Tüm plan ${deltaDk > 0 ? '+' : ''}${deltaDk} dk kaydırıldı`);
  const handleGeri = () => uygula(geriAl(planId), () => '↶ Geri alındı');
  const handleIleri = () => uygula(ileriAl(planId), () => '↷ İleri alındı');

  // Ctrl/Cmd+Z → geri al, Ctrl+Shift+Z veya Ctrl+Y → ileri al (girdi alanları hariç)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) void handleIleri();
        else void handleGeri();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        void handleIleri();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  const handleSil = async () => {
    if (!window.confirm('Bu what-if senaryosu KALICI olarak silinecek. Silinsin mi?')) return;
    const r = await planSil(planId);
    if (isHata(r)) {
      setBildirim(`⚠ ${r.hata}`);
      return;
    }
    setPlanId('canli');
    setBildirim('Senaryo silindi — canlı plana dönüldü');
    qc.invalidateQueries({ queryKey: ['senkron-planlar'] });
  };
  const handleFark = async () => setFark(await getFark(planId));

  const domainToggle = (d: string) =>
    setDomainKapali((s) => {
      const n = new Set(s);
      n.has(d) ? n.delete(d) : n.add(d);
      return n;
    });

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#070b13', overflow: 'hidden' }}>
      <TopNav />
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 1600, mx: 'auto', px: 2, pt: 1, pb: 0.5, gap: 1 }}>
        {/* Kompakt başlık — alt yazı tooltip'te, senaryo rozeti burada */}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <TimelineIcon color="primary" fontSize="small" />
          <Tooltip title="Çok-alanlı zaman/kaynak/senaryo orkestrasyonu · CPM · canlı ontoloji">
            <Typography variant="h6" sx={{ fontWeight: 700, cursor: 'default' }}>
              Sync Matrix
            </Typography>
          </Tooltip>
          {senaryoMu && <Chip label="WHAT-IF SENARYO" color="warning" size="small" sx={{ fontWeight: 700 }} />}
        </Stack>

        {/* Döngü hatası: CPM geçersiz → sayfa çapında bağırır (rozet değil) */}
        {paket?.cpm.dongu && (
          <Alert severity="error" sx={{ flexShrink: 0 }}>
            Bağımlılıklarda döngü var — kritik yol hesaplanamıyor. Son bağı kaldırın (Ctrl+Z).
          </Alert>
        )}

        {paketQ.isLoading ? (
          <Box sx={{ p: 6, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : !paket || !gorunenPlan ? (
          <Alert severity="error">Plan alınamadı</Alert>
        ) : (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 1.5,
              overflow: 'hidden',
              border: '1px solid #26324d',
              bgcolor: '#0b1220',
            }}
          >
            {/* ═══ KONSOL BAŞLIK ÇUBUĞU — tüm plan eylemleri çerçevede ═══ */}
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ alignItems: 'center', flexWrap: 'wrap', pl: 1, pr: 1.5, py: 0.6, borderBottom: '1px solid rgba(148,163,184,.14)', flexShrink: 0, rowGap: 0.5 }}
            >
              <Select
                size="small"
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                variant="outlined"
                sx={{
                  minWidth: 150,
                  color: '#e2e8f0',
                  fontSize: 13,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(148,163,184,.25)' },
                  '& .MuiSvgIcon-root': { color: '#7c8db0' },
                }}
              >
                <MenuItem value="canli">🟢 Canlı Plan</MenuItem>
                {(planlar.data ?? [])
                  .filter((p) => p.id !== 'canli')
                  .map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      🔀 {p.name}
                    </MenuItem>
                  ))}
              </Select>
              <Tooltip title="Harekât başlangıcı (H-saati) — tüm H± zamanlar ve cetvel bu ana göre">
                <Chip
                  size="small"
                  onClick={() => {
                    const ref = paket?.plan.hEsRefISO ? new Date(paket.plan.hEsRefISO) : new Date();
                    const p2 = (n: number) => String(n).padStart(2, '0');
                    setHDeger(
                      `${ref.getFullYear()}-${p2(ref.getMonth() + 1)}-${p2(ref.getDate())}T${p2(ref.getHours())}:${p2(ref.getMinutes())}`,
                    );
                    setHAcik(true);
                  }}
                  label={`H = ${
                    paket?.plan.hEsRefISO
                      ? new Date(paket.plan.hEsRefISO).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : '—'
                  }`}
                  sx={{ fontFamily: 'monospace', fontWeight: 700, bgcolor: '#16233c', color: '#7dd3fc', cursor: 'pointer' }}
                />
              </Tooltip>
              <Button size="small" startIcon={<AltRouteIcon />} onClick={handleSenaryo} sx={{ color: '#9fb3d8', textTransform: 'none' }}>
                What-if
              </Button>
              {senaryoMu && (
                <>
                  <Button size="small" onClick={handleFark} sx={{ color: '#9fb3d8', textTransform: 'none' }}>
                    Farkı gör
                  </Button>
                  {fark && (
                    <Tooltip
                      title={`Bitiş ${fmtH(fark.eskiSureDk)} → ${fmtH(fark.yeniSureDk)} (${fark.yeniSureDk - fark.eskiSureDk >= 0 ? '+' : ''}${fark.yeniSureDk - fark.eskiSureDk} dk) · ${fark.degisiklikler.length} değişiklik${fark.kritikYolDegisti ? ' · KRİTİK YOL DEĞİŞTİ' : ''}`}
                    >
                      <Chip
                        size="small"
                        color={fark.kritikYolDegisti ? 'warning' : 'info'}
                        label={`Δ ${fark.yeniSureDk - fark.eskiSureDk >= 0 ? '+' : ''}${fark.yeniSureDk - fark.eskiSureDk} dk · ${fark.degisiklikler.length} değişiklik`}
                        onDelete={() => setFark(null)}
                        sx={{ fontWeight: 700 }}
                      />
                    </Tooltip>
                  )}
                  <Button size="small" variant="contained" color="success" startIcon={<ArrowUpwardIcon />} onClick={handleTerfi} sx={{ textTransform: 'none' }}>
                    Canlıya terfi
                  </Button>
                  <Button
                    size="small"
                    startIcon={<LayersIcon />}
                    onClick={() => setBazOverlay((v) => !v)}
                    sx={{ color: bazOverlay ? '#7dd3fc' : '#9fb3d8', textTransform: 'none' }}
                  >
                    Baz
                  </Button>
                  <IconButton size="small" onClick={handleSil} title="Senaryoyu sil" sx={{ color: '#f87171' }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </>
              )}

              <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(148,163,184,.2)' }} />
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setEkleAcik(true)} sx={{ textTransform: 'none', color: '#7dd3fc', borderColor: 'rgba(125,211,252,.4)' }}>
                Görev
              </Button>
              <IconButton size="small" onClick={(e) => setTasmaAnchor(e.currentTarget)} sx={{ color: '#7c8db0' }} title="Diğer eylemler">
                <MoreHorizIcon fontSize="small" />
              </IconButton>
              {/* Domain çipleri = filtre + LEJANT (domain renginde) */}
              {domainler.map((d) => (
                <Chip
                  key={d}
                  size="small"
                  label={d}
                  onClick={() => domainToggle(d)}
                  sx={{
                    fontWeight: 700,
                    cursor: 'pointer',
                    bgcolor: domainKapali.has(d) ? 'transparent' : (DOMAIN_RENKLER[d] ?? '#607d8b'),
                    color: domainKapali.has(d) ? '#5c6f8f' : '#fff',
                    border: `1px solid ${DOMAIN_RENKLER[d] ?? '#607d8b'}`,
                    textDecoration: domainKapali.has(d) ? 'line-through' : undefined,
                  }}
                />
              ))}

              <Box sx={{ flexGrow: 1 }} />

              {/* ═ KARANTİNA: sensörden-atıcıya — çerçevedeki TEK kırmızı düğme ═ */}
              <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(148,163,184,.2)', ml: 2 }} />
              <Select
                size="small"
                displayEmpty
                value={s2sIz}
                onChange={(e) => setS2sIz(e.target.value)}
                renderValue={(v) => (v ? String(v) : 'Tehdit izi…')}
                sx={{
                  ml: 1,
                  minWidth: 128,
                  color: s2sIz ? '#fca5a5' : '#5c6f8f',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(148,163,184,.2)' },
                  '& .MuiSvgIcon-root': { color: '#7c8db0' },
                }}
              >
                {(tehditler.data ?? []).map((t) => (
                  <MenuItem key={t.iz_no} value={t.iz_no}>
                    {t.iz_no} · {t.siniflandirma} ({t.tehdit_skoru})
                  </MenuItem>
                ))}
              </Select>
              <Button size="small" variant="contained" color="error" startIcon={<BoltIcon />} disabled={!s2sIz} onClick={handleS2S} sx={{ textTransform: 'none', fontWeight: 800 }}>
                Angaje
              </Button>
            </Stack>

            {/* ═══ KANVAS — iç dikey kaydırma; cetvel/başlıklar yapışkan ═══ */}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <GanttTimeline
                plan={gorunenPlan}
                cpm={paket.cpm}
                cakismalar={paket.cakismalar}
                gecmis={paket.gecmis}
                onGeri={handleGeri}
                onIleri={handleIleri}
                bazGorevler={bazOverlay && senaryoMu ? paket.plan.bazGorevler : undefined}
                renkMod={renkMod}
                onRenkMod={setRenkMod}
                playheadDk={playDk}
                onSatirTasi={(sira) => uygula(satirSirala(planId, sira), () => 'Satır sıralaması kaydedildi')}
                onBoslukCiftTik={(varlikId, baslangicDk) => {
                  setEkleOn({ varlikId, baslangicDk });
                  setEkleAcik(true);
                }}
                onDurum={handleDurum}
                onSil={(id) => {
                  const g = paket.plan.gorevler.find((x) => x.id === id);
                  if (window.confirm(`"${g?.ad ?? id}" silinsin mi?`))
                    void uygula(gorevSil(planId, id), () => 'Görev silindi');
                }}
                onBagimlilikEkle={(o, sn) =>
                  uygula(bagimlilikEkle(planId, { oncekiId: o, sonrakiId: sn, tur: 'FS' }), () => '🔗 Bağ kuruldu')
                }
                onBagimlilikSil={(o, sn) => uygula(bagimlilikSil(planId, o, sn), () => '✂ Bağ kaldırıldı')}
                onBagimlilikDegistir={async (d, yeni) => {
                  const r1 = await bagimlilikSil(planId, d.oncekiId, d.sonrakiId);
                  if (isHata(r1)) {
                    setBildirim(`⚠ ${r1.hata}`);
                    return;
                  }
                  void uygula(
                    bagimlilikEkle(planId, {
                      oncekiId: d.oncekiId,
                      sonrakiId: d.sonrakiId,
                      tur: yeni.tur ?? d.tur,
                      gecikmeDk: yeni.gecikmeDk ?? d.gecikmeDk,
                    }),
                    () => (yeni.tur ? `↔ Bağ türü: ${yeni.tur === 'SS' ? 'Birlikte başlar' : 'Bitince başlar'}` : `Gecikme: ${yeni.gecikmeDk} dk`),
                  );
                }}
                onSureDegis={(id, sure) => uygula(gorevGuncelle(planId, id, { sureDk: sure }), () => `Süre: ${sure} dk`)}
                onKaydir={handleKaydir}
                onGorevClick={setSeciliGorev}
                onVarlik={(id) => detay.ac('platform', id)}
                onHaritadaGoster={(g) => navigate(`/harita?senkron=1&odak=${encodeURIComponent(g.id)}`)}
                hoverDisId={hoverDis}
                seciliId={seciliGorev?.id ?? odakId}
              />
            </Box>

            {/* ═══ DURUM ÇUBUĞU — KPI rozetleri · playback · tur anahtarı ═══ */}
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ alignItems: 'center', px: 1.25, py: 0.4, borderTop: '1px solid rgba(148,163,184,.14)', flexWrap: 'wrap', flexShrink: 0 }}
            >
              <KpiRozet etiket="Bitiş" deger={fmtH(paket.bitisDk)} />
              <KpiRozet etiket="Görev" deger={String(paket.plan.gorevler.length)} />
              <KpiRozet
                etiket="Kritik"
                deger={String(paket.cpm.kritikSayisi ?? paket.cpm.kritikYol.length)}
                renk="#ff5252"
                aktif={kritikAcik}
                onClick={() => setKritikAcik((v) => !v)}
                ipucu="Kritik yol şeridini aç/kapat"
              />
              <KpiRozet
                etiket="İhlal"
                deger={String(paket.cpm.ihlaller.length)}
                renk={paket.cpm.ihlaller.length ? '#fbbf24' : undefined}
                onClick={paket.cpm.ihlaller.length ? (e) => setUyariAnchor({ el: e.currentTarget, tur: 'ihlal' }) : undefined}
                ipucu="Bağımlılık ihlalleri — tıkla: mesajlar + öneriler"
              />
              <KpiRozet
                etiket="Çakışma"
                deger={String(paket.cakismalar?.length ?? 0)}
                renk={paket.cakismalar?.length ? '#fbbf24' : undefined}
                onClick={paket.cakismalar?.length ? (e) => setUyariAnchor({ el: e.currentTarget, tur: 'cakisma' }) : undefined}
                ipucu="Kaynak çakışmaları — tıkla: mesajlar + öneriler"
              />

              <Box sx={{ flexGrow: 1 }} />
              {/* PLAYBACK aktarımı — kanvas kenarında, her an bir tık */}
              <IconButton
                size="small"
                sx={{ color: '#7dd3fc' }}
                onClick={() => {
                  if (!oynuyor && playDk == null) setPlayDk(tMin);
                  setOynuyor((v) => !v);
                }}
              >
                {oynuyor ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
              </IconButton>
              <Slider
                size="small"
                min={tMin}
                max={tMax}
                step={5}
                value={playDk ?? tMin}
                onChange={(_, v) => {
                  setOynuyor(false);
                  setPlayDk(v as number);
                }}
                sx={{ width: { xs: 120, md: 260 }, color: '#38bdf8' }}
              />
              <Chip
                size="small"
                label={playDk != null ? fmtH(playDk) : '● CANLI'}
                onClick={() => {
                  setOynuyor(false);
                  setPlayDk(null);
                }}
                sx={{ fontWeight: 800, minWidth: 72, fontFamily: 'monospace', bgcolor: playDk != null ? '#0c4a6e' : '#14532d', color: playDk != null ? '#7dd3fc' : '#86efac', cursor: 'pointer' }}
              />
              <Box sx={{ flexGrow: 1 }} />
              {/* tur modunda renk anahtarı — sıfır tık */}
              {renkMod === 'tur' && (
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  {Object.entries(TUR_ANAHTAR).map(([ad, renk]) => (
                    <Stack key={ad} direction="row" spacing={0.4} sx={{ alignItems: 'center' }}>
                      <Box sx={{ width: 9, height: 9, borderRadius: 0.5, bgcolor: renk }} />
                      <Typography sx={{ fontSize: 10, color: '#9fb3d8' }}>{ad}</Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Stack>

            {/* ═══ KRİTİK YOL ŞERİDİ — brif anlatısı (Kritik rozeti kapatır) ═══ */}
            {kritikAcik && paket.cpm.kritikYol.length > 0 && (
              <Stack
                direction="row"
                spacing={0.5}
                sx={{ alignItems: 'center', px: 1.25, py: 0.4, borderTop: '1px solid rgba(148,163,184,.1)', overflowX: 'auto', flexShrink: 0, '&::-webkit-scrollbar': { height: 4 } }}
              >
                <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#5c6f8f', whiteSpace: 'nowrap', letterSpacing: 1 }}>
                  KRİTİK YOL
                </Typography>
                {paket.cpm.kritikYol.map((id, k) => {
                  const g = paket.plan.gorevler.find((x) => x.id === id);
                  return (
                    <Stack key={id} direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
                      {k > 0 && <Box component="span" sx={{ color: '#ff5252', fontSize: 12 }}>→</Box>}
                      <Chip
                        size="small"
                        label={g?.ad ?? id}
                        onClick={() => g && setOdakId(id)}
                        onMouseEnter={() => setHoverDis(id)}
                        onMouseLeave={() => setHoverDis((h) => (h === id ? null : h))}
                        sx={{ bgcolor: '#7f1d1d', color: '#fecaca', fontWeight: 600, height: 20, fontSize: 11, cursor: 'pointer' }}
                      />
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </Box>
        )}
      </Box>

      {/* ═══ AIP DOCK — sayfa altında ince komut satırı (C2 mesaj hattı) ═══ */}
      <AipKutusu onDone={tazele} planId={planId} komut={aipKomut} setKomut={setAipKomut} />

      {/* Taşma menüsü (⋯): toplu kaydırma — kasıtlı sürtünme */}
      <Menu open={!!tasmaAnchor} anchorEl={tasmaAnchor} onClose={() => setTasmaAnchor(null)}>
        <MenuItem dense onClick={() => { setTasmaAnchor(null); void handleTopluKaydir(-15); }}>
          ⏮ Tüm planı 15 dk geri çek
        </MenuItem>
        <MenuItem dense onClick={() => { setTasmaAnchor(null); void handleTopluKaydir(15); }}>
          ⏭ Tüm planı 15 dk ileri al
        </MenuItem>
      </Menu>

      {/* Uyarı popover'ı: mesajlar + plana dayalı AIP önerileri (tek tık kuralı) */}
      <Menu
        open={!!uyariAnchor}
        anchorEl={uyariAnchor?.el}
        onClose={() => setUyariAnchor(null)}
        slotProps={{ paper: { sx: { maxWidth: 420, bgcolor: '#141f35', color: '#e2e8f0', border: '1px solid rgba(148,163,184,.2)' } } }}
      >
        <Box sx={{ px: 1.5, py: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 800, color: '#fbbf24' }}>
            {uyariAnchor?.tur === 'ihlal' ? 'BAĞIMLILIK İHLALLERİ' : 'KAYNAK ÇAKIŞMALARI'}
          </Typography>
          {(uyariAnchor?.tur === 'ihlal'
            ? (paket?.cpm.ihlaller.map((i) => ({ mesaj: i.mesaj, id: i.sonrakiId })) ?? [])
            : (paket?.cakismalar?.map((c) => ({ mesaj: c.mesaj, id: c.aId })) ?? [])
          ).map((m, i) => (
            <Typography
              key={i}
              variant="caption"
              onClick={() => {
                const g = paket?.plan.gorevler.find((x) => x.id === m.id);
                if (g) {
                  setOdakId(m.id); // kanvas göreve kayar + zincir yanar (çekmece AÇMAZ)
                  setUyariAnchor(null);
                }
              }}
              onMouseEnter={() => setHoverDis(m.id)}
              onMouseLeave={() => setHoverDis((h) => (h === m.id ? null : h))}
              sx={{ display: 'block', mt: 0.5, cursor: 'pointer', '&:hover': { color: '#7dd3fc' } }}
            >
              • {m.mesaj}
            </Typography>
          ))}
          {dinamikOneriler.length > 0 && (
            <>
              <Divider sx={{ my: 1, borderColor: 'rgba(148,163,184,.2)' }} />
              <Typography variant="caption" sx={{ color: '#7c8db0' }}>
                Asistana öner:
              </Typography>
              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                {dinamikOneriler.map((o) => (
                  <Button
                    key={o}
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setAipKomut(o);
                      setUyariAnchor(null);
                    }}
                    sx={{ textTransform: 'none', justifyContent: 'flex-start', color: '#7dd3fc', borderColor: 'rgba(125,211,252,.35)', fontSize: 12 }}
                  >
                    ✨ {o}
                  </Button>
                ))}
              </Stack>
            </>
          )}
        </Box>
      </Menu>

      <Drawer
        anchor="right"
        open={!!seciliGorev}
        onClose={() => setSeciliGorev(null)}
        slotProps={{ paper: { sx: { bgcolor: KONSOL.kanvas } } }}
      >
        {seciliGorev && paket && (
          <GorevDetay
            key={seciliGorev.id}
            gorev={paket.plan.gorevler.find((g) => g.id === seciliGorev.id) ?? seciliGorev}
            plan={paket.plan}
            cpm={paket.cpm}
            planId={planId}
            varliklar={varliklar}
            onClose={() => setSeciliGorev(null)}
            onDegisti={tazele}
            onDurum={handleDurum}
            onBildirim={setBildirim}
            onVarlik={(id) => detay.ac('platform', id)}
          />
        )}
      </Drawer>

      <GorevEkleDialog
        key={`${ekleOn.varlikId ?? ''}-${ekleOn.baslangicDk ?? ''}-${ekleAcik}`}
        acik={ekleAcik}
        planId={planId}
        varliklar={varliklar}
        onVarlik={ekleOn.varlikId}
        onBaslangic={ekleOn.baslangicDk}
        onClose={() => setEkleAcik(false)}
        onEklendi={() => {
          setEkleAcik(false);
          tazele();
          setBildirim('Görev eklendi');
        }}
      />

      {/* H-saati ayarı — harekât başlangıç tarihi/saati */}
      <KonsolTema>
      <Dialog open={hAcik} onClose={() => setHAcik(false)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { bgcolor: KONSOL.kanvas, backgroundImage: 'none' } } }}>
        <DialogTitle>Harekât başlangıcı (H-saati)</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Tüm H± zamanları ve ŞİMDİ çizgisi bu ana göre hesaplanır; UTC cetveli de güncellenir.
            </Typography>
            <TextField
              size="small"
              type="datetime-local"
              value={hDeger}
              onChange={(e) => setHDeger(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              const p2 = (n: number) => String(n).padStart(2, '0');
              const s = new Date();
              setHDeger(`${s.getFullYear()}-${p2(s.getMonth() + 1)}-${p2(s.getDate())}T${p2(s.getHours())}:${p2(s.getMinutes())}`);
            }}
          >
            Şimdi
          </Button>
          <Button onClick={() => setHAcik(false)}>Vazgeç</Button>
          <Button
            variant="contained"
            disabled={!hDeger}
            onClick={() => {
              setHAcik(false);
              void uygula(hSaatiAyarla(planId, new Date(hDeger).toISOString()), () => 'H-saati güncellendi');
            }}
          >
            Ayarla
          </Button>
        </DialogActions>
      </Dialog>
      </KonsolTema>

      <Snackbar
        open={!!bildirim}
        autoHideDuration={4000}
        onClose={() => setBildirim(null)}
        message={bildirim}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}


/** İlham örnekleri — tıklanınca kutuya dolar (kullanıcı düzenleyip gönderir). */
const AIP_ORNEKLER = [
  'Tüm birimleri 15 dakika geri çek',
  'B planı adında bir what-if senaryosu oluştur',
  'Hava görevlerini 10 dk ileri al',
  'SEAD görevini onayla',
  'BDA görevini H+90\'a taşı',
  '45 dakikalık yeni bir keşif görevi ekle',
  'Planı oku ve kritik yolu özetle',
  'En tehlikeli iz için angajman görevi ekle',
  'Deniz füze desteğini iptal et',
];
/** Yalnız senaryo görüntülenirken anlamlı örnekler (canlıda hata verirdi). */
const AIP_SENARYO_ORNEKLER = ['Senaryoyu canlı plana terfi ettir', 'Bu senaryonun baz plandan farkını özetle'];

function AipKutusu({
  onDone,
  planId,
  komut,
  setKomut,
}: {
  onDone: () => void;
  planId: string;
  komut: string;
  setKomut: (v: string) => void;
}) {
  const [cevap, setCevap] = useState<string | null>(null);
  const [aksiyonlar, setAksiyonlar] = useState<Array<{ type: string; label: string; [k: string]: unknown }>>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [odak, setOdak] = useState(false);
  const navigate = useNavigate();

  const gonder = async () => {
    if (!komut.trim() || yukleniyor) return;
    setYukleniyor(true);
    setCevap(null);
    setAksiyonlar([]);
    try {
      const r = await assistantChat([{ role: 'user', content: komut }], { path: '/senkron', planId });
      setCevap(r.answer);
      setAksiyonlar((r.actions ?? []) as never);
      onDone();
    } catch (e) {
      setCevap('Asistan hatası: ' + (e instanceof Error ? e.message : 'bilinmeyen'));
    } finally {
      setYukleniyor(false);
      setKomut('');
    }
  };

  const ornekler = [...AIP_ORNEKLER, ...(planId !== 'canli' ? AIP_SENARYO_ORNEKLER : [])];

  return (
    <Box sx={{ position: 'relative', flexShrink: 0, px: 2, pb: 1, maxWidth: 1600, width: '100%', mx: 'auto' }}>
      {/* CEVAP KATMANI — dock'un üstünde yüzer, sayfayı İTMEZ */}
      {cevap && (
        <Paper
          elevation={8}
          sx={{ position: 'absolute', bottom: '100%', left: 16, right: 16, mb: 1, p: 1.5, maxHeight: '45vh', overflow: 'auto', zIndex: 20, border: '1px solid', borderColor: 'divider' }}
        >
          <Stack direction="row" sx={{ alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1 }}>
              <MdMetin metin={cevap} />
              {aksiyonlar.length > 0 && (
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
                  {aksiyonlar.map((a, i) => (
                    <Button
                      key={i}
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        if (a.type === 'harita_goster')
                          navigate(`/harita?${new URLSearchParams(a.params as Record<string, string>).toString()}`);
                        else if (a.type === 'graf_ac') navigate(`/graf?tip=${a.objectType}&pk=${encodeURIComponent(String(a.pk))}`);
                        else if (a.type === 'alarmlar_ac') navigate('/alarmlar');
                        else if (a.type === 'dashboard_ac') navigate(`/?d=${a.dashboardId}`);
                        else if (a.type === 'mercek_ac') navigate(`/mercek/${a.analysisId}`);
                        else if (a.type === 'harman_ac') navigate(`/harman/${a.analysisId}`);
                      }}
                      sx={{ textTransform: 'none' }}
                    >
                      {a.label}
                    </Button>
                  ))}
                </Stack>
              )}
            </Box>
            <IconButton size="small" onClick={() => { setCevap(null); setAksiyonlar([]); }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Paper>
      )}

      {/* ÖRNEK ÇİPLERİ — yalnız odaklanınca, dock'un üstünde yüzer */}
      {odak && !cevap && !komut && (
        <Paper
          elevation={6}
          sx={{ position: 'absolute', bottom: '100%', left: 16, right: 16, mb: 1, p: 1, zIndex: 19 }}
        >
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {ornekler.map((o) => (
              <Chip
                key={o}
                size="small"
                label={o}
                variant="outlined"
                onMouseDown={(e) => {
                  e.preventDefault(); // blur olmadan seç
                  setKomut(o);
                }}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Stack>
        </Paper>
      )}

      {/* İNCE DOCK — C2 mesaj hattı */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <AutoAwesomeIcon color="primary" fontSize="small" />
        <TextField
          size="small"
          fullWidth
          placeholder='Asistana söyle: "tüm birimleri 15 dk geri çek" · "SEAD görevini onayla" · odaklan → örnekler'
          value={komut}
          onChange={(e) => setKomut(e.target.value)}
          onFocus={() => setOdak(true)}
          onBlur={() => setOdak(false)}
          onKeyDown={(e) => e.key === 'Enter' && gonder()}
          disabled={yukleniyor}
          sx={{ '& .MuiInputBase-root': { bgcolor: 'background.paper' } }}
        />
        <Button
          variant="contained"
          onClick={gonder}
          disabled={yukleniyor || !komut.trim()}
          startIcon={yukleniyor ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
          sx={{ flexShrink: 0 }}
        >
          Uygula
        </Button>
      </Stack>
    </Box>
  );
}

export function GorevDetay({
  gorev,
  plan,
  cpm,
  planId,
  varliklar,
  onClose,
  onDegisti,
  onDurum,
  onBildirim,
  onVarlik,
}: {
  gorev: PlanGorev;
  plan: SenkronPaket['plan'];
  cpm: SenkronPaket['cpm'];
  planId: string;
  varliklar: Varlik[];
  onClose: () => void;
  onDegisti: () => void;
  onDurum: (gorevId: string, durum: GorevDurum) => void;
  onBildirim: (m: string) => void;
  onVarlik: (id: string) => void;
}) {
  const [ad, setAd] = useState(gorev.ad);
  const [tur, setTur] = useState<GorevTur>(gorev.tur);
  const [varlikId, setVarlikId] = useState(gorev.varlikId ?? '');
  const [baslangicDk, setBaslangicDk] = useState(String(gorev.baslangicDk));
  const [sureDk, setSureDk] = useState(String(gorev.sureDk));
  const [yeniOnce, setYeniOnce] = useState('');
  // TAKTİK KART (ATO/OPORD alanları) — katlanabilir bölüm
  const [taktikAcik, setTaktikAcik] = useState(
    !!(gorev.cagriAdi || gorev.oncelik || gorev.istenenEtki || gorev.konum || gorev.hedefKonum),
  );
  const [cagriAdi, setCagriAdi] = useState(gorev.cagriAdi ?? '');
  const [oncelik, setOncelik] = useState(gorev.oncelik ? String(gorev.oncelik) : '');
  const [istenenEtki, setIstenenEtki] = useState(gorev.istenenEtki ?? '');
  const [kontrolMakami, setKontrolMakami] = useState(gorev.kontrolMakami ?? '');
  const [frekans, setFrekans] = useState(gorev.frekans ?? '');
  const [muhimmat, setMuhimmat] = useState(gorev.muhimmat ?? '');
  const [kEnlem, setKEnlem] = useState(gorev.konum ? String(gorev.konum.enlem) : '');
  const [kBoylam, setKBoylam] = useState(gorev.konum ? String(gorev.konum.boylam) : '');
  const [bolgeKm, setBolgeKm] = useState(gorev.bolgeYaricapKm ? String(gorev.bolgeYaricapKm) : '');
  const [hEnlem, setHEnlem] = useState(gorev.hedefKonum ? String(gorev.hedefKonum.enlem) : '');
  const [hBoylam, setHBoylam] = useState(gorev.hedefKonum ? String(gorev.hedefKonum.boylam) : '');
  const h = cpm.hesaplar[gorev.id];

  const oncekiler = plan.bagimliliklar.filter((d) => d.sonrakiId === gorev.id);
  const adOf = (id: string) => plan.gorevler.find((g) => g.id === id)?.ad ?? id;
  const digerGorevler = plan.gorevler.filter(
    (g) => g.id !== gorev.id && !oncekiler.some((d) => d.oncekiId === g.id),
  );

  const kaydet = async () => {
    // U6: koordinat aralık doğrulaması (fratrisit vektörü olan kaba hatayı keser)
    const kSet = !!(kEnlem || kBoylam);
    const hSet = !!(hEnlem || hBoylam);
    if (kSet && (Math.abs(Number(kEnlem)) > 90 || Math.abs(Number(kBoylam)) > 180 || !kEnlem || !kBoylam)) {
      onBildirim('⚠ Konum geçersiz — enlem ±90, boylam ±180 ve ikisi de dolu olmalı');
      return;
    }
    if (hSet && (Math.abs(Number(hEnlem)) > 90 || Math.abs(Number(hBoylam)) > 180 || !hEnlem || !hBoylam)) {
      onBildirim('⚠ Hedef koordinatı geçersiz — enlem ±90, boylam ±180 ve ikisi de dolu olmalı');
      return;
    }
    const v = varliklar.find((x) => x.pk === varlikId);
    // "null = alanı sil": boşaltılmış alan sunucuya null gider, eski değer temizlenir
    const metin = (simdi: string, eski?: string) =>
      simdi.trim() ? simdi.trim() : eski != null ? null : undefined;
    const r = await gorevGuncelle(planId, gorev.id, {
      ad: ad.trim() || gorev.ad,
      tur,
      varlikId: varlikId || undefined,
      varlikAd: v?.ad,
      domain: v?.domain ?? gorev.domain,
      baslangicDk: Math.round(Number(baslangicDk) || 0),
      sureDk: Math.max(0, Math.round(Number(sureDk) || 0)),
      // taktik kart — boşaltılan alan null gönderilir (bayat veri kalmaz)
      cagriAdi: metin(cagriAdi, gorev.cagriAdi),
      oncelik: oncelik ? Number(oncelik) : gorev.oncelik != null ? null : undefined,
      istenenEtki: istenenEtki ? (istenenEtki as PlanGorev['istenenEtki']) : gorev.istenenEtki ? null : undefined,
      kontrolMakami: metin(kontrolMakami, gorev.kontrolMakami),
      frekans: metin(frekans, gorev.frekans),
      muhimmat: metin(muhimmat, gorev.muhimmat),
      konum: kSet ? { enlem: Number(kEnlem), boylam: Number(kBoylam) } : gorev.konum ? null : undefined,
      bolgeYaricapKm: bolgeKm ? Number(bolgeKm) : gorev.bolgeYaricapKm != null ? null : undefined,
      hedefKonum: hSet ? { enlem: Number(hEnlem), boylam: Number(hBoylam) } : gorev.hedefKonum ? null : undefined,
    });
    onBildirim(isHata(r) ? `⚠ ${r.hata}` : 'Görev güncellendi');
    onDegisti();
  };
  const sil = async () => {
    const r = await gorevSil(planId, gorev.id);
    onBildirim(isHata(r) ? `⚠ ${r.hata}` : 'Görev silindi');
    onDegisti();
    onClose();
  };
  const depEkle = async () => {
    if (!yeniOnce) return;
    const r = await bagimlilikEkle(planId, { oncekiId: yeniOnce, sonrakiId: gorev.id, tur: 'FS' });
    onBildirim(isHata(r) ? `⚠ ${r.hata}` : 'Bağ kuruldu');
    setYeniOnce('');
    onDegisti();
  };
  const depSil = async (oncekiId: string) => {
    await bagimlilikSil(planId, oncekiId, gorev.id);
    onBildirim('Bağ kaldırıldı');
    onDegisti();
  };

  return (
    <KonsolTema>
    <Box sx={{ width: 400, p: 2.5, bgcolor: KONSOL.kanvas, minHeight: '100%' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Görev düzenle
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Stack>

      <Stack spacing={1.5}>
        <TextField size="small" label="Ad" value={ad} onChange={(e) => setAd(e.target.value)} fullWidth />
        <FormControl size="small" fullWidth>
          <InputLabel>Tür</InputLabel>
          <Select label="Tür" value={tur} onChange={(e) => setTur(e.target.value as GorevTur)}>
            {TUR_LISTE.map((t) => (
              <MenuItem key={t} value={t}>
                {TUR_ADI[t]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" fullWidth>
          <InputLabel>Varlık</InputLabel>
          <Select label="Varlık" value={varlikId} onChange={(e) => setVarlikId(e.target.value)}>
            <MenuItem value="">— (varlıksız)</MenuItem>
            {varliklar.map((v) => (
              <MenuItem key={v.pk} value={v.pk}>
                {v.ad} · {v.domain}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            label="Başlangıç (dk, H'e göre)"
            type="number"
            value={baslangicDk}
            onChange={(e) => setBaslangicDk(e.target.value)}
            fullWidth
          />
          <TextField
            size="small"
            label="Süre (dk)"
            type="number"
            value={sureDk}
            onChange={(e) => setSureDk(e.target.value)}
            fullWidth
          />
        </Stack>
        {/* ── TAKTİK KART: ATO/OPORD görev alanları (katlanabilir) ── */}
        <Box
          onClick={() => setTaktikAcik((v) => !v)}
          sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}
        >
          <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: 0.6, color: 'text.secondary' }}>
            {taktikAcik ? '▼' : '▶'} TAKTİK KART {gorev.gorevNo ? `· ${gorev.gorevNo}` : ''}
          </Typography>
        </Box>
        {taktikAcik && (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="Çağrı adı" value={cagriAdi} onChange={(e) => setCagriAdi(e.target.value)} fullWidth />
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>Öncelik</InputLabel>
                <Select label="Öncelik" value={oncelik} onChange={(e) => setOncelik(e.target.value)}>
                  <MenuItem value="">—</MenuItem>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <MenuItem key={n} value={String(n)}>P{n}{n === 1 ? ' (en yüksek)' : ''}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            <FormControl size="small" fullWidth>
              <InputLabel>İstenen etki</InputLabel>
              <Select label="İstenen etki" value={istenenEtki} onChange={(e) => setIstenenEtki(e.target.value)}>
                <MenuItem value="">—</MenuItem>
                {Object.entries(ISTENEN_ETKI_AD).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{v}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="Kontrol makamı (C2)" value={kontrolMakami} onChange={(e) => setKontrolMakami(e.target.value)} fullWidth />
              <TextField size="small" label="Frekans" value={frekans} onChange={(e) => setFrekans(e.target.value)} sx={{ minWidth: 130 }} />
            </Stack>
            <TextField size="small" label="Mühimmat / faydalı yük" value={muhimmat} onChange={(e) => setMuhimmat(e.target.value)} fullWidth />
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="Konum enlem" type="number" value={kEnlem} onChange={(e) => setKEnlem(e.target.value)} fullWidth />
              <TextField size="small" label="Konum boylam" type="number" value={kBoylam} onChange={(e) => setKBoylam(e.target.value)} fullWidth />
              <TextField size="small" label="Bölge km" type="number" value={bolgeKm} onChange={(e) => setBolgeKm(e.target.value)} sx={{ minWidth: 92 }} />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="Hedef enlem" type="number" value={hEnlem} onChange={(e) => setHEnlem(e.target.value)} fullWidth />
              <TextField size="small" label="Hedef boylam" type="number" value={hBoylam} onChange={(e) => setHBoylam(e.target.value)} fullWidth />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Konum = görev icra noktası (CAP istasyonu/bölge merkezi; bölge km çember çizer).
              Hedef = sabit hedef koordinatı (DMPI). Haritadaki Plan katmanına anında iner.
            </Typography>
          </Stack>
        )}
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={kaydet} fullWidth>
            Kaydet
          </Button>
          <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={sil}>
            Sil
          </Button>
        </Stack>
      </Stack>

      {gorev.varlikId && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          Varlık:{' '}
          <Box
            component="span"
            onClick={() => onVarlik(gorev.varlikId!)}
            sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 700, '&:hover': { textDecoration: 'underline' } }}
          >
            {gorev.varlikAd ?? gorev.varlikId}
          </Box>{' '}
          — nesne detayı
        </Typography>
      )}
      {h && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          CPM: erken {fmtH(h.esBaslangic)} · geç {fmtH(h.gsBaslangic)} · bolluk {Math.round(h.bolluk)} dk
          {h.kritik ? ' · KRİTİK' : ''}
        </Typography>
      )}

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        ÖNCÜL GÖREVLER
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5, mb: 1 }}>
        {oncekiler.length === 0 && (
          <Typography variant="caption" color="text.disabled">
            Öncül görev yok
          </Typography>
        )}
        {oncekiler.map((d) => (
          <Stack key={d.oncekiId} direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2">
              {adOf(d.oncekiId)} <Chip size="small" label={d.tur === 'SS' ? 'Birlikte başlar' : 'Bitince başlar'} sx={{ height: 16, fontSize: 10 }} />
            </Typography>
            <IconButton size="small" onClick={() => depSil(d.oncekiId)} title="Kaldır">
              <LinkOffIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" spacing={1}>
        <FormControl size="small" fullWidth>
          <InputLabel>Öncül görev ekle</InputLabel>
          <Select label="Öncül görev ekle" value={yeniOnce} onChange={(e) => setYeniOnce(e.target.value)}>
            {digerGorevler.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.ad}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button onClick={depEkle} disabled={!yeniOnce}>
          Bağla
        </Button>
      </Stack>

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        ONTOLOGY ACTION (icra emri sahaya iletilir)
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
        <Button
          size="small"
          variant="contained"
          color="success"
          onClick={() => {
            if (window.confirm(`"${gorev.ad}" onaylanacak ve icra emri ilgili unsura iletilecek. Onaylansın mı?`))
              onDurum(gorev.id, 'onayli');
          }}
        >
          Onayla
        </Button>
        <Button size="small" variant="outlined" onClick={() => onDurum(gorev.id, 'icrada')}>
          İcraya al
        </Button>
        <Button size="small" variant="outlined" onClick={() => onDurum(gorev.id, 'tamam')}>
          Tamam
        </Button>
        <Button size="small" variant="text" color="error" onClick={() => onDurum(gorev.id, 'iptal')}>
          İptal
        </Button>
      </Stack>
      <Chip
        size="small"
        label={`Durum: ${DURUM_ETIKET[gorev.durum]}`}
        color={gorev.durum === 'onayli' ? 'success' : gorev.durum === 'gecikme' ? 'warning' : 'default'}
        sx={{ mt: 1 }}
      />
    </Box>
    </KonsolTema>
  );
}

function GorevEkleDialog({
  acik,
  planId,
  varliklar,
  onVarlik,
  onBaslangic,
  onClose,
  onEklendi,
}: {
  acik: boolean;
  planId: string;
  varliklar: Varlik[];
  onVarlik?: string; // çift-tık ön-dolgusu
  onBaslangic?: number;
  onClose: () => void;
  onEklendi: () => void;
}) {
  const [ad, setAd] = useState('');
  const [tur, setTur] = useState<GorevTur>('gorev');
  const [varlikId, setVarlikId] = useState(onVarlik ?? '');
  const [baslangicDk, setBaslangicDk] = useState(String(onBaslangic ?? 0));
  const [sureDk, setSureDk] = useState('20');
  const ekle = async () => {
    const v = varliklar.find((x) => x.pk === varlikId);
    await gorevEkle(planId, {
      ad: ad.trim() || 'Yeni görev',
      tur,
      varlikId: varlikId || undefined,
      varlikAd: v?.ad,
      domain: v?.domain ?? 'Hava',
      baslangicDk: Math.round(Number(baslangicDk) || 0),
      sureDk: Math.max(0, Math.round(Number(sureDk) || 0)),
    });
    setAd('');
    onEklendi();
  };
  return (
    <KonsolTema>
    <Dialog open={acik} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { bgcolor: KONSOL.kanvas, backgroundImage: 'none' } } }}>
      <DialogTitle>Yeni görev</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <TextField size="small" label="Ad" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus fullWidth />
          <FormControl size="small" fullWidth>
            <InputLabel>Tür</InputLabel>
            <Select label="Tür" value={tur} onChange={(e) => setTur(e.target.value as GorevTur)}>
              {TUR_LISTE.map((t) => (
                <MenuItem key={t} value={t}>
                  {TUR_ADI[t]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Varlık</InputLabel>
            <Select label="Varlık" value={varlikId} onChange={(e) => setVarlikId(e.target.value)}>
              <MenuItem value="">— (varlıksız)</MenuItem>
              {varliklar.map((v) => (
                <MenuItem key={v.pk} value={v.pk}>
                  {v.ad} · {v.domain}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              label="Başlangıç (dk)"
              type="number"
              value={baslangicDk}
              onChange={(e) => setBaslangicDk(e.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Süre (dk)"
              type="number"
              value={sureDk}
              onChange={(e) => setSureDk(e.target.value)}
              fullWidth
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="contained" onClick={ekle}>
          Ekle
        </Button>
      </DialogActions>
    </Dialog>
    </KonsolTema>
  );
}
