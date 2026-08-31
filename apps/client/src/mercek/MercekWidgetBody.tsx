import { Alert, Skeleton, Stack, Typography, useTheme } from '@mui/material';
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
import { CHART_INK, compactNumber, fullNumber, seriesColor } from '../core/vizPalette';
import { SmartTimeseries } from '../core/SmartTimeseries';
import type { MercekAnalysis, MercekCard } from '../types/mercek';
import { useObjectSetAggregate, useObjectSetTimeseries } from './api';
import { ObjectSetTableBody } from './cards/ObjectSetTableBody';
import { buildDef, producesObjectSet } from './core';
import { useMercekParams } from './params';

/**
 * Dashboard widget gövdesi — kartın SALT OKUNUR sunumu. Config seçicileri
 * ve drill-down yok; sadece sonuç. Kaynak kart silinirse uyarı gösterir.
 */
export function MercekWidgetBody({
  analysis,
  cardId,
}: {
  analysis: MercekAnalysis;
  cardId: string;
}) {
  const card = analysis.cards.find((c) => c.id === cardId);
  if (!card) {
    return <Alert severity="warning">Kaynak kart silinmiş — widget'ı kaldırabilirsiniz.</Alert>;
  }
  if (producesObjectSet(card)) {
    return <SetWidget analysis={analysis} card={card} />;
  }
  switch (card.kind) {
    case 'chart':
      return <ChartWidget analysis={analysis} card={card} />;
    case 'metric':
      return <MetricWidget analysis={analysis} card={card} />;
    case 'timeseries':
      return <TimeseriesWidget analysis={analysis} card={card} />;
    default:
      return null;
  }
}

function SetWidget({ analysis, card }: { analysis: MercekAnalysis; card: MercekCard }) {
  const def = useMemo(() => buildDef(analysis, card.id), [analysis, card.id]);
  return <ObjectSetTableBody def={def} />;
}

function ChartWidget({
  analysis,
  card,
}: {
  analysis: MercekAnalysis;
  card: Extract<MercekCard, { kind: 'chart' }>;
}) {
  const dilimAyrac = useTheme().palette.background.paper; // pasta dilimi ayracı = kart zemini
  const inputDef = useMemo(() => buildDef(analysis, card.inputId), [analysis, card.inputId]);
  const { data, error } = useObjectSetAggregate(
    {
      def: card.groupBy ? inputDef : null,
      groupBy: card.groupBy,
      segmentBy: card.segmentBy,
      metric: card.metric,
      limit: 30,
    },
    useMercekParams().values,
  );

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

  if (error) return <Alert severity="error">{String(error)}</Alert>;
  if (!data) return <Skeleton variant="rounded" height="100%" />;

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={140}>
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
            <Bar dataKey="value" fill={seriesColor(0)} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          )}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

function MetricWidget({
  analysis,
  card,
}: {
  analysis: MercekAnalysis;
  card: Extract<MercekCard, { kind: 'metric' }>;
}) {
  const inputDef = useMemo(() => buildDef(analysis, card.inputId), [analysis, card.inputId]);
  const { data, error } = useObjectSetAggregate(
    { def: inputDef, metric: card.metric },
    useMercekParams().values,
  );
  if (error) return <Alert severity="error">{String(error)}</Alert>;
  return (
    <Stack sx={{ height: '100%', justifyContent: 'center', alignItems: 'center' }}>
      {data ? (
        <Typography variant="h3" sx={{ fontWeight: 700 }}>
          {fullNumber.format(data.rows[0]?.value ?? 0)}
        </Typography>
      ) : (
        <Skeleton width={140} height={56} />
      )}
    </Stack>
  );
}

function TimeseriesWidget({
  analysis,
  card,
}: {
  analysis: MercekAnalysis;
  card: Extract<MercekCard, { kind: 'timeseries' }>;
}) {
  const inputDef = useMemo(() => buildDef(analysis, card.inputId), [analysis, card.inputId]);
  const { data, error } = useObjectSetTimeseries(
    {
      def: card.dateProperty ? inputDef : null,
      dateProperty: card.dateProperty,
      metric: card.metric,
      granularity: card.granularity,
    },
    useMercekParams().values,
  );
  if (error) return <Alert severity="error">{String(error)}</Alert>;
  if (!data) return <Skeleton variant="rounded" height="100%" />;
  return <SmartTimeseries points={data.points} height={200} />;
}
