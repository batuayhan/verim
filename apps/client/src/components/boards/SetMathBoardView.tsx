import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import {
  Button,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useDatasets, useDatasetSchema } from '../../api/hooks';
import { updateBoard } from '../../store/analysisSlice';
import { useAppDispatch } from '../../store/hooks';
import type { SetMathBoardConfig } from '../../types/boards';
import type { BoardViewProps } from '../BoardCard';

const OPERATION_LABELS: Record<SetMathBoardConfig['operation'], string> = {
  keepOnly: 'Keep only — diğer dataset\'te eşleşen satırları tut',
  remove: 'Remove — diğer dataset\'te eşleşen satırları çıkar',
  add: 'Add — diğer dataset\'in satırlarını ekle',
};

export function SetMathBoardView({
  ctx,
  board,
  inputSchema,
}: BoardViewProps & { board: SetMathBoardConfig }) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<SetMathBoardConfig>(board);
  const { data: datasets } = useDatasets();
  const { data: otherSchema } = useDatasetSchema(draft.otherDatasetId || undefined);
  const otherColumns = otherSchema?.schema.columns ?? [];

  return (
    <Stack spacing={2}>
      <Select
        size="small"
        value={draft.operation}
        onChange={(e) =>
          setDraft({ ...draft, operation: e.target.value as SetMathBoardConfig['operation'] })
        }
      >
        {(Object.keys(OPERATION_LABELS) as Array<SetMathBoardConfig['operation']>).map((op) => (
          <MenuItem key={op} value={op}>{OPERATION_LABELS[op]}</MenuItem>
        ))}
      </Select>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2">Dataset:</Typography>
        <Select
          size="small"
          displayEmpty
          value={draft.otherDatasetId}
          sx={{ minWidth: 180 }}
          onChange={(e) =>
            setDraft({ ...draft, otherDatasetId: e.target.value, keyColumns: [{ leftColumn: '', rightColumn: '' }] })
          }
        >
          <MenuItem value="" disabled>Dataset seç</MenuItem>
          {datasets?.datasets
            .filter((d) => d.id !== ctx.datasetId)
            .map((d) => (
              <MenuItem key={d.id} value={d.id}>{d.label}</MenuItem>
            ))}
        </Select>
      </Stack>

      <Typography variant="overline" color="text.secondary">Anahtar kolonlar</Typography>
      {draft.keyColumns.map((kc, i) => (
        <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Select
            size="small"
            displayEmpty
            value={kc.leftColumn}
            sx={{ minWidth: 160 }}
            onChange={(e) =>
              setDraft({
                ...draft,
                keyColumns: draft.keyColumns.map((c, j) => (j === i ? { ...c, leftColumn: e.target.value } : c)),
              })
            }
          >
            <MenuItem value="" disabled>Bu path'ten kolon</MenuItem>
            {inputSchema.columns.map((c) => (
              <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
            ))}
          </Select>
          <Typography variant="body2">=</Typography>
          <Select
            size="small"
            displayEmpty
            value={kc.rightColumn}
            sx={{ minWidth: 160 }}
            onChange={(e) =>
              setDraft({
                ...draft,
                keyColumns: draft.keyColumns.map((c, j) => (j === i ? { ...c, rightColumn: e.target.value } : c)),
              })
            }
          >
            <MenuItem value="" disabled>Diğer dataset'ten kolon</MenuItem>
            {otherColumns.map((c) => (
              <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
            ))}
          </Select>
          <IconButton
            size="small"
            disabled={draft.keyColumns.length === 1}
            onClick={() =>
              setDraft({ ...draft, keyColumns: draft.keyColumns.filter((_, j) => j !== i) })
            }
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Button
        size="small"
        startIcon={<AddIcon />}
        sx={{ alignSelf: 'flex-start' }}
        onClick={() =>
          setDraft({ ...draft, keyColumns: [...draft.keyColumns, { leftColumn: '', rightColumn: '' }] })
        }
      >
        Anahtar ekle
      </Button>

      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button size="small" onClick={() => setDraft(board)}>Cancel</Button>
        <Button
          size="small"
          variant="contained"
          disabled={!draft.otherDatasetId || draft.keyColumns.some((c) => !c.leftColumn || !c.rightColumn)}
          onClick={() => dispatch(updateBoard({ pathId: ctx.path.id, board: draft }))}
        >
          Apply
        </Button>
      </Stack>
    </Stack>
  );
}
