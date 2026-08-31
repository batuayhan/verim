import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import HubIcon from '@mui/icons-material/Hub';
import LockIcon from '@mui/icons-material/Lock';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { GridLayout, useContainerWidth, type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { useNavigate, useSearchParams } from 'react-router';
import { TopNav } from '../components/TopNav';
import {
  deleteDashboard,
  newDashboardId,
  saveDashboard,
  useDashboard,
  useDashboards,
  useInvalidateDashboards,
  type DashboardDoc,
  type Gadget,
} from './api';
import { CaprazFiltreProvider, useCaprazFiltre } from './caprazFiltre';
import { GadgetBody, gadgetTitle, gadgetToMercek } from './gadgets';
import { GadgetEkleDialog } from './GadgetEkleDialog';

/**
 * BİRLEŞİK DASHBOARD (Jira modeli) — platformda tek dashboard sistemi:
 * her öğe bir gadget, her gadget her uygulamadan gelebilir (sorgu, harita,
 * alarm, Harman board'u, Mercek kartı...). 'Sistem' dashboard'u sanaldır
 * ve kilitlidir; kullanıcı kopyalayıp kendininkini düzenler, sıfırdan da
 * kurabilir. Sürükle-bırak düzen yalnız düzenleme modunda aktiftir.
 */

const SON_PANO_KEY = 'verim-pano-son';

export function PanoPage() {
  // ForceLive KALDIRILDI: ana sayfa global canlı-mod anahtarına saygı duyar
  // (üst bardaki switch artık kapatabiliyor). Gadget'lar refetchInterval'i
  // global moddan okur; kapalıyken tazelenmez.
  return (
    <CaprazFiltreProvider>
      <PanoContent />
    </CaprazFiltreProvider>
  );
}

/** Aktif çapraz filtre şeridi — hangi seçim uygulanıyor + temizle */
function CaprazSerit() {
  const { filtre, temizle } = useCaprazFiltre();
  if (!filtre) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
      <FilterAltIcon fontSize="small" color="primary" />
      <Typography variant="caption" color="text.secondary">
        Çapraz filtre:
      </Typography>
      <Chip
        size="small"
        color="primary"
        label={`${filtre.kolon} = ${filtre.deger}`}
        onDelete={temizle}
      />
      <Typography variant="caption" color="text.secondary">
        (uygun tüm gadget'lar süzülüyor)
      </Typography>
    </Stack>
  );
}

function PanoContent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: list } = useDashboards();
  const invalidate = useInvalidateDashboards();

  const aktifId =
    searchParams.get('d') ?? localStorage.getItem(SON_PANO_KEY) ?? 'sistem';
  useEffect(() => {
    localStorage.setItem(SON_PANO_KEY, aktifId);
  }, [aktifId]);

  const { data: sunucuDoc, error } = useDashboard(aktifId);

  // Düzenleme yerel kopyada yapılır; Kaydet sunucuya yazar
  const [duzenleme, setDuzenleme] = useState(false);
  const [doc, setDoc] = useState<DashboardDoc | null>(null);
  const [gadgetEkle, setGadgetEkle] = useState(false);
  const [adDialog, setAdDialog] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => {
    if (!duzenleme && sunucuDoc) setDoc(sunucuDoc);
  }, [sunucuDoc, duzenleme]);

  useEffect(() => {
    // Dashboard değişince düzenleme modundan çık
    setDuzenleme(false);
  }, [aktifId]);

  // Bayat işaretçi: son seçilen pano artık yoksa (silinmiş/veri sıfırlanmış)
  // hata gösterip boş kalmak yerine SESSİZCE Sistem'e dön — Sistem sanaldır,
  // koddan üretilir, hiçbir zaman kaybolmaz
  useEffect(() => {
    if (error && aktifId !== 'sistem') {
      localStorage.removeItem(SON_PANO_KEY);
      setSearchParams({});
      setSnack('Seçili dashboard artık yok — Sistem dashboard\'una dönüldü');
    }
  }, [error, aktifId, setSearchParams]);

  const sistem = aktifId === 'sistem';

  // localStorage ÖNCE yazılır: Sistem seçimi URL paramını kaldırır ve
  // aktifId localStorage'a düşer — eski değer kalırsa seçim geri teper
  // ("Sistem seçilince hiçbir şey olmuyor" hatası)
  const sec = (id: string) => {
    localStorage.setItem(SON_PANO_KEY, id);
    setSearchParams(id === 'sistem' ? {} : { d: id });
  };

  const yeniPano = async (kopya?: DashboardDoc) => {
    const id = newDashboardId();
    const doc: DashboardDoc = kopya
      ? { id, name: `${kopya.name} (kopya)`, gadgets: kopya.gadgets }
      : { id, name: 'Yeni dashboard', gadgets: [] };
    await saveDashboard(doc);
    invalidate();
    sec(id);
    setDuzenleme(true);
    setSnack(kopya ? 'Kopya oluşturuldu — artık düzenleyebilirsin' : 'Yeni dashboard oluşturuldu');
  };

  const kaydet = async () => {
    if (!doc) return;
    await saveDashboard(doc);
    invalidate();
    setDuzenleme(false);
    setSnack('Kaydedildi');
  };

  const sil = async () => {
    if (!doc || sistem) return;
    await deleteDashboard(doc.id);
    invalidate();
    sec('sistem');
    setSnack('Dashboard silindi');
  };

  const gadgetEkleHandler = (g: Omit<Gadget, 'yerlesim'>) => {
    if (!doc) return;
    const maxY = doc.gadgets.reduce((m, x) => Math.max(m, x.yerlesim.y + x.yerlesim.h), 0);
    const boyut =
      g.tip === 'stat'
        ? { w: 3, h: 4 }
        : g.tip === 'asistan'
          ? { w: 12, h: 4 }
          : { w: 6, h: 9 };
    setDoc({
      ...doc,
      gadgets: [...doc.gadgets, { ...g, yerlesim: { x: 0, y: maxY, ...boyut } } as Gadget],
    });
  };

  const gadgetKaldir = (id: string) => {
    if (!doc) return;
    setDoc({ ...doc, gadgets: doc.gadgets.filter((g) => g.id !== id) });
  };

  const layout = useMemo<LayoutItem[]>(
    () =>
      (doc?.gadgets ?? []).map((g) => ({
        i: g.id,
        ...g.yerlesim,
        static: !duzenleme,
      })),
    [doc, duzenleme],
  );

  const layoutDegisti = (next: Layout) => {
    if (!doc || !duzenleme) return;
    const map = new Map(next.map((l) => [l.i, l]));
    setDoc({
      ...doc,
      gadgets: doc.gadgets.map((g) => {
        const l = map.get(g.id);
        return l ? { ...g, yerlesim: { x: l.x, y: l.y, w: l.w, h: l.h } } : g;
      }),
    });
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <TopNav />
      <Box sx={{ maxWidth: 1400, mx: 'auto', px: 2, py: 2 }}>
        {/* Pano başlığı ve yönetim çubuğu */}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <Select value={aktifId} onChange={(e) => sec(e.target.value)}>
              {(list?.dashboards ?? []).map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.sistem ? '🔒 ' : ''}
                  {d.name} · {d.gadgetCount} gadget
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {sistem && (
            <Chip
              size="small"
              icon={<LockIcon sx={{ fontSize: 14 }} />}
              label="Sistem dashboard'u — salt okunur"
              variant="outlined"
            />
          )}

          <Box sx={{ flexGrow: 1 }} />

          {!sistem && !duzenleme && doc && (
            <Button
              size="small"
              startIcon={<EditIcon />}
              onClick={() => setDuzenleme(true)}
              sx={{ textTransform: 'none' }}
            >
              Düzenle
            </Button>
          )}
          {duzenleme && (
            <>
              <Button
                size="small"
                startIcon={<AddIcon />}
                variant="outlined"
                onClick={() => setGadgetEkle(true)}
                sx={{ textTransform: 'none' }}
              >
                Gadget ekle
              </Button>
              <Button
                size="small"
                startIcon={<EditIcon />}
                onClick={() => setAdDialog(doc?.name ?? '')}
                sx={{ textTransform: 'none' }}
              >
                Yeniden adlandır
              </Button>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => void sil()}
                sx={{ textTransform: 'none' }}
              >
                Sil
              </Button>
              <Button
                size="small"
                startIcon={<CloseIcon />}
                onClick={() => {
                  setDuzenleme(false);
                  if (sunucuDoc) setDoc(sunucuDoc);
                }}
                sx={{ textTransform: 'none' }}
              >
                İptal
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<CheckIcon />}
                onClick={() => void kaydet()}
                sx={{ textTransform: 'none' }}
              >
                Kaydet
              </Button>
            </>
          )}
          {!duzenleme && (
            <>
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={() => doc && void yeniPano(doc)}
                sx={{ textTransform: 'none' }}
              >
                Kopyala{sistem ? ' ve düzenle' : ''}
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => void yeniPano()}
                sx={{ textTransform: 'none' }}
              >
                Yeni dashboard
              </Button>
            </>
          )}
        </Stack>

        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Dashboard bulunamadı —{' '}
            <Button size="small" onClick={() => sec('sistem')}>
              Sistem dashboard'una dön
            </Button>
          </Alert>
        )}

        {doc && doc.gadgets.length === 0 && (
          <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Bu dashboard boş. Gadget ekleyerek başla — sayı kartları, grafikler,
              canlı harita, alarmlar, Harman board'ları, Mercek kartları…
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setDuzenleme(true);
                setGadgetEkle(true);
              }}
            >
              Gadget ekle
            </Button>
          </Paper>
        )}

        {!duzenleme && <CaprazSerit />}

        {doc && doc.gadgets.length > 0 && (
          <PanoGrid layout={layout} onLayoutChange={layoutDegisti}>
            {doc.gadgets.map((g) => (
              <div key={g.id}>
                <Paper
                  variant="outlined"
                  sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                >
                  <Stack
                    direction="row"
                    spacing={0.5}
                    sx={{
                      px: 1,
                      py: 0.4,
                      alignItems: 'center',
                      borderBottom: 1,
                      borderColor: 'divider',
                      bgcolor: 'action.hover',
                    }}
                  >
                    {duzenleme && (
                      <DragIndicatorIcon
                        className="pano-drag"
                        sx={{ fontSize: 16, color: 'text.disabled', cursor: 'grab' }}
                      />
                    )}
                    <Typography variant="caption" sx={{ fontWeight: 600, flexGrow: 1 }} noWrap>
                      {gadgetTitle(g)}
                    </Typography>
                    {!duzenleme && 'def' in g && g.tip !== 'stat' && (
                      <Tooltip title="Mercek'te aç — düzenlenebilir analiz olarak">
                        <IconButton
                          size="small"
                          onClick={() =>
                            void gadgetToMercek(g).then((url) => url && navigate(url))
                          }
                        >
                          <HubIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {duzenleme && (
                      <Tooltip title="Gadget'ı kaldır">
                        <IconButton size="small" onClick={() => gadgetKaldir(g.id)}>
                          <CloseIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                  <Box sx={{ flexGrow: 1, minHeight: 0, p: g.tip === 'harita' ? 0 : 1 }}>
                    <GadgetBody gadget={g} />
                  </Box>
                </Paper>
              </div>
            ))}
          </PanoGrid>
        )}
      </Box>

      <GadgetEkleDialog
        open={gadgetEkle}
        onClose={() => setGadgetEkle(false)}
        onAdd={gadgetEkleHandler}
      />

      <Dialog open={adDialog !== null} onClose={() => setAdDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Dashboard adı</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={adDialog ?? ''}
            onChange={(e) => setAdDialog(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdDialog(null)}>Vazgeç</Button>
          <Button
            variant="contained"
            disabled={!adDialog?.trim()}
            onClick={() => {
              if (doc && adDialog?.trim()) setDoc({ ...doc, name: adDialog.trim() });
              setAdDialog(null);
            }}
          >
            Uygula
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        message={snack}
      />
    </Box>
  );
}

function PanoGrid({
  layout,
  onLayoutChange,
  children,
}: {
  layout: LayoutItem[];
  onLayoutChange: (next: Layout) => void;
  children: React.ReactNode;
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  return (
    <div ref={containerRef}>
      {mounted && (
        <GridLayout
          layout={layout}
          width={width}
          gridConfig={{ cols: 12, rowHeight: 36, margin: [12, 12] }}
          dragConfig={{ handle: '.pano-drag' }}
          resizeConfig={{ handles: ['se', 'e', 's'] }}
          onLayoutChange={onLayoutChange}
        >
          {children}
        </GridLayout>
      )}
    </div>
  );
}
