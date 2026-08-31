import LayersIcon from '@mui/icons-material/Layers';
import LoginIcon from '@mui/icons-material/Login';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { setToken } from '../auth/auth';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError('Kullanıcı adı veya şifre hatalı');
        return;
      }
      const { token } = (await res.json()) as { token: string };
      setToken(token);
      navigate('/', { replace: true });
    } catch {
      setError('Sunucuya ulaşılamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Paper elevation={2} sx={{ p: 4, width: 360 }}>
        <form onSubmit={(e) => void submit(e)}>
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'center' }}>
              <LayersIcon color="primary" sx={{ fontSize: 32 }} />
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Verim
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              Veri analiz platformuna giriş yap
            </Typography>
            <TextField
              label="Kullanıcı adı"
              size="small"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
            <TextField
              label="Şifre"
              type="password"
              size="small"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button
              type="submit"
              variant="contained"
              startIcon={<LoginIcon />}
              disabled={busy || !username || !password}
            >
              {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
