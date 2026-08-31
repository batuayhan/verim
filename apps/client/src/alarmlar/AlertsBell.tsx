import DoneAllIcon from '@mui/icons-material/DoneAll';
import NotificationsIcon from '@mui/icons-material/Notifications';
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Popover,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ackAll, ackEvent, fetchEvents } from './api';

/**
 * TopNav alarm zili — 10 sn'de bir olayları yoklar; okunmamış sayısını
 * rozette gösterir. Popover'dan onaylama ve kural sayfasına geçiş.
 */
export function AlertsBell() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['alert-events'],
    queryFn: () => fetchEvents(30),
    refetchInterval: 10_000,
  });
  const unacked = data?.unacked ?? 0;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['alert-events'] });

  return (
    <>
      <Tooltip title={unacked > 0 ? `${unacked} okunmamış alarm` : 'Alarmlar'}>
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
          <Badge badgeContent={unacked} color="error" max={99}>
            <NotificationsIcon
              fontSize="small"
              color={unacked > 0 ? 'error' : 'inherit'}
            />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 380, maxHeight: 440 } } }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.5, py: 1 }}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
            Alarmlar
          </Typography>
          {unacked > 0 && (
            <Tooltip title="Tümünü onayla">
              <IconButton size="small" onClick={() => void ackAll().then(refresh)}>
                <DoneAllIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Button
            size="small"
            onClick={() => {
              setAnchor(null);
              navigate('/alarmlar');
            }}
            sx={{ textTransform: 'none' }}
          >
            Kurallar
          </Button>
        </Stack>
        <Divider />
        {(data?.events.length ?? 0) === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Henüz alarm olayı yok. Kural kurmak için "Kurallar"a git ya da
              asistana söyle: <i>"Düşman iz sayısı 3000'i aşarsa haber ver."</i>
            </Typography>
          </Box>
        ) : (
          <List dense sx={{ overflowY: 'auto' }}>
            {data!.events.map((e) => (
              <ListItem
                key={e.id}
                sx={{ bgcolor: e.acknowledged ? undefined : (t) => alpha(t.palette.error.main, 0.12) }}
                secondaryAction={
                  !e.acknowledged && (
                    <Button
                      size="small"
                      onClick={() => void ackEvent(e.id).then(refresh)}
                      sx={{ textTransform: 'none' }}
                    >
                      Onayla
                    </Button>
                  )
                }
              >
                <ListItemText
                  primary={e.message}
                  secondary={new Date(e.firedAt).toLocaleString('tr-TR')}
                  slotProps={{
                    primary: { sx: { fontSize: 13, fontWeight: e.acknowledged ? 400 : 600 } },
                    secondary: { sx: { fontSize: 11 } },
                  }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Popover>
    </>
  );
}
