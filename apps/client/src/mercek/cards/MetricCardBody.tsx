import { Alert, MenuItem, Select, Skeleton, Stack, Typography } from '@mui/material';
import { useObjectSetAggregate } from '../api';
import { useMercekParams } from '../params';
import { fullNumber } from '../../core/vizPalette';
import type { ObjectSetDef, PropertyDef, MercekCard, MercekMetric } from '../../types/mercek';
import {
  AGGREGATION_LABELS,
  allowedAggregations,
  columnsForAggregation,
} from '../../core/aggregations';

const METRIC_FNS: Array<MercekMetric['fn']> = ['count', 'countDistinct', 'sum', 'avg', 'min', 'max'];

/** Tek sayı kartı — Mercek'daki büyük rakamlı metric card. */
export function MetricCardBody({
  card,
  inputDef,
  properties,
  onPatch,
}: {
  card: Extract<MercekCard, { kind: 'metric' }>;
  inputDef: ObjectSetDef | null;
  properties: PropertyDef[];
  onPatch: (p: Partial<Extract<MercekCard, { kind: 'metric' }>>) => void;
}) {
  const allowedFns = allowedAggregations(properties, METRIC_FNS);
  const { data, error } = useObjectSetAggregate(
    { def: inputDef, metric: card.metric },
    useMercekParams().values,
  );

  if (error) return <Alert severity="error">{String(error)}</Alert>;

  return (
    <Stack spacing={1} sx={{ height: '100%', justifyContent: 'center', alignItems: 'center' }}>
      {data ? (
        <Typography variant="h3" sx={{ fontWeight: 700 }}>
          {fullNumber.format(data.rows[0]?.value ?? 0)}
        </Typography>
      ) : (
        <Skeleton width={140} height={56} />
      )}
      <Stack direction="row" spacing={1}>
        <Select
          size="small" variant="standard" value={card.metric.fn}
          onChange={(e) => {
            const fn = e.target.value as MercekMetric['fn'];
            const valid = columnsForAggregation(fn, properties.map((x) => ({ ...x, name: x.apiName })));
            onPatch({
              metric: {
                fn,
                property: fn === 'count' ? undefined : (valid[0]?.apiName ?? undefined),
              },
            });
          }}
        >
          {allowedFns.map((fn) => (
            <MenuItem key={fn} value={fn}>{AGGREGATION_LABELS[fn]}</MenuItem>
          ))}
        </Select>
        {card.metric.fn !== 'count' && (
          <Select
            size="small" variant="standard" displayEmpty value={card.metric.property ?? ''}
            onChange={(e) => onPatch({ metric: { ...card.metric, property: e.target.value } })}
          >
            <MenuItem value="" disabled>Özellik</MenuItem>
            {columnsForAggregation(card.metric.fn, properties.map((x) => ({ ...x, name: x.apiName }))).map((p) => (
              <MenuItem key={p.apiName} value={p.apiName}>{p.displayName}</MenuItem>
            ))}
          </Select>
        )}
      </Stack>
    </Stack>
  );
}
