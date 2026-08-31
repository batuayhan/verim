import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BarChartIcon from '@mui/icons-material/BarChart';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import HubIcon from '@mui/icons-material/Hub';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import PublicIcon from '@mui/icons-material/Public';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import type { ManifestTool } from './api';

/**
 * "Neler yapabilirim?" — asistanın kayıtlı araçları ve örnek komutları.
 * İçerik frontend'e yazılmaz; /assistant/manifest'ten gelir (kayıt
 * defterinin kendisi). Örneğe tıklamak komutu sohbete gönderir.
 */

const KATEGORI: Record<string, { baslik: string; icon: ReactNode }> = {
  sorgu: { baslik: 'Sorgulama', icon: <BarChartIcon fontSize="small" /> },
  dashboard: { baslik: 'Birleşik Dashboard', icon: <BarChartIcon fontSize="small" /> },
  mercek: { baslik: 'Mercek — Nesne Analizi', icon: <HubIcon fontSize="small" /> },
  harman: { baslik: 'Harman — Pipeline', icon: <FilterAltIcon fontSize="small" /> },
  harita: { baslik: 'Harita', icon: <PublicIcon fontSize="small" /> },
  graf: { baslik: 'Bağlantı Analizi', icon: <AccountTreeIcon fontSize="small" /> },
  alarm: { baslik: 'Alarmlar', icon: <NotificationsActiveIcon fontSize="small" /> },
};
const SIRA = ['sorgu', 'dashboard', 'mercek', 'harman', 'harita', 'graf', 'alarm'];

export function YeteneklerDialog({
  open,
  tools,
  onClose,
  onExample,
}: {
  open: boolean;
  tools: ManifestTool[];
  onClose: () => void;
  onExample: (text: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeIcon color="primary" fontSize="small" />
        Asistan neler yapabilir?
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {tools.length} kayıtlı araç
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Bir örneğe tıkla — komut sohbete gönderilir. Bunlar sadece başlangıç;
          hepsini kendi cümlelerinle, birleştirerek de isteyebilirsin.
        </Typography>
        <Stack spacing={2}>
          {SIRA.map((kat) => {
            const grup = tools.filter((t) => t.category === kat);
            if (grup.length === 0) return null;
            const meta = KATEGORI[kat] ?? { baslik: kat, icon: null };
            return (
              <Box key={kat}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.75 }}>
                  {meta.icon}
                  <Typography variant="subtitle2">{meta.baslik}</Typography>
                </Stack>
                <Stack spacing={1}>
                  {grup.map((t) => (
                    <Paper key={t.name} variant="outlined" sx={{ p: 1.25 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {t.title}
                      </Typography>
                      <Stack
                        direction="row"
                        spacing={0.5}
                        useFlexGap
                        sx={{ flexWrap: 'wrap', mt: 0.75 }}
                      >
                        {t.examples.map((o) => (
                          <Chip
                            key={o}
                            size="small"
                            label={o}
                            onClick={() => onExample(o)}
                            sx={{ cursor: 'pointer', maxWidth: '100%' }}
                          />
                        ))}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
