import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { nanoid } from '@reduxjs/toolkit';
import { useObjectSetAggregate } from '../api';
import { useMercekParams } from '../params';
import { updateMercekCard } from '../../store/mercekSlice';
import { useAppDispatch } from '../../store/hooks';
import type { FilterCondition, FilterOperator, FilterValue } from '../../types/boards';
import type { ObjectSetDef, PropertyDef, MercekCard } from '../../types/mercek';

/** Filtre değerinin okunaklı metni (literal/parametre/göreli zaman) */
function valLabel(v: FilterValue): string {
  if (v.kind === 'literal') return String(v.value);
  if (v.kind === 'parameter') return `$${v.name}`;
  return `son ${v.amount} ${v.unit}`;
}

import { TimeConditionInput } from '../../components/boards/TimeConditionInput';
import { ObjectSetTableBody } from './ObjectSetTableBody';

const OPERATOR_LABELS: Partial<Record<FilterOperator, string>> = {
  eq: 'eşittir',
  neq: 'eşit değildir',
  lt: 'küçüktür',
  gt: 'büyüktür',
  between: 'arasında',
  in: 'şunlardan biri',
  contains: 'içerir',
};

function operatorsFor(prop: PropertyDef | undefined): FilterOperator[] {
  if (!prop) return ['eq'];
  if (prop.type === 'integer' || prop.type === 'double')
    return ['eq', 'neq', 'lt', 'gt', 'between'];
  if (prop.type === 'date' || prop.type === 'timestamp')
    return ['between', 'lt', 'gt', 'eq'];
  return ['eq', 'neq', 'in', 'contains'];
}

/**
 * Cümle stili filtre: "Şu koşullara [tümü] uyan nesneleri tut:
 * [Özellik] [eşittir] [değer]". Değer önerileri gerçek veriden gelir.
 */
export function FilterCardBody({
  card,
  inputDef,
  selfDef,
  properties,
}: {
  card: Extract<MercekCard, { kind: 'filter' }>;
  inputDef: ObjectSetDef | null;
  selfDef: ObjectSetDef | null;
  properties: PropertyDef[];
}) {
  const dispatch = useAppDispatch();

  const patch = (p: Partial<typeof card>) =>
    dispatch(updateMercekCard({ ...card, ...p }));

  const setCond = (i: number, p: Partial<FilterCondition>) =>
    patch({
      conditions: card.conditions.map((c, j) => (j === i ? { ...c, ...p } : c)),
    });

  return (
    <Stack spacing={1} sx={{ height: '100%' }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2">Koşulların</Typography>
        <Select
          size="small"
          variant="standard"
          value={card.combinator}
          onChange={(e) => patch({ combinator: e.target.value })}
        >
          <MenuItem value="and">tümüne</MenuItem>
          <MenuItem value="or">herhangi birine</MenuItem>
        </Select>
        <Typography variant="body2">uyan nesneleri tut:</Typography>
      </Stack>

      {card.conditions.map((cond, i) => (
        <ConditionRow
          key={cond.id}
          cond={cond}
          properties={properties}
          inputDef={inputDef}
          onChange={(p) => setCond(i, p)}
          onDelete={() =>
            patch({ conditions: card.conditions.filter((_, j) => j !== i) })
          }
        />
      ))}

      <Button
        size="small"
        startIcon={<AddIcon />}
        sx={{ alignSelf: 'flex-start' }}
        onClick={() =>
          patch({
            conditions: [
              ...card.conditions,
              { id: nanoid(), column: '', operator: 'eq', values: [] },
            ],
          })
        }
      >
        Koşul ekle
      </Button>

      <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ObjectSetTableBody def={selfDef} />
      </Box>
    </Stack>
  );
}

function ConditionRow({
  cond,
  properties,
  inputDef,
  onChange,
  onDelete,
}: {
  cond: FilterCondition;
  properties: PropertyDef[];
  inputDef: ObjectSetDef | null;
  onChange: (p: Partial<FilterCondition>) => void;
  onDelete: () => void;
}) {
  const prop = properties.find((p) => p.apiName === cond.column);
  const isString = prop?.type === 'string';
  const isTime = prop?.type === 'date' || prop?.type === 'timestamp';

  const mercekParams = useMercekParams();
  // string özellikler için gerçek verideki değerler
  const { data: distinct } = useObjectSetAggregate(
    {
      def: isString && cond.column ? inputDef : null,
      groupBy: cond.column,
      metric: { fn: 'count' },
      limit: 30,
    },
    mercekParams.values,
  );
  const options = [
    ...mercekParams.names.map((n) => `$${n}`),
    ...(distinct?.rows ?? []).map((r) => String(r.group)),
  ];

  const commit = (raws: string[]) =>
    onChange({
      values: raws.filter(Boolean).map((raw) => {
        if (raw.startsWith('$')) {
          return { kind: 'parameter' as const, name: raw.slice(1) };
        }
        return {
          kind: 'literal' as const,
          value:
            prop && (prop.type === 'integer' || prop.type === 'double')
              ? Number(raw)
              : raw,
        };
      }),
    });

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <IconButton size="small" onClick={onDelete}>
        <DeleteIcon fontSize="small" />
      </IconButton>
      <Select
        size="small"
        displayEmpty
        value={cond.column}
        sx={{ minWidth: 140 }}
        onChange={(e) => onChange({ column: e.target.value, operator: 'eq', values: [] })}
      >
        <MenuItem value="" disabled>Özellik</MenuItem>
        {properties.map((p) => (
          <MenuItem key={p.apiName} value={p.apiName}>{p.displayName}</MenuItem>
        ))}
      </Select>
      {isTime ? (
        <TimeConditionInput cond={cond} onChange={onChange} />
      ) : (
        <>
      <Select
        size="small"
        value={cond.operator}
        sx={{ minWidth: 120 }}
        onChange={(e) => onChange({ operator: e.target.value as FilterOperator, values: [] })}
      >
        {operatorsFor(prop).map((op) => (
          <MenuItem key={op} value={op}>{OPERATOR_LABELS[op] ?? op}</MenuItem>
        ))}
      </Select>
      {cond.operator === 'in' && isString ? (
        <Autocomplete
          freeSolo
          multiple
          size="small"
          sx={{ minWidth: 220, flexGrow: 1 }}
          options={options}
          value={cond.values.map(valLabel)}
          onChange={(_, values) => commit(values.map(String))}
          renderInput={(params) => <TextField {...params} placeholder="Değerleri seç" />}
        />
      ) : isString && (cond.operator === 'eq' || cond.operator === 'neq') ? (
        <Autocomplete
          freeSolo
          size="small"
          sx={{ minWidth: 180, flexGrow: 1 }}
          options={options}
          value={cond.values[0] ? valLabel(cond.values[0]) : ''}
          onChange={(_, v) => commit(v ? [String(v)] : [])}
          onInputChange={(_, v, reason) => {
            if (reason === 'input') commit(v ? [v] : []);
          }}
          renderInput={(params) => <TextField {...params} placeholder="Değer seç veya yaz" />}
        />
      ) : (
        <TextField
          size="small"
          sx={{ minWidth: 160, flexGrow: 1 }}
          placeholder={cond.operator === 'between' ? 'alt, üst (virgülle)' : 'değer'}
          defaultValue={cond.values.map(valLabel).join(', ')}
          onBlur={(e) =>
            commit(
              cond.operator === 'between' || cond.operator === 'in'
                ? e.target.value.split(',').map((s) => s.trim())
                : [e.target.value],
            )
          }
        />
      )}
        </>
      )}
    </Stack>
  );
}
