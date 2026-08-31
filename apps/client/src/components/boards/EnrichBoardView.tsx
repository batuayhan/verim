import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import {
  Autocomplete,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useDatasets, useDatasetSchema } from '../../api/hooks';
import { updateBoard } from '../../store/analysisSlice';
import { useAppDispatch } from '../../store/hooks';
import type { EnrichBoardConfig } from '../../types/boards';
import type { BoardViewProps } from '../BoardCard';

export function EnrichBoardView({
  ctx,
  board,
  inputSchema,
}: BoardViewProps & { board: EnrichBoardConfig }) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<EnrichBoardConfig>(board);
  const { data: datasets } = useDatasets();
  const { data: rightSchema } = useDatasetSchema(draft.rightDatasetId || undefined);

  const rightColumns = rightSchema?.schema.columns ?? [];
  const save = () => dispatch(updateBoard({ pathId: ctx.path.id, board: draft }));

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="body2">Join</Typography>
        <Select
          size="small"
          displayEmpty
          value={draft.rightDatasetId}
          sx={{ minWidth: 180 }}
          onChange={(e) =>
            setDraft({ ...draft, rightDatasetId: e.target.value, selectedColumns: [], conditions: [{ leftColumn: '', rightColumn: '' }] })
          }
        >
          <MenuItem value="" disabled>Dataset seç</MenuItem>
          {datasets?.datasets
            .filter((d) => d.id !== ctx.datasetId)
            .map((d) => (
              <MenuItem key={d.id} value={d.id}>{d.label}</MenuItem>
            ))}
        </Select>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={draft.joinType}
          onChange={(_, v: 'left' | 'inner' | null) => v && setDraft({ ...draft, joinType: v })}
        >
          <ToggleButton value="left" sx={{ textTransform: 'none' }}>Left join</ToggleButton>
          <ToggleButton value="inner" sx={{ textTransform: 'none' }}>Inner join</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Typography variant="overline" color="text.secondary">Eşleşme koşulları</Typography>
      {draft.conditions.map((cond, i) => (
        <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Select
            size="small"
            displayEmpty
            value={cond.leftColumn}
            sx={{ minWidth: 160 }}
            onChange={(e) =>
              setDraft({
                ...draft,
                conditions: draft.conditions.map((c, j) => (j === i ? { ...c, leftColumn: e.target.value } : c)),
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
            value={cond.rightColumn}
            sx={{ minWidth: 160 }}
            onChange={(e) =>
              setDraft({
                ...draft,
                conditions: draft.conditions.map((c, j) => (j === i ? { ...c, rightColumn: e.target.value } : c)),
              })
            }
          >
            <MenuItem value="" disabled>Diğer dataset'ten kolon</MenuItem>
            {rightColumns.map((c) => (
              <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
            ))}
          </Select>
          <IconButton
            size="small"
            disabled={draft.conditions.length === 1}
            onClick={() =>
              setDraft({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })
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
          setDraft({ ...draft, conditions: [...draft.conditions, { leftColumn: '', rightColumn: '' }] })
        }
      >
        Koşul ekle
      </Button>

      <Typography variant="overline" color="text.secondary">Eklenecek kolonlar</Typography>
      <Autocomplete
        multiple
        size="small"
        options={rightColumns.map((c) => c.name)}
        value={draft.selectedColumns.map((c) => c.name)}
        onChange={(_, names) =>
          setDraft({
            ...draft,
            selectedColumns: names.map((name) => ({
              name,
              type: rightColumns.find((c) => c.name === name)?.type ?? 'string',
            })),
          })
        }
        renderInput={(params) => (
          <TextField {...params} placeholder={draft.rightDatasetId ? 'Kolon seç…' : 'Önce dataset seç'} />
        )}
        renderValue={(value, getItemProps) =>
          value.map((option, i) => (
            <Chip {...getItemProps({ index: i })} key={option} size="small" label={option} />
          ))
        }
      />

      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button size="small" onClick={() => setDraft(board)}>Cancel</Button>
        <Button
          size="small"
          variant="contained"
          onClick={save}
          disabled={
            !draft.rightDatasetId ||
            draft.selectedColumns.length === 0 ||
            draft.conditions.some((c) => !c.leftColumn || !c.rightColumn)
          }
        >
          Apply
        </Button>
      </Stack>
    </Stack>
  );
}
