import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import {
  Button,
  Chip,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useAppDispatch } from '../store/hooks';
import {
  addMercekParameter,
  removeMercekParameter,
  setMercekParameterValue,
} from '../store/mercekSlice';
import type { MercekParameter } from '../types/mercek';

const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Sol paneldeki "Parametreler" bölümü — $isim değişkenleri.
 * Filtre kartlarında değer yerine $isim seçilebilir; buradan değişince
 * bağlı tüm kartlar yeniden hesaplanır (Harman parametreleriyle aynı model).
 */
export function ParamsPanel({ parameters }: { parameters: MercekParameter[] }) {
  const dispatch = useAppDispatch();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const nameTaken = parameters.some((p) => p.name === name);
  const nameValid = NAME_RE.test(name) && !nameTaken;

  const commitNew = () => {
    if (!nameValid) return;
    dispatch(addMercekParameter({ id: name, name, value: '' }));
    setName('');
    setAdding(false);
  };

  return (
    <Stack spacing={1} sx={{ px: 2, pb: 2 }}>
      <Typography variant="overline" color="text.secondary">
        Parametreler
      </Typography>

      {parameters.length === 0 && !adding && (
        <Typography variant="caption" color="text.secondary">
          Filtrelerde tek yerden değiştirilebilen $değişkenler tanımla.
        </Typography>
      )}

      {parameters.map((p) => (
        <Stack key={p.name} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Tooltip title={`Filtrelerde $${p.name} olarak kullan`}>
            <Chip
              size="small"
              label={`$${p.name}`}
              sx={{ bgcolor: 'warning.light', fontWeight: 600, maxWidth: 90 }}
            />
          </Tooltip>
          <TextField
            size="small"
            placeholder="değer"
            defaultValue={p.value === null ? '' : String(p.value)}
            onBlur={(e) => {
              const raw = e.target.value;
              const num = Number(raw);
              dispatch(
                setMercekParameterValue({
                  name: p.name,
                  value: raw !== '' && !Number.isNaN(num) ? num : raw,
                }),
              );
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            sx={{ flexGrow: 1 }}
          />
          <IconButton
            size="small"
            aria-label={`$${p.name} parametresini sil`}
            onClick={() => dispatch(removeMercekParameter({ name: p.name }))}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}

      {adding ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField
            size="small"
            autoFocus
            placeholder="isim (örn. esik)"
            value={name}
            error={name !== '' && !nameValid}
            helperText={
              name !== '' && !nameValid
                ? nameTaken
                  ? 'Bu isim zaten var'
                  : 'Harfle başlamalı; harf, rakam, _ içerebilir'
                : undefined
            }
            onChange={(e) => setName(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNew();
              if (e.key === 'Escape') {
                setAdding(false);
                setName('');
              }
            }}
            sx={{ flexGrow: 1 }}
          />
          <Button size="small" disabled={!nameValid} onClick={commitNew}>
            Ekle
          </Button>
        </Stack>
      ) : (
        <Button
          size="small"
          startIcon={<AddIcon />}
          sx={{ alignSelf: 'flex-start' }}
          onClick={() => setAdding(true)}
        >
          Parametre ekle
        </Button>
      )}
    </Stack>
  );
}
