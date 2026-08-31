import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import {
  Button,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { updateBoard } from '../../store/analysisSlice';
import { useAppDispatch } from '../../store/hooks';
import type { ColumnOperation, EditColumnsBoardConfig } from '../../types/boards';
import type { ColumnType } from '../../types/schema';
import type { BoardViewProps } from '../BoardCard';

type EditableOp = Exclude<ColumnOperation, { op: 'reorder' }>;

const TYPES: ColumnType[] = ['string', 'integer', 'double', 'boolean', 'date', 'timestamp'];

export function EditColumnsBoardView({
  ctx,
  board,
  inputSchema,
}: BoardViewProps & { board: EditColumnsBoardConfig }) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<EditColumnsBoardConfig>(board);

  const ops = draft.operations.filter((o): o is EditableOp => o.op !== 'reorder');

  const setOp = (i: number, op: EditableOp) =>
    setDraft({ ...draft, operations: draft.operations.map((x, j) => (j === i ? op : x)) });

  return (
    <Stack spacing={1.5}>
      {ops.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Kolon işlemi ekle: sil, yeniden adlandır veya tip değiştir.
        </Typography>
      )}
      {ops.map((op, i) => (
        <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Select
            size="small"
            value={op.op}
            sx={{ minWidth: 150 }}
            onChange={(e) => {
              const kind = e.target.value as EditableOp['op'];
              if (kind === 'drop') setOp(i, { op: 'drop', column: op.column });
              if (kind === 'rename') setOp(i, { op: 'rename', column: op.column, newName: '' });
              if (kind === 'cast') setOp(i, { op: 'cast', column: op.column, toType: 'string' });
            }}
          >
            <MenuItem value="drop">Kolonu sil</MenuItem>
            <MenuItem value="rename">Yeniden adlandır</MenuItem>
            <MenuItem value="cast">Tip değiştir</MenuItem>
          </Select>
          <Select
            size="small"
            displayEmpty
            value={op.column}
            sx={{ minWidth: 160 }}
            onChange={(e) => setOp(i, { ...op, column: e.target.value })}
          >
            <MenuItem value="" disabled>Kolon seç</MenuItem>
            {inputSchema.columns.map((c) => (
              <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
            ))}
          </Select>
          {op.op === 'rename' && (
            <TextField
              size="small"
              placeholder="Yeni ad"
              value={op.newName}
              onChange={(e) => setOp(i, { ...op, newName: e.target.value })}
            />
          )}
          {op.op === 'cast' && (
            <Select
              size="small"
              value={op.toType}
              onChange={(e) => setOp(i, { ...op, toType: e.target.value as ColumnType })}
            >
              {TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          )}
          <IconButton
            size="small"
            onClick={() =>
              setDraft({ ...draft, operations: draft.operations.filter((_, j) => j !== i) })
            }
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}

      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() =>
            setDraft({ ...draft, operations: [...draft.operations, { op: 'drop', column: '' }] })
          }
        >
          İşlem ekle
        </Button>
        <Stack direction="row" spacing={1} sx={{ flexGrow: 1, justifyContent: 'flex-end' }}>
          <Button size="small" onClick={() => setDraft(board)}>Cancel</Button>
          <Button
            size="small"
            variant="contained"
            disabled={ops.some((o) => !o.column || (o.op === 'rename' && !o.newName))}
            onClick={() => dispatch(updateBoard({ pathId: ctx.path.id, board: draft }))}
          >
            Apply
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}
