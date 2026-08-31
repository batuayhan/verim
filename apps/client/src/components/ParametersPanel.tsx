import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import TagIcon from '@mui/icons-material/Tag';
import { parametreTokenSx } from '../theme/tokens';
import {
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
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { nanoid } from '@reduxjs/toolkit';
import { useState } from 'react';
import {
  addParameter,
  removeParameter,
  setParameterValue,
} from '../store/analysisSlice';
import { selectAnalysis, useAppDispatch, useAppSelector } from '../store/hooks';
import type { ColumnType } from '../types/schema';

/**
 * Harman'daki sol Parameters paneli: $ chip'leri, değer girişleri,
 * pending-changes Apply/Cancel modeli.
 */
export function ParametersPanel() {
  const dispatch = useAppDispatch();
  const analysis = useAppSelector(selectAnalysis);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);

  if (!analysis) return null;
  const dirty = Object.keys(pending).length > 0;

  const apply = () => {
    for (const [name, raw] of Object.entries(pending)) {
      const param = analysis.parameters.find((p) => p.name === name);
      if (!param) continue;
      const value =
        param.type === 'integer' || param.type === 'double'
          ? Number(raw)
          : param.type === 'boolean'
            ? raw === 'true'
            : raw;
      dispatch(setParameterValue({ name, value }));
    }
    setPending({});
  };

  return (
    <Stack spacing={2} sx={{ p: 2, height: '100%' }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        Parameters
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Parametre, analizde birden çok yerde kullandığın <b>tek bir ayar
        değeridir</b>. Örnek: <code>$bolge</code> diye bir parametre oluştur,
        üç ayrı filtrede değer olarak seç — buradan değeri değiştirince üç
        filtre de aynı anda güncellenir. Filtre değer kutularında{' '}
        <code>$</code>'lı seçenekler olarak listelenir.
      </Typography>
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() => setCreateOpen(true)}
      >
        Create parameter
      </Button>
      <Divider />

      <Stack spacing={2} sx={{ flexGrow: 1, overflowY: 'auto' }}>
        {analysis.parameters.map((p) => (
          <Box key={p.id}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
              <Chip
                size="small"
                icon={<TagIcon />}
                label={`$${p.name}`}
                sx={[parametreTokenSx, { fontWeight: 600 }]}
              />
              <Typography variant="caption" color="text.secondary">
                {p.type}
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              <IconButton
                size="small"
                onClick={() => dispatch(removeParameter({ name: p.name }))}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
            <TextField
              size="small"
              fullWidth
              placeholder="Değer gir…"
              value={pending[p.name] ?? String(p.value ?? '')}
              onChange={(e) =>
                setPending({ ...pending, [p.name]: e.target.value })
              }
            />
          </Box>
        ))}
        {analysis.parameters.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Henüz parametre yok.
          </Typography>
        )}
      </Stack>

      {dirty && (
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button size="small" onClick={() => setPending({})}>
            Cancel
          </Button>
          <Button size="small" variant="contained" onClick={apply}>
            Apply
          </Button>
        </Stack>
      )}

      <CreateParameterDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(name, type, value) => {
          dispatch(
            addParameter({
              id: nanoid(),
              name,
              type,
              value:
                type === 'integer' || type === 'double' ? Number(value) : value,
            }),
          );
          setCreateOpen(false);
        }}
      />
    </Stack>
  );
}

function CreateParameterDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, type: ColumnType, value: string) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ColumnType>('string');
  const [value, setValue] = useState('');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Create parameter</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="İsim"
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))}
            helperText={name ? `Kullanım: $${name}` : 'Harf, rakam ve _ kullan'}
          />
          <Select
            size="small"
            value={type}
            onChange={(e) => setType(e.target.value as ColumnType)}
          >
            {(['string', 'integer', 'double', 'boolean', 'date', 'timestamp'] as ColumnType[]).map(
              (t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ),
            )}
          </Select>
          <TextField
            label="Başlangıç değeri"
            size="small"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>İptal</Button>
        <Button
          variant="contained"
          disabled={!name}
          onClick={() => {
            onCreate(name, type, value);
            setName('');
            setValue('');
          }}
        >
          Oluştur
        </Button>
      </DialogActions>
    </Dialog>
  );
}
