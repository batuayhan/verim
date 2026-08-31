import {
  Alert,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useObjectSetTimeseries } from '../api';
import { useMercekParams } from '../params';
import { SmartTimeseries } from '../../core/SmartTimeseries';
import type {
  ObjectSetDef,
  PropertyDef,
  MercekCard,
  MercekMetric,
  TimeseriesGranularity,
} from '../../types/mercek';
import {
  AGGREGATION_LABELS,
  allowedAggregations,
  columnsForAggregation,
} from '../../core/aggregations';

const METRIC_FNS: Array<MercekMetric['fn']> = ['count', 'countDistinct', 'sum', 'avg', 'min', 'max'];

export function TimeseriesCardBody({
  card,
  inputDef,
  properties,
  onPatch,
}: {
  card: Extract<MercekCard, { kind: 'timeseries' }>;
  inputDef: ObjectSetDef | null;
  properties: PropertyDef[];
  onPatch: (p: Partial<Extract<MercekCard, { kind: 'timeseries' }>>) => void;
}) {
  const dateProps = properties.filter((p) => p.type === 'date' || p.type === 'timestamp');
  const allowedFns = allowedAggregations(properties, METRIC_FNS);

  const { data, isFetching, error } = useObjectSetTimeseries(
    {
      def: card.dateProperty ? inputDef : null,
      dateProperty: card.dateProperty,
      metric: card.metric,
      granularity: card.granularity,
    },
    useMercekParams().values,
  );

  return (
    <Stack spacing={1} sx={{ height: '100%' }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Select
          size="small" variant="standard" displayEmpty value={card.dateProperty}
          onChange={(e) => onPatch({ dateProperty: e.target.value })}
        >
          <MenuItem value="" disabled>Tarih özelliği</MenuItem>
          {dateProps.map((p) => (
            <MenuItem key={p.apiName} value={p.apiName}>{p.displayName}</MenuItem>
          ))}
        </Select>
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
        <ToggleButtonGroup
          exclusive
          size="small"
          value={card.granularity}
          onChange={(_, v: TimeseriesGranularity | null) => v && onPatch({ granularity: v })}
        >
          <ToggleButton value="hour" sx={{ textTransform: 'none', py: 0 }}>Saat</ToggleButton>
          <ToggleButton value="day" sx={{ textTransform: 'none', py: 0 }}>Gün</ToggleButton>
          <ToggleButton value="week" sx={{ textTransform: 'none', py: 0 }}>Hafta</ToggleButton>
          <ToggleButton value="month" sx={{ textTransform: 'none', py: 0 }}>Ay</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {isFetching && <LinearProgress />}
      {error && <Alert severity="error">{String(error)}</Alert>}
      {!card.dateProperty && (
        <Alert severity="info">Tarih özelliği seç — seri otomatik oluşacak.</Alert>
      )}

      {data && data.points.length > 0 && (
        <SmartTimeseries points={data.points} height={200} />
      )}

      {data && (
        <Typography variant="caption" color="text.secondary">
          {data.points.length} nokta
        </Typography>
      )}
    </Stack>
  );
}
