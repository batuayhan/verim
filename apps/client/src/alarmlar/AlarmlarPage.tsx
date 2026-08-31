import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nanoid } from '@reduxjs/toolkit';
import { useEffect, useState } from 'react';
import { TopNav } from '../components/TopNav';
import type { ObjectSetDef } from '../types/mercek';
import {
  deleteRule,
  fetchChannels,
  fetchEvents,
  fetchRules,
  saveRule,
  type AlertRule,
} from './api';

const SINIFLAR = ['Dost', 'Düşman', 'Şüpheli', 'Bilinmeyen'];
const DOMAINLER = ['Hava', 'Deniz', 'Kara'];
const OP_LABEL: Record<AlertRule['operator'], string> = {
  gt: 'üstüne çıkarsa',
  gte: 'eşit/üstüne çıkarsa',
  lt: 'altına inerse',
  lte: 'eşit/altına inerse',
};

/**
 * Alarm kuralları — acemi-dostu kurulum: her şey select'lerle, eşik tek
 * sayı. Kural cümle gibi okunur: "[küme] sayısı [eşik]in [üstüne çıkarsa]
 * (son N dk penceresinde) alarm üret."
 */
export function AlarmlarPage() {
  const queryClient = useQueryClient();
  const rules = useQuery({ queryKey: ['alert-rules'], queryFn: fetchRules });
  const events = useQuery({
    queryKey: ['alert-events-page'],
    queryFn: () => fetchEvents(50),
    refetchInterval: 10_000,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] });

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <TopNav />
      <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
          <NotificationsActiveIcon color="primary" />
          <Typography variant="h5" sx={{ fontWeight: 600, flexGrow: 1 }}>
            Alarm Kuralları
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
          >
            Kural ekle
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Kurallar 15 saniyede bir değerlendirilir; koşul sağlanınca zilde
          alarm belirir. Asistana da kurdurabilirsin:
          <i> "Son 5 dakikadaki düşman iz sayısı 100'ü aşarsa haber ver."</i>
        </Typography>

        <Paper variant="outlined" sx={{ mb: 3, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Aktif</TableCell>
                <TableCell>Kural</TableCell>
                <TableCell>Koşul</TableCell>
                <TableCell>Pencere</TableCell>
                <TableCell>Bekleme</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {(rules.data?.rules ?? []).map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Switch
                      size="small"
                      checked={r.enabled}
                      onChange={(e) =>
                        void saveRule({ ...r, enabled: e.target.checked }).then(refresh)
                      }
                    />
                  </TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>
                    sayı {r.threshold} {OP_LABEL[r.operator]}
                  </TableCell>
                  <TableCell>{r.windowMin ? `son ${r.windowMin} dk` : '—'}</TableCell>
                  <TableCell>{r.cooldownSec} sn</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Kuralı sil">
                      <IconButton
                        size="small"
                        onClick={() => void deleteRule(r.id).then(refresh)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {(rules.data?.rules.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                      Henüz kural yok — "Kural ekle" ile başla.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>

        <Typography variant="h6" sx={{ mb: 1 }}>
          Son Olaylar
        </Typography>
        {(events.data?.events.length ?? 0) === 0 ? (
          <Alert severity="info">Henüz alarm olayı yok.</Alert>
        ) : (
          <Paper variant="outlined">
            <Table size="small">
              <TableBody>
                {events.data!.events.map((e) => (
                  <TableRow key={e.id} sx={{ bgcolor: e.acknowledged ? undefined : (t) => alpha(t.palette.error.main, 0.12) }}>
                    <TableCell sx={{ whiteSpace: 'nowrap', width: 170 }}>
                      {new Date(e.firedAt).toLocaleString('tr-TR')}
                    </TableCell>
                    <TableCell>{e.message}</TableCell>
                    <TableCell align="right">
                      {!e.acknowledged && <Chip size="small" color="error" label="yeni" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>

      <RuleDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          refresh();
        }}
      />
    </Box>
  );
}

/** Cümle-stili kural kurucu — hedef küme select'lerle inşa edilir. */
function RuleDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [siniflar, setSiniflar] = useState<string[]>(['Düşman']);
  const [domainler, setDomainler] = useState<string[]>([]);
  const [windowMin, setWindowMin] = useState<number>(5);
  const [operator, setOperator] = useState<AlertRule['operator']>('gt');
  const [threshold, setThreshold] = useState<number>(100);
  const [cooldown, setCooldown] = useState<number>(300);
  const [webhook, setWebhook] = useState('');
  const [email, setEmail] = useState('');
  const [emailKanali, setEmailKanali] = useState(false); // SMTP yapılandırılmış mı
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) fetchChannels().then((c) => setEmailKanali(c.email)).catch(() => setEmailKanali(false));
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const conditions = [];
      if (siniflar.length > 0 && siniflar.length < SINIFLAR.length) {
        conditions.push({
          id: 'sinif',
          column: 'siniflandirma',
          operator: 'in' as const,
          values: siniflar.map((v) => ({ kind: 'literal' as const, value: v })),
        });
      }
      if (domainler.length > 0 && domainler.length < DOMAINLER.length) {
        conditions.push({
          id: 'domain',
          column: 'domain',
          operator: 'in' as const,
          values: domainler.map((v) => ({ kind: 'literal' as const, value: v })),
        });
      }
      const def: ObjectSetDef =
        conditions.length > 0
          ? { type: 'filter', base: { type: 'base', objectType: 'iz' }, combinator: 'and', conditions }
          : { type: 'base', objectType: 'iz' };
      await saveRule({
        id: `kural-${nanoid(8)}`,
        name:
          name.trim() ||
          `${siniflar.length ? siniflar.join('+') : 'Tüm'} iz sayısı ${threshold} eşiği`,
        enabled: true,
        def,
        windowMin: windowMin > 0 ? windowMin : undefined,
        operator,
        threshold,
        cooldownSec: cooldown,
        ...(webhook.trim() || email.trim()
          ? {
              channels: {
                ...(webhook.trim() ? { webhook: webhook.trim() } : {}),
                ...(email.trim() ? { email: email.trim() } : {}),
              },
            }
          : {}),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Alarm kuralı ekle</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            size="small"
            label="Kural adı (boşsa otomatik)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2">Sınıflandırması</Typography>
            <Select
              multiple
              size="small"
              value={siniflar}
              onChange={(e) => setSiniflar(e.target.value as string[])}
              displayEmpty
              renderValue={(v) => (v.length ? v.join(', ') : 'hepsi')}
              sx={{ minWidth: 160 }}
            >
              {SINIFLAR.map((s) => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </Select>
            <Typography variant="body2">ve domaini</Typography>
            <Select
              multiple
              size="small"
              value={domainler}
              onChange={(e) => setDomainler(e.target.value as string[])}
              displayEmpty
              renderValue={(v) => (v.length ? v.join(', ') : 'hepsi')}
              sx={{ minWidth: 140 }}
            >
              {DOMAINLER.map((d) => (
                <MenuItem key={d} value={d}>{d}</MenuItem>
              ))}
            </Select>
            <Typography variant="body2">olan izlerin sayısı</Typography>
          </Stack>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              sx={{ width: 110 }}
            />
            <Select
              size="small"
              value={operator}
              onChange={(e) => setOperator(e.target.value as AlertRule['operator'])}
            >
              {Object.entries(OP_LABEL).map(([op, label]) => (
                <MenuItem key={op} value={op}>{label}</MenuItem>
              ))}
            </Select>
            <Typography variant="body2">— pencere:</Typography>
            <Select
              size="small"
              value={windowMin}
              onChange={(e) => setWindowMin(Number(e.target.value))}
            >
              <MenuItem value={0}>tüm veri</MenuItem>
              <MenuItem value={5}>son 5 dk</MenuItem>
              <MenuItem value={15}>son 15 dk</MenuItem>
              <MenuItem value={60}>son 1 saat</MenuItem>
            </Select>
            <Typography variant="body2">bekleme:</Typography>
            <Select
              size="small"
              value={cooldown}
              onChange={(e) => setCooldown(Number(e.target.value))}
            >
              <MenuItem value={60}>1 dk</MenuItem>
              <MenuItem value={300}>5 dk</MenuItem>
              <MenuItem value={1800}>30 dk</MenuItem>
            </Select>
          </Stack>

          {/* Bildirim kanalları (zil her zaman çalışır; bunlar ek) */}
          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">
              Bildirim kanalları (isteğe bağlı)
            </Typography>
          </Divider>
          <TextField
            size="small"
            label="Webhook URL (Slack/Teams/Mattermost)"
            placeholder="https://hooks.slack.com/services/…"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
          />
          <TextField
            size="small"
            type="email"
            label={emailKanali ? 'E-posta adresi' : 'E-posta (SMTP yapılandırılmamış — devre dışı)'}
            placeholder="operasyon@birlik.tsk.tr"
            value={email}
            disabled={!emailKanali}
            onChange={(e) => setEmail(e.target.value)}
            helperText={emailKanali ? undefined : 'SMTP_URL ortam değişkeni verilince açılır'}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="contained" disabled={saving} onClick={() => void save()}>
          Kaydet
        </Button>
      </DialogActions>
    </Dialog>
  );
}
