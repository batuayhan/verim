/**
 * Chart board → virtual aggregate board translation (API_CONTRACT.md §5).
 *
 * The chart board is display-only in the executed chain; its data need is
 * expressed as a temporary expression/aggregate board appended to the
 * upstream chain and targeted directly. Bucketing and segmentation are
 * compiled into group-by expressions, so the service never knows about
 * charts — it just runs the aggregate.
 */

import type {
  AggregateSpec,
  BoardConfig,
  Bucketing,
  ChartBoardConfig,
} from '../types/boards';
import type { TableSchema } from '../types/schema';
import { isBoardConfigured } from './boardDefaults';

const FN_TO_EXPR: Record<AggregateSpec['fn'], string> = {
  count: 'count',
  countDistinct: 'count_distinct',
  sum: 'sum',
  avg: 'avg',
  min: 'min',
  max: 'max',
  median: 'median',
  stddev: 'stddev',
  variance: 'variance',
};

function ref(column: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(column) ? column : `"${column}"`;
}

function aggregateExpression(spec: AggregateSpec): string {
  if (spec.fn === 'count' && !spec.column) return 'count()';
  return `${FN_TO_EXPR[spec.fn]}(${ref(spec.column!)})`;
}

/** Bucketing'i mini expression diline derler. */
function bucketExpression(column: string, bucketing: Bucketing): string {
  const c = ref(column);
  switch (bucketing.kind) {
    case 'exact':
      return c;
    case 'numeric':
      return `floor(${c} / ${bucketing.size}) * ${bucketing.size}`;
    case 'date':
      switch (bucketing.unit) {
        case 'year':
          return `year(${c})`;
        case 'month':
          return `concat(year(${c}), '-', if(month(${c}) < 10, '0', ''), month(${c}))`;
        case 'day':
          return (
            `concat(year(${c}), '-', if(month(${c}) < 10, '0', ''), month(${c}),` +
            ` '-', if(day(${c}) < 10, '0', ''), day(${c}))`
          );
        case 'hour':
          return `hour(${c})`;
        case 'week':
        case 'quarter':
          // yakında: hafta/çeyrek bucket'ları — şimdilik ay hassasiyeti
          return `concat(year(${c}), '-', if(month(${c}) < 10, '0', ''), month(${c}))`;
      }
  }
}

export interface VizQueryPlan {
  boards: BoardConfig[];
  targetBoardIndex: number;
  xKey: string;
  /** Segmentsiz: seri alias'ları. Segmentli: null — anahtarlar veriden çıkar. */
  seriesKeys: string[];
  segmented: boolean;
  segmentKey?: string;
  valueKey?: string;
}

/** Returns null while the chart is not yet configured enough to query. */
export function buildVizQueryPlan(
  upstream: BoardConfig[],
  chart: ChartBoardConfig,
  inputSchema: TableSchema,
): VizQueryPlan | null {
  if (!chart.xAxis.column || chart.series.length === 0) return null;
  const xCol = inputSchema.columns.find((c) => c.name === chart.xAxis.column);
  if (!xCol) return null;
  if (chart.series.some((s) => s.aggregate.fn !== 'count' && !s.aggregate.column)) {
    return null;
  }

  const configuredUpstream = upstream.filter(isBoardConfigured);
  const xExpr = bucketExpression(chart.xAxis.column, chart.xAxis.bucketing);
  const xKey = chart.xAxis.column;
  const segmentBy = chart.series[0]?.segmentBy;

  if (segmentBy) {
    // Segmentli mod: tek seri + segment kolonu → iki group-by; client
    // sonucu segment değerlerine göre geniş formata pivotlar.
    const virtual: BoardConfig = {
      type: 'expression',
      id: `${chart.id}__viz`,
      mode: 'aggregate',
      groupBys: [
        { alias: xKey, expression: xExpr, resultType: xCol.type },
        { alias: '__segment', expression: ref(segmentBy), resultType: 'string' },
      ],
      aggregates: [
        {
          alias: '__value',
          expression: aggregateExpression(chart.series[0].aggregate),
          resultType: 'double',
        },
      ],
    };
    return {
      boards: [...configuredUpstream, virtual],
      targetBoardIndex: configuredUpstream.length,
      xKey,
      seriesKeys: [],
      segmented: true,
      segmentKey: '__segment',
      valueKey: '__value',
    };
  }

  const virtual: BoardConfig = {
    type: 'expression',
    id: `${chart.id}__viz`,
    mode: 'aggregate',
    groupBys: [{ alias: xKey, expression: xExpr, resultType: xCol.type }],
    aggregates: chart.series.map((s) => ({
      alias: s.aggregate.alias,
      expression: aggregateExpression(s.aggregate),
      resultType: 'double',
    })),
  };

  return {
    boards: [...configuredUpstream, virtual],
    targetBoardIndex: configuredUpstream.length,
    xKey,
    seriesKeys: chart.series.map((s) => s.aggregate.alias),
    segmented: false,
  };
}

/**
 * Segmentli sorgu sonucunu (uzun format: x, __segment, __value) Recharts'ın
 * beklediği geniş formata çevirir. En büyük toplama sahip ilk 8 segment
 * kalır, gerisi "Diğer"e katlanır (sabit slot kuralı).
 */
export function pivotSegmentedRows(
  rows: Array<Record<string, unknown>>,
  xKey: string,
): { data: Array<Record<string, unknown>>; segmentKeys: string[] } {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const seg = String(row.__segment ?? '(boş)');
    totals.set(seg, (totals.get(seg) ?? 0) + Number(row.__value ?? 0));
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const kept = ranked.slice(0, 8).map(([k]) => k);
  const keptSet = new Set(kept);
  const hasOther = ranked.length > 8;

  const byX = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const x = String(row[xKey]);
    const seg = String(row.__segment ?? '(boş)');
    const key = keptSet.has(seg) ? seg : 'Diğer';
    const bucket = byX.get(x) ?? { [xKey]: row[xKey] };
    bucket[key] = Number(bucket[key] ?? 0) + Number(row.__value ?? 0);
    byX.set(x, bucket);
  }

  return {
    data: [...byX.values()],
    segmentKeys: hasOther ? [...kept, 'Diğer'] : kept,
  };
}
