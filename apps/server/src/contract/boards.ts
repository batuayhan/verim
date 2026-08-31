/**
 * Board configuration types — the core data model of the app.
 *
 * A path is an ordered list of BoardConfig values applied top-to-bottom;
 * each board consumes its upstream board's output. `BoardConfig` is a
 * discriminated union on `type`, mirroring Harman's board catalog:
 * filter, expression (4 modes), histogram, chart, pivot, table, enrich,
 * set math, edit columns.
 *
 * Schema effects per board type live in core/schemaPropagation.ts, and the
 * serialized form of this union IS the query payload sent to the backend
 * (see types/api.ts and docs/API_CONTRACT.md).
 */

import type { ColumnType } from './schema';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

export type AggregationFn =
  | 'count'
  | 'countDistinct'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'median'
  | 'stddev'
  | 'variance';

export interface AggregateSpec {
  /** Output column name, e.g. "total_revenue" */
  alias: string;
  fn: AggregationFn;
  /** Omitted for `count` (row count) */
  column?: string;
}

/**
 * A literal value, or a `$parameter` reference resolved at query time.
 * Parameter references keep the raw `$name` string so the UI can render
 * them as chips and the backend can substitute values.
 */
export type FilterValue =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'parameter'; name: string }
  // Göreli zaman: "şimdi − amount·unit" (çalışma anında hesaplanır) — "son N
  // dakika/saat/gün" filtreleri için; gte/lte ile zaman kolonlarında kullanılır
  | { kind: 'relative'; unit: 'minute' | 'hour' | 'day'; amount: number };

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'between'
  | 'in'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'matchesRegex'
  | 'isNull'
  | 'isNotNull';

export interface FilterCondition {
  id: string;
  column: string;
  operator: FilterOperator;
  /** between → [lo, hi]; in → n values; isNull/isNotNull → [] */
  values: FilterValue[];
  caseSensitive?: boolean;
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

export interface FilterBoardConfig {
  type: 'filter';
  id: string;
  /** KEEP rows matching, or REMOVE rows matching */
  action: 'keep' | 'remove';
  /** AND MATCHING (all conditions) vs OR MATCHING (any condition) */
  combinator: 'and' | 'or';
  conditions: FilterCondition[];
  removeDuplicateRows?: boolean;
}

/** Expression board — exactly four modes, as in Harman. */
export type ExpressionBoardConfig =
  | {
      type: 'expression';
      id: string;
      mode: 'addColumn';
      columnName: string;
      expression: string;
      /** Declared by the user; we don't parse expressions client-side */
      resultType: ColumnType;
    }
  | {
      type: 'expression';
      id: string;
      mode: 'replaceColumn';
      column: string;
      expression: string;
      resultType: ColumnType;
    }
  | {
      type: 'expression';
      id: string;
      mode: 'filter';
      /** Boolean expression; window functions disallowed */
      expression: string;
    }
  | {
      type: 'expression';
      id: string;
      mode: 'aggregate';
      groupBys: Array<{ alias: string; expression: string; resultType: ColumnType }>;
      aggregates: Array<{ alias: string; expression: string; resultType: ColumnType }>;
    };

/**
 * Histogram — a visual GROUP BY: one group column + one aggregate,
 * rendered as a bar chart. Selecting bars filters downstream boards.
 * `pivoted: true` = "Switch to pivoted data": the rest of the path
 * continues on the aggregated table instead of the raw rows.
 */
export interface HistogramBoardConfig {
  type: 'histogram';
  id: string;
  groupColumn: string;
  aggregate: AggregateSpec;
  sort: { by: 'value' | 'label'; direction: 'asc' | 'desc' };
  /** Bar labels selected by the user; filters downstream boards */
  selection?: string[];
  pivoted: boolean;
}

export type ChartType =
  | 'bar'
  | 'horizontalBar'
  | 'line'
  | 'scatter'
  | 'heatGrid'
  | 'pie';

export type Bucketing =
  | { kind: 'exact' }
  | { kind: 'numeric'; size: number }
  | { kind: 'date'; unit: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year' };

export interface SeriesConfig {
  id: string;
  aggregate: AggregateSpec;
  /** Optional segmentation column (colors the series by category) */
  segmentBy?: string;
}

/**
 * Chart board — display-only: aggregates for rendering but passes the
 * incoming rows through unchanged to downstream boards.
 */
export interface ChartBoardConfig {
  type: 'chart';
  id: string;
  chartType: ChartType;
  xAxis: { column: string; bucketing: Bucketing };
  series: SeriesConfig[];
  overlay?: { chartType: 'line' | 'bar'; series: SeriesConfig[] };
  format?: {
    xTitle?: string;
    yTitle?: string;
    showLegend: boolean;
    legendPosition: 'right' | 'bottom' | 'left' | 'top';
    /** Segmentli serilerde bar yerleşimi */
    segmentMode?: 'stacked' | 'grouped';
  };
}

export interface PivotBoardConfig {
  type: 'pivot';
  id: string;
  rows: string[];
  columns: string[];
  aggregates: AggregateSpec[];
  /** When true, downstream boards consume the pivoted table */
  pivoted: boolean;
}

/** Table board — a preview grid; pure passthrough. */
export interface TableBoardConfig {
  type: 'table';
  id: string;
  /** Display-only column subset; does not alter the schema downstream */
  visibleColumns?: string[];
}

/** Enrich — join another dataset and merge matching columns in. */
export interface EnrichBoardConfig {
  type: 'enrich';
  id: string;
  rightDatasetId: string;
  joinType: 'left' | 'inner';
  conditions: Array<{ leftColumn: string; rightColumn: string }>;
  /** Right-side columns merged into the working dataset (with their types) */
  selectedColumns: Array<{ name: string; type: ColumnType }>;
}

/** Set math — keep only / add / remove rows present in another dataset. */
export interface SetMathBoardConfig {
  type: 'setMath';
  id: string;
  operation: 'keepOnly' | 'add' | 'remove';
  otherDatasetId: string;
  keyColumns: Array<{ leftColumn: string; rightColumn: string }>;
}

export type ColumnOperation =
  | { op: 'drop'; column: string }
  | { op: 'rename'; column: string; newName: string }
  | { op: 'cast'; column: string; toType: ColumnType }
  | { op: 'reorder'; order: string[] };

export interface EditColumnsBoardConfig {
  type: 'editColumns';
  id: string;
  operations: ColumnOperation[];
}

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

export type BoardConfig =
  | FilterBoardConfig
  | ExpressionBoardConfig
  | HistogramBoardConfig
  | ChartBoardConfig
  | PivotBoardConfig
  | TableBoardConfig
  | EnrichBoardConfig
  | SetMathBoardConfig
  | EditColumnsBoardConfig;

export type BoardType = BoardConfig['type'];

/** Boards that only render — they never change rows or schema downstream. */
export const DISPLAY_ONLY_BOARDS: BoardType[] = ['chart', 'table'];
