import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { parametreTokenSx } from '../../theme/tokens';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { nanoid } from '@reduxjs/toolkit';
import { useState } from 'react';
import { useDistinctValues } from '../../api/hooks';
import { updateBoard } from '../../store/analysisSlice';
import { selectAnalysis, useAppDispatch, useAppSelector } from '../../store/hooks';
import type {
  FilterBoardConfig,
  FilterCondition,
  FilterOperator,
  FilterValue,
} from '../../types/boards';
import type { ColumnSchema } from '../../types/schema';
import { isNumeric, isTemporal } from '../../types/schema';
import type { BoardViewProps } from '../BoardCard';
import { TimeConditionInput } from './TimeConditionInput';

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'eşittir',
  neq: 'eşit değildir',
  lt: 'küçüktür',
  lte: 'küçük veya eşittir',
  gt: 'büyüktür',
  gte: 'büyük veya eşittir',
  between: 'arasında',
  in: 'şunlardan biri',
  contains: 'içerir',
  startsWith: 'ile başlar',
  endsWith: 'ile biter',
  matchesRegex: 'regex eşleşir',
  isNull: 'boş',
  isNotNull: 'dolu',
};

const OPERATOR_SYMBOLS: Partial<Record<FilterOperator, string>> = {
  eq: '=',
  neq: '≠',
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
};

function operatorsFor(col: ColumnSchema | undefined): FilterOperator[] {
  if (!col) return ['eq'];
  if (isNumeric(col)) return ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'between', 'isNull', 'isNotNull'];
  if (isTemporal(col)) return ['between', 'lt', 'lte', 'gt', 'gte', 'eq', 'isNull', 'isNotNull'];
  if (col.type === 'boolean') return ['eq', 'neq', 'isNull', 'isNotNull'];
  return ['eq', 'neq', 'in', 'contains', 'startsWith', 'endsWith', 'matchesRegex', 'isNull', 'isNotNull'];
}

function valueCount(op: FilterOperator): number {
  if (op === 'isNull' || op === 'isNotNull') return 0;
  if (op === 'between') return 2;
  if (op === 'in') return -1;
  return 1;
}

function parseRaw(raw: string, col: ColumnSchema | undefined): FilterValue {
  if (raw.startsWith('$')) return { kind: 'parameter', name: raw.slice(1) };
  if (col && isNumeric(col)) {
    const n = Number(raw);
    return { kind: 'literal', value: Number.isNaN(n) ? raw : n };
  }
  if (col?.type === 'boolean') return { kind: 'literal', value: raw === 'true' };
  return { kind: 'literal', value: raw };
}

function valueToRaw(v: FilterValue): string {
  if (v.kind === 'parameter') return `$${v.name}`;
  if (v.kind === 'relative') return `son ${v.amount} ${v.unit}`;
  return String(v.value);
}

export function FilterBoardView({
  ctx,
  board,
  index,
  inputSchema,
}: BoardViewProps & { board: FilterBoardConfig }) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(board.conditions.length === 0);
  const [draft, setDraft] = useState<FilterBoardConfig>(board);

  const save = () => {
    dispatch(updateBoard({ pathId: ctx.path.id, board: draft }));
    setEditing(false);
  };

  if (!editing) {
    return (
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip
          size="small"
          color={board.action === 'keep' ? 'success' : 'error'}
          label={board.action === 'keep' ? 'Satırları tut' : 'Satırları çıkar'}
        />
        {board.conditions.map((c, i) => (
          <Stack key={c.id} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            {i > 0 && (
              <Typography variant="body2" color="text.secondary">
                {board.combinator === 'and' ? 'VE' : 'VEYA'}
              </Typography>
            )}
            <Chip size="small" variant="outlined" color="info" label={c.column} />
            <Typography variant="body2">
              {OPERATOR_SYMBOLS[c.operator] ?? OPERATOR_LABELS[c.operator]}
            </Typography>
            {c.values.map((v, j) => (
              <Chip
                key={j}
                size="small"
                variant="outlined"
                color={v.kind === 'parameter' ? 'warning' : 'default'}
                label={valueToRaw(v)}
              />
            ))}
          </Stack>
        ))}
        {board.conditions.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            (koşul yok — tüm satırlar geçer)
          </Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <IconButton size="small" onClick={() => { setDraft(board); setEditing(true); }}>
          <EditIcon fontSize="small" />
        </IconButton>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Select
          size="small"
          value={draft.action}
          onChange={(e) => setDraft({ ...draft, action: e.target.value })}
        >
          <MenuItem value="keep">Satırları tut</MenuItem>
          <MenuItem value="remove">Satırları çıkar</MenuItem>
        </Select>
        <Select
          size="small"
          value={draft.combinator}
          onChange={(e) => setDraft({ ...draft, combinator: e.target.value })}
        >
          <MenuItem value="and">tüm koşullar sağlanırsa (VE)</MenuItem>
          <MenuItem value="or">herhangi biri sağlanırsa (VEYA)</MenuItem>
        </Select>
      </Stack>

      {draft.conditions.map((cond, i) => (
        <ConditionRow
          key={cond.id}
          ctx={ctx}
          boardIndex={index}
          cond={cond}
          inputSchema={inputSchema}
          onChange={(patch) =>
            setDraft({
              ...draft,
              conditions: draft.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)),
            })
          }
          onDelete={() =>
            setDraft({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })
          }
        />
      ))}

      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() =>
            setDraft({
              ...draft,
              conditions: [
                ...draft.conditions,
                { id: nanoid(), column: '', operator: 'eq', values: [] },
              ],
            })
          }
        >
          Koşul ekle
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" onClick={() => { setDraft(board); setEditing(false); }}>
          Vazgeç
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={save}
          disabled={draft.conditions.some(
            (c) => !c.column || (valueCount(c.operator) !== 0 && c.values.length === 0),
          )}
        >
          Kaydet
        </Button>
      </Stack>

      {draft.conditions.length === 0 && (
        <Alert severity="info" sx={{ py: 0 }}>
          Koşul eklemeden kaydedersen tüm satırlar geçer.
        </Alert>
      )}
    </Stack>
  );
}

function ConditionRow({
  ctx,
  boardIndex,
  cond,
  inputSchema,
  onChange,
  onDelete,
}: {
  ctx: BoardViewProps['ctx'];
  boardIndex: number;
  cond: FilterCondition;
  inputSchema: BoardViewProps['inputSchema'];
  onChange: (patch: Partial<FilterCondition>) => void;
  onDelete: () => void;
}) {
  const analysis = useAppSelector(selectAnalysis);
  const col = inputSchema.columns.find((c) => c.name === cond.column);
  const ops = operatorsFor(col);
  const nValues = valueCount(cond.operator);

  const paramOptions = (analysis?.parameters ?? []).map((p) => `$${p.name}`);
  const suggestionsEnabled =
    Boolean(col) &&
    col!.type === 'string' &&
    ['eq', 'neq', 'in', 'contains', 'startsWith', 'endsWith'].includes(cond.operator);

  // Gerçek verideki değerler — kullanıcı yazmak yerine seçsin
  const distinct = useDistinctValues({
    datasetId: ctx.datasetId,
    datasetVersion: ctx.datasetVersion,
    upstreamBoards: ctx.path.boards.slice(0, boardIndex),
    column: suggestionsEnabled ? cond.column : undefined,
    parameters: ctx.parameters,
    enabled: suggestionsEnabled,
  });
  const options = [...paramOptions, ...distinct];

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <IconButton size="small" onClick={onDelete}>
        <DeleteIcon fontSize="small" />
      </IconButton>

      <Select
        size="small"
        displayEmpty
        value={cond.column}
        sx={{ minWidth: 170 }}
        onChange={(e) => onChange({ column: e.target.value, operator: 'eq', values: [] })}
      >
        <MenuItem value="" disabled>Kolon seç</MenuItem>
        {inputSchema.columns.map((c) => (
          <MenuItem key={c.name} value={c.name}>
            {c.name}{' '}
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
              ({c.type})
            </Typography>
          </MenuItem>
        ))}
      </Select>

      {col && isTemporal(col) ? (
        <TimeConditionInput cond={cond} onChange={onChange} />
      ) : (
        <>
      <Select
        size="small"
        value={cond.operator}
        sx={{ minWidth: 160 }}
        onChange={(e) => onChange({ operator: e.target.value as FilterOperator, values: [] })}
      >
        {ops.map((op) => (
          <MenuItem key={op} value={op}>{OPERATOR_LABELS[op]}</MenuItem>
        ))}
      </Select>

      {nValues !== 0 &&
        (suggestionsEnabled && (cond.operator === 'eq' || cond.operator === 'neq') ? (
          <Autocomplete
            freeSolo
            size="small"
            sx={{ minWidth: 240 }}
            options={options}
            value={cond.values[0] ? valueToRaw(cond.values[0]) : ''}
            onChange={(_, v) => onChange({ values: v ? [parseRaw(String(v), col)] : [] })}
            onInputChange={(_, v, reason) => {
              if (reason === 'input') onChange({ values: v ? [parseRaw(v, col)] : [] });
            }}
            renderOption={(props, option) => (
              <li {...props} key={option}>
                {option.startsWith('$') ? (
                  <Chip size="small" label={option} sx={parametreTokenSx} />
                ) : (
                  option
                )}
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} placeholder="Değer seç veya yaz" />
            )}
          />
        ) : suggestionsEnabled && cond.operator === 'in' ? (
          <Autocomplete
            freeSolo
            multiple
            size="small"
            sx={{ minWidth: 300 }}
            options={options}
            value={cond.values.map(valueToRaw)}
            onChange={(_, values) =>
              onChange({ values: values.map((v) => parseRaw(String(v), col)) })
            }
            renderValue={(value, getItemProps) =>
              value.map((option, i) => (
                <Chip
                  {...getItemProps({ index: i })}
                  key={`${option}-${i}`}
                  size="small"
                  label={option}
                  sx={option.startsWith('$') ? parametreTokenSx : undefined}
                />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} placeholder="Değerleri seç" />
            )}
          />
        ) : (
          <TextField
            size="small"
            sx={{ minWidth: 240 }}
            placeholder={
              nValues === 2
                ? 'alt, üst (virgülle ayır)'
                : nValues === -1
                  ? 'değerler (virgülle ayır)'
                  : col && isTemporal(col)
                    ? 'örn: 2026-01-01'
                    : 'değer'
            }
            defaultValue={cond.values.map(valueToRaw).join(', ')}
            onBlur={(e) => {
              const parts =
                nValues === 1
                  ? [e.target.value].filter(Boolean)
                  : e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
              onChange({ values: parts.map((raw) => parseRaw(raw, col)) });
            }}
          />
        ))}
        </>
      )}
    </Stack>
  );
}
