import CloseIcon from '@mui/icons-material/Close';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import {
  Box,
  Drawer,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router';
import { useAsistan } from './AsistanContext';
import { AsistanPanel } from './AsistanPanel';

const WIDTH = 420;

/**
 * Her sayfadan erişilen asistan çekmecesi — konuşma gezinme boyunca
 * yaşar (AsistanProvider'da tutulur). /asistan tam sayfasındayken
 * çekmece gereksizdir, kendini göstermez.
 */
export function AsistanDrawer() {
  const { open, setOpen, clear, turns } = useAsistan();
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname.startsWith('/asistan')) return null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={() => setOpen(false)}
      slotProps={{ paper: { sx: { width: WIDTH, maxWidth: '100vw' } } }}
      keepMounted
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          ✦ Verim Asistanı
        </Typography>
        {turns.length > 0 && (
          <Tooltip title="Sohbeti temizle">
            <IconButton size="small" onClick={clear}>
              <DeleteSweepIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Tam ekran">
          <IconButton
            size="small"
            onClick={() => {
              setOpen(false);
              navigate('/asistan');
            }}
          >
            <OpenInFullIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton size="small" onClick={() => setOpen(false)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <AsistanPanel compact />
      </Box>
    </Drawer>
  );
}
