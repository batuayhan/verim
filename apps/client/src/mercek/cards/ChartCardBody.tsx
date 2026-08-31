import { Alert, LinearProgress, MenuItem, Select, Stack, Typography, useTheme } from '@mui/material';
import { nanoid } from '@reduxjs/toolkit';
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useObjectSetAggregate } from '../api';
import { CHART_INK, compactNumber, fullNumber, seriesColor } from '../../core/vizPalette';
import { addMercekCard } from '../../store/mercekSlice';
import { useAppDispatch, useAppSelector, selectMercekAnalysis } from '../../store/hooks';
import type { ObjectSetDef, PropertyDef, MercekCard, MercekMetric } from '../../types/mercek';
import {
  AGGREGATION_LABELS,
  allowedAggregations,
  columnsForAggregation,
} from '../../core/aggregations';
import { findFreeSlot, nextChip } from '../core';
import { useMercekParams } from '../params';

const METRIC_FNS: Array<MercekMetric['fn']> = ['count', 'countDistinct', 'sum', 'avg', 'min', 'max'];

export function ChartCardBody({
  card,
  inputDef,
  properties,
  onPatch,
}: {
  card: Extract<MercekCard, { kind: 'chart' }>;
  inputDef: ObjectSetDef | null;
  properties: PropertyDef[];
  onPatch: (p: Partial<Extract<MercekCard, { kind: 'chart' }>>) => void;
}) {
  const dilimAyrac = useTheme().palette.background.paper;
  const dispatch = useAppDispatch();
  const analysis = useAppSelector(selectMercekAnalysis);
  const allowedFns = allowedAggregations(properties, METRIC_FNS);

  const { data, isFetching, error } = useObjectSetAggregate(
    {
      def: card.groupBy ? inputDef : null,
      groupBy: card.groupBy,
      segmentBy: card.segmentBy,
      metric: card.metric,
      limit: 30,
    },
    useMercekParams().values,
  );

  // Segmentli sonuç → geniş format
  const { chartData, segmentKeys } = useMemo(() => {
    if (!data) return { chartData: [], segmentKeys: [] as string[] };
    if (!card.segmentBy) {
      return {
        chartData: data.rows.map((r) => ({ group: r.group, value: r.value })),
        segmentKeys: [],
      };
    }
    const byGroup = new Map<string, Record<string, unknown>>();
    const segs = new Set<string>();
    for (const r of data.rows) {
      const g = String(r.group);
      const s = String(r.segment ?? '(boş)');
      segs.add(s);
      const row = byGroup.get(g) ?? { group: g };
      row[s] = r.value;
      byGroup.set(g, row);
    }
    return { chartData: [...byGroup.values()], segmentKeys: [...segs].slice(0, 8) };
  }, [data, card.segmentBy]);

  // Drill-down: bara/dilime tıkla → filtre kartı türet
  const drillDown = (groupValue: string) => {
    if (!analysis) return;
    const chip = nextChip(analysis.cards);
    dispatch(
      addMercekCard({
        card: {
          id: nanoid(),
          chip,
          kind: 'filter',
          title: `${card.groupBy} = ${groupValue}`,
          inputId: card.inputId,
          combinator: 'and',
          conditions: [
            {
              id: nanoid(),
              column: card.groupBy,
              operator: 'eq',
              values: [{ kind: 'literal', value: groupValue }],
            },
          ],
        },
        layout: findFreeSlot(analysis.layout, 6, 8),
      }),
    );
  };

  return (
    <Stack spacing={1} sx={{ height: '100%' }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Select
          size="small" variant="standard" displayEmpty value={card.groupBy}
          onChange={(e) => onPatch({ groupBy: e.target.value })}
        >
          <MenuItem value="" disabled>Neye göre grupla</MenuItem>
          {properties.map((p) => (
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
        <Select
          size="small" variant="standard" displayEmpty value={card.segmentBy ?? ''}
          onChange={(e) => onPatch({ segmentBy: e.target.value || undefined })}
        >
          <MenuItem value="">Segment yok</MenuItem>
          {properties
            .filter((p) => p.apiName !== card.groupBy && p.type === 'string')
            .map((p) => (
              <MenuItem key={p.apiName} value={p.apiName}>{p.displayName}</MenuItem>
            ))}
        </Select>
        <Select
          size="small" variant="standard" value={card.chartType}
          onChange={(e) => onPatch({ chartType: e.target.value as 'bar' | 'pie' })}
        >
          <MenuItem value="bar">Bar</MenuItem>
          <MenuItem value="pie">Pie</MenuItem>
        </Select>
      </Stack>

      {isFetching && <LinearProgress />}
      {error && <Alert severity="error">{String(error)}</Alert>}
      {!card.groupBy && (
        <Alert severity="info">Gruplama özelliği seç — grafik otomatik dolacak.</Alert>
      )}

      {data && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
          {card.chartType === 'pie' ? (
            <PieChart>
              <Tooltip formatter={(v: unknown) => fullNumber.format(Number(v))} />
              <Legend layout="vertical" align="right" verticalAlign="middle" />
              <Pie
                data={chartData.slice(0, 8)}
                dataKey="value"
                nameKey="group"
                outerRadius="85%"
                labelLine={false}
                label={(e) => {
                  const props = e as unknown as { percent?: number };
                  const pct = (props.percent ?? 0) * 100;
                  return pct >= 5 ? `%${pct.toFixed(0)}` : '';
                }}
                isAnimationActive={false}
                onClick={(e) => {
                  const g = (e as { group?: unknown }).group;
                  if (g !== undefined) drillDown(String(g));
                }}
                cursor="pointer"
              >
                {chartData.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={seriesColor(i)} stroke={dilimAyrac} strokeWidth={2} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 8, right: 8 }}>
              <CartesianGrid stroke={CHART_INK.gridline} vertical={false} />
              <XAxis dataKey="group" stroke={CHART_INK.baseline} tick={{ fill: CHART_INK.muted, fontSize: 11 }} />
              <YAxis
                stroke={CHART_INK.baseline}
                tick={{ fill: CHART_INK.muted, fontSize: 11 }}
                tickFormatter={(v: number) => compactNumber.format(v)}
              />
              <Tooltip formatter={(v: unknown) => fullNumber.format(Number(v))} />
              {segmentKeys.length > 0 && <Legend />}
              {segmentKeys.length > 0 ? (
                segmentKeys.map((k, i) => (
                  <Bar key={k} dataKey={k} stackId="seg" fill={seriesColor(i)} isAnimationActive={false} />
                ))
              ) : (
                <Bar
                  dataKey="value"
                  fill={seriesColor(0)}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  cursor="pointer"
                  onClick={(entry) => {
                    const payload = (entry as { payload?: { group?: unknown } }).payload;
                    if (payload?.group !== undefined) drillDown(String(payload.group));
                  }}
                />
              )}
            </BarChart>
          )}
        </ResponsiveContainer>
      )}

      {data && (
        <Typography variant="caption" color="text.secondary">
          {data.totalGroups} grup{!card.segmentBy && ' · bara tıkla → o grubun nesnelerine in'}
        </Typography>
      )}
    </Stack>
  );
}
