import AddIcon from '@mui/icons-material/Add';
import DashboardIcon from '@mui/icons-material/Dashboard';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  fetchDashboard,
  newDashboardId,
  saveDashboard,
  useDashboards,
  useInvalidateDashboards,
  type DashboardDoc,
  type Gadget,
  type GadgetConfig,
} from './api';

/**
 * "Panoya ekle" — Harman board'u / Mercek kartı / herhangi bir gadget'ı
 * SİSTEMDEKİ birleşik dashboard'lardan birine ekler. Platformda tek
 * dashboard sistemi olduğundan (Harman'ın/Mercek'in kendi panosu YOK),
 * hedef her zaman bir kullanıcı panosudur: mevcut birini seç ya da yeni
 * oluştur. Sistem panosu sanaldır (yazılamaz), bu yüzden hedef listesinde
 * görünmez.
 */

/** Gadget tipine göre makul varsayılan boyut (PanoPage ile aynı) */
function gadgetSize(tip: Gadget['tip']): { w: number; h: number } {
  if (tip === 'stat') return { w: 3, h: 4 };
  if (tip === 'asistan') return { w: 12, h: 4 };
  return { w: 6, h: 9 };
}

async function gadgetEkle(
  doc: DashboardDoc,
  gadget: GadgetConfig,
): Promise<DashboardDoc> {
  const maxY = doc.gadgets.reduce((m, g) => Math.max(m, g.yerlesim.y + g.yerlesim.h), 0);
  const yeni = {
    ...gadget,
    id: `g-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    yerlesim: { x: 0, y: maxY, ...gadgetSize(gadget.tip) },
  } as Gadget;
  return { ...doc, gadgets: [...doc.gadgets, yeni] };
}

export function PanoyaEkleDialog({
  open,
  onClose,
  gadget,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** Eklenecek gadget (id/yerleşim hariç) — çağıran hazırlar */
  gadget: GadgetConfig | null;
  /** Başarı bildirimi (snackbar metni) çağırana döner */
  onDone?: (msg: string) => void;
}) {
  const navigate = useNavigate();
  const { data: list } = useDashboards();
  const invalidate = useInvalidateDashboards();
  const [yeniAd, setYeniAd] = useState('');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kullaniciPanolari = (list?.dashboards ?? []).filter((d) => !d.sistem);

  const kapat = () => {
    setYeniAd('');
    setHata(null);
    onClose();
  };

  const mevcudaEkle = async (dashboardId: string, ad: string) => {
    if (!gadget || busy) return;
    setBusy(true);
    setHata(null);
    try {
      const doc = await fetchDashboard(dashboardId);
      await saveDashboard(await gadgetEkle(doc, gadget));
      invalidate();
      onDone?.(`"${ad}" panosuna eklendi`);
      kapat();
      navigate(`/?d=${dashboardId}`);
    } catch (e) {
      setHata(String(e));
    } finally {
      setBusy(false);
    }
  };

  const yeniyeEkle = async () => {
    if (!gadget || !yeniAd.trim() || busy) return;
    setBusy(true);
    setHata(null);
    try {
      const id = newDashboardId();
      const doc = await gadgetEkle({ id, name: yeniAd.trim(), gadgets: [] }, gadget);
      await saveDashboard(doc);
      invalidate();
      onDone?.(`"${yeniAd.trim()}" panosu oluşturuldu`);
      kapat();
      navigate(`/?d=${id}`);
    } catch (e) {
      setHata(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={kapat} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <DashboardIcon color="primary" fontSize="small" />
        Panoya ekle
      </DialogTitle>
      <DialogContent dividers>
        {hata && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {hata}
          </Alert>
        )}

        <Typography variant="caption" color="text.secondary">
          Mevcut bir panoya ekle:
        </Typography>
        {kullaniciPanolari.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            Henüz kendi panon yok — aşağıdan yeni bir tane oluştur.
          </Typography>
        ) : (
          <List dense>
            {kullaniciPanolari.map((d) => (
              <ListItemButton
                key={d.id}
                disabled={busy}
                onClick={() => void mevcudaEkle(d.id, d.name)}
              >
                <ListItemText primary={d.name} secondary={`${d.gadgetCount} gadget`} />
              </ListItemButton>
            ))}
          </List>
        )}

        <Divider sx={{ my: 1.5 }}>veya</Divider>

        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            fullWidth
            label="Yeni pano adı"
            value={yeniAd}
            disabled={busy}
            onChange={(e) => setYeniAd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void yeniyeEkle();
              }
            }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            disabled={!yeniAd.trim() || busy}
            onClick={() => void yeniyeEkle()}
            sx={{ whiteSpace: 'nowrap' }}
          >
            Oluştur
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={kapat} disabled={busy}>
          Vazgeç
        </Button>
      </DialogActions>
    </Dialog>
  );
}
