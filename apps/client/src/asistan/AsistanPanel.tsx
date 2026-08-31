import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BuildIcon from '@mui/icons-material/Build';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import HubIcon from '@mui/icons-material/Hub';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import PublicIcon from '@mui/icons-material/Public';
import SendIcon from '@mui/icons-material/Send';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { assistantManifest, type AssistantAction } from './api';
import { useAsistan, type Turn } from './AsistanContext';
import { PanelView } from './PanelView';
import { YeteneklerDialog } from './YeteneklerDialog';

/**
 * Ortak sohbet paneli — hem sağ çekmecede hem /asistan tam sayfasında
 * kullanılır. Cevaplardaki aksiyonlar (Mercek'te aç, Haritada göster)
 * tıklanabilir düğme olarak sunulur.
 */
export function AsistanPanel({ compact = false }: { compact?: boolean }) {
  const { turns, busy, available, send, setOpen } = useAsistan();
  const [input, setInput] = useState('');
  const [yetenekler, setYetenekler] = useState(false);
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Örnekler ve araç listesi kayıt defterinden gelir — elle kopya yok
  const { data: manifest } = useQuery({
    queryKey: ['assistant-manifest'],
    queryFn: assistantManifest,
    staleTime: 5 * 60_000,
  });
  const hizliOrnekler = (manifest?.tools ?? [])
    .map((t) => t.examples[0])
    .filter(Boolean)
    .slice(0, 4);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    setInput('');
    void send(text, location.pathname);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Box ref={scrollRef} sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 2 }}>
        <Box sx={{ maxWidth: compact ? '100%' : 780, mx: 'auto' }}>
          {available === false && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Asistan devre dışı — sunucuda <code>OPENAI_API_KEY</code> tanımlı değil.
            </Alert>
          )}

          {turns.length === 0 && (
            <Stack spacing={2} sx={{ alignItems: 'center', py: compact ? 3 : 6 }}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
                <AutoAwesomeIcon />
              </Avatar>
              <Typography variant="h6">Verim Asistanı</Typography>
              <Typography
                color="text.secondary"
                variant="body2"
                sx={{ maxWidth: 420, textAlign: 'center' }}
              >
                Sorgula, haritada göster, analiz ve dashboard kur — hepsi doğal dille.
              </Typography>
              <Stack spacing={0.75} sx={{ width: '100%', alignItems: 'center' }}>
                {hizliOrnekler.map((o) => (
                  <Chip
                    key={o}
                    label={o}
                    onClick={() => submit(o)}
                    disabled={available === false || busy}
                    sx={{ cursor: 'pointer', maxWidth: '100%' }}
                  />
                ))}
              </Stack>
              <Button
                size="small"
                startIcon={<MenuBookIcon />}
                onClick={() => setYetenekler(true)}
                sx={{ textTransform: 'none' }}
              >
                Tüm yetenekleri gör
              </Button>
            </Stack>
          )}

          <Stack spacing={2}>
            {turns.map((t, i) => (
              <TurnView key={i} turn={t} compact={compact} onAction={() => setOpen(false)} />
            ))}
            {busy && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pl: 5 }}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  düşünüyor ve sorguları çalıştırıyor…
                </Typography>
              </Stack>
            )}
          </Stack>
        </Box>
      </Box>

      <Paper square elevation={3} sx={{ p: 1.5 }}>
        <Box sx={{ maxWidth: compact ? '100%' : 780, mx: 'auto', display: 'flex', gap: 1 }}>
          <Tooltip title="Neler yapabilirim? — tüm yetenekler ve örnek komutlar">
            <IconButton onClick={() => setYetenekler(true)}>
              <MenuBookIcon />
            </IconButton>
          </Tooltip>
          <TextField
            fullWidth
            size="small"
            placeholder="Sor ya da iste… (örn. düşman izleri haritada göster)"
            value={input}
            disabled={available === false}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
          />
          <IconButton
            color="primary"
            disabled={busy || !input.trim() || available === false}
            onClick={() => submit(input)}
          >
            <SendIcon />
          </IconButton>
        </Box>
      </Paper>

      <YeteneklerDialog
        open={yetenekler}
        tools={manifest?.tools ?? []}
        onClose={() => setYetenekler(false)}
        onExample={(o) => {
          setYetenekler(false);
          submit(o);
        }}
      />
    </Box>
  );
}

function TurnView({
  turn,
  compact,
  onAction,
}: {
  turn: Turn;
  compact: boolean;
  onAction: () => void;
}) {
  const navigate = useNavigate();
  const isUser = turn.role === 'user';

  const runAction = (a: AssistantAction) => {
    if (a.type === 'mercek_ac') navigate(`/mercek/${a.analysisId}`);
    if (a.type === 'harman_ac') navigate(`/harman/${a.analysisId}`);
    if (a.type === 'harita_goster') {
      navigate(`/harita?${new URLSearchParams(a.params).toString()}`);
    }
    if (a.type === 'alarmlar_ac') navigate('/alarmlar');
    if (a.type === 'dashboard_ac') navigate(`/?d=${a.dashboardId}`);
    if (a.type === 'graf_ac') navigate(`/graf?tip=${a.objectType}&pk=${encodeURIComponent(a.pk)}`);
    onAction();
  };

  return (
    <Stack direction="row" spacing={1.5} sx={{ flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <Avatar sx={{ width: 30, height: 30, bgcolor: isUser ? 'grey.400' : 'primary.main' }}>
        {isUser ? 'S' : <AutoAwesomeIcon sx={{ fontSize: 17 }} />}
      </Avatar>
      <Box sx={{ maxWidth: compact ? '88%' : '80%' }}>
        <Paper
          variant="outlined"
          sx={{
            px: 1.5,
            py: 1,
            bgcolor: turn.error
              ? (t) => alpha(t.palette.error.main, 0.15)
              : isUser
                ? (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.22 : 0.1)
                : 'background.paper',
            borderColor: turn.error ? 'error.main' : undefined,
          }}
        >
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {turn.content}
          </Typography>
        </Paper>

        {turn.paneller?.map((p, i) => (
          <PanelView key={i} panel={p} onAction={onAction} />
        ))}

        {turn.actions && turn.actions.length > 0 && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.75 }}>
            {turn.actions.map((a, i) => (
              <Button
                key={i}
                size="small"
                variant="contained"
                startIcon={
                  a.type === 'harita_goster' ? (
                    <PublicIcon />
                  ) : a.type === 'alarmlar_ac' ? (
                    <NotificationsActiveIcon />
                  ) : a.type === 'graf_ac' ? (
                    <AccountTreeIcon />
                  ) : (
                    <HubIcon />
                  )
                }
                onClick={() => runAction(a)}
                sx={{ textTransform: 'none' }}
              >
                {a.label}
              </Button>
            ))}
          </Stack>
        )}

        {turn.steps && turn.steps.length > 0 && (
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
            {turn.steps.map((s, i) => (
              <Tooltip
                key={i}
                title={
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', maxWidth: 400 }}>
                    {JSON.stringify((s.input as { def?: unknown })?.def ?? s.input, null, 1)}
                  </pre>
                }
              >
                <Chip
                  size="small"
                  variant="outlined"
                  icon={<BuildIcon sx={{ fontSize: 13 }} />}
                  label={s.summary}
                  sx={{ fontSize: 11 }}
                />
              </Tooltip>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
