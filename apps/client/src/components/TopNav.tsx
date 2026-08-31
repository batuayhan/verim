import DashboardIcon from '@mui/icons-material/Dashboard';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import HubIcon from '@mui/icons-material/Hub';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import SchemaIcon from '@mui/icons-material/Schema';
import LayersIcon from '@mui/icons-material/Layers';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import PublicIcon from '@mui/icons-material/Public';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LogoutIcon from '@mui/icons-material/Logout';
import StorageIcon from '@mui/icons-material/Storage';
import ShieldIcon from '@mui/icons-material/Shield';
import TimelineIcon from '@mui/icons-material/Timeline';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import {
  AppBar,
  Box,
  Button,
  Divider,
  IconButton,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Switch } from '@mui/material';
import { useLiveMode } from '../api/live';
import { useTema } from '../theme/ThemeContext';
import { useAsistan } from '../asistan/AsistanContext';
import { AlertsBell } from '../alarmlar/AlertsBell';
import { GlobalSearch } from '../search/GlobalSearch';
import { clearToken } from '../auth/auth';

/**
 * Platform üst navigasyonu. Hiyerarşi: platform ("Verim") → eş seviyeli
 * uygulamalar (Harman = Harman klonu, Mercek = Mercek klonu) +
 * paylaşılan veri katmanı (Datasetler). Kod içi adlar İngilizce kalır.
 */
export function TopNav({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const navButton = (
    to: string,
    label: string,
    icon: ReactNode,
    activePaths: string[],
  ) => {
    const active = activePaths.some((p) =>
      p === '/' ? location.pathname === '/' : location.pathname.startsWith(p),
    );
    return (
      <Button
        component={Link}
        to={to}
        size="small"
        startIcon={icon}
        color={active ? 'primary' : 'inherit'}
        sx={{ textTransform: 'none', fontWeight: active ? 600 : 400 }}
      >
        {label}
      </Button>
    );
  };

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{ borderBottom: 1, borderColor: 'divider' }}
    >
      <Toolbar variant="dense" sx={{ gap: 0.5 }}>
        <Typography
          component={Link}
          to="/"
          variant="subtitle1"
          sx={{ fontWeight: 700, 
            textDecoration: 'none',
            color: 'text.primary',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            mr: 1,
          }}
        >
          <LayersIcon fontSize="small" color="primary" />
          Verim
        </Typography>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1 }} />
        {navButton('/', 'Ana Sayfa', <DashboardIcon fontSize="small" />, ['/'])}
        {navButton('/harman', 'Harman', <FilterAltIcon fontSize="small" />, [
          '/harman',
        ])}
        {navButton('/mercek', 'Mercek', <HubIcon fontSize="small" />, ['/mercek'])}
        {navButton('/harita', 'Harita', <PublicIcon fontSize="small" />, ['/harita'])}
        {navButton('/graf', 'Bağlantı', <AccountTreeIcon fontSize="small" />, ['/graf'])}
        {navButton('/karar', 'Karar Destek', <ShieldIcon fontSize="small" />, ['/karar'])}
        {navButton('/senkron', 'Sync Matrix', <TimelineIcon fontSize="small" />, ['/senkron'])}
        {navButton('/alarmlar', 'Alarmlar', <NotificationsActiveIcon fontSize="small" />, [
          '/alarmlar',
        ])}
        <AsistanButton />
        {navButton('/datasets', 'Datasetler', <StorageIcon fontSize="small" />, [
          '/datasets',
        ])}
        {navButton('/ontoloji', 'Ontoloji', <SchemaIcon fontSize="small" />, [
          '/ontoloji',
        ])}
        <Box sx={{ flexGrow: 1 }} />
        <GlobalSearch />
        {children}
        <AlertsBell />
        <LiveToggle />
        <TemaToggle />
        <Tooltip title="Çıkış yap">
          <IconButton
            size="small"
            onClick={() => {
              clearToken();
              navigate('/login', { replace: true });
            }}
          >
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}

/** Asistan düğmesi: /asistan sayfasında link gibi, diğer sayfalarda çekmeceyi açar. */
function AsistanButton() {
  const location = useLocation();
  const { setOpen } = useAsistan();
  const active = location.pathname.startsWith('/asistan');
  return (
    <Button
      size="small"
      startIcon={<AutoAwesomeIcon fontSize="small" />}
      color={active ? 'primary' : 'inherit'}
      onClick={() => setOpen(true)}
      sx={{ textTransform: 'none', fontWeight: active ? 600 : 400 }}
    >
      Asistan
    </Button>
  );
}

/**
 * Tema anahtarı — aydınlık/karanlık. Komuta konsolu sayfaları (Sync Matrix,
 * Harita, Karar Destek) her temada koyu kalır; anahtar içerik sayfalarını etkiler.
 */
function TemaToggle() {
  const { mod, toggle } = useTema();
  return (
    <Tooltip title={mod === 'dark' ? 'Aydınlık temaya geç' : 'Karanlık temaya geç'}>
      <IconButton size="small" onClick={toggle} sx={{ mr: 0.25 }}>
        {mod === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}

/**
 * Canlı mod anahtarı — açıkken tüm veri sorguları 3 sn'de bir tazelenir
 * (gerçek zamanlı kaynak/simülatör aktıkça ekran kendini günceller).
 */
function LiveToggle() {
  const { live, setLive } = useLiveMode();
  return (
    <Tooltip title={live ? 'Canlı mod açık — 3 sn\'de bir tazelenir' : 'Canlı modu aç'}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', mr: 0.5, cursor: 'pointer' }}
        onClick={() => setLive(!live)}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            mr: 0.5,
            bgcolor: live ? 'success.main' : 'text.disabled',
            ...(live && {
              animation: 'verimPulse 1.2s ease-in-out infinite',
              '@keyframes verimPulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.25 },
              },
            }),
          }}
        />
        <Typography variant="caption" sx={{ mr: -0.5, color: live ? 'success.main' : 'text.secondary', fontWeight: live ? 700 : 400 }}>
          Canlı
        </Typography>
        <Switch size="small" checked={live} color="success" />
      </Box>
    </Tooltip>
  );
}
