/**
 * Zod schemas for runtime validation of the REST contract.
 *
 * Mirrors the TypeScript types in ./boards.ts and ./api.ts — if a request
 * passes these schemas it is a well-formed QueryRequest. Semantic errors
 * (unknown column, bad expression) are the engine's responsibility and are
 * reported as QueryError with a boardIndex.
 */

import { z } from 'zod';

export const columnTypeSchema = z.enum([
  'string',
  'integer',
  'double',
  'boolean',
  'date',
  'timestamp',
]);

const aggregationFnSchema = z.enum([
  'count',
  'countDistinct',
  'sum',
  'avg',
  'min',
  'max',
  'median',
  'stddev',
  'variance',
]);

const aggregateSpecSchema = z.object({
  alias: z.string().min(1),
  fn: aggregationFnSchema,
  column: z.string().optional(),
});

const filterValueSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('literal'),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }),
  z.object({ kind: z.literal('parameter'), name: z.string().min(1) }),
  z.object({
    kind: z.literal('relative'),
    unit: z.enum(['minute', 'hour', 'day']),
    amount: z.number().int().positive(),
  }),
]);

const filterConditionSchema = z.object({
  id: z.string(),
  column: z.string().min(1),
  operator: z.enum([
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'between',
    'in',
    'contains',
    'startsWith',
    'endsWith',
    'matchesRegex',
    'isNull',
    'isNotNull',
  ]),
  values: z.array(filterValueSchema),
  caseSensitive: z.boolean().optional(),
});

const filterBoardSchema = z.object({
  type: z.literal('filter'),
  id: z.string(),
  action: z.enum(['keep', 'remove']),
  combinator: z.enum(['and', 'or']),
  conditions: z.array(filterConditionSchema),
  removeDuplicateRows: z.boolean().optional(),
});

const expressionBoardSchema = z.union([
  z.object({
    type: z.literal('expression'),
    id: z.string(),
    mode: z.literal('addColumn'),
    columnName: z.string().min(1),
    expression: z.string().min(1),
    resultType: columnTypeSchema,
  }),
  z.object({
    type: z.literal('expression'),
    id: z.string(),
    mode: z.literal('replaceColumn'),
    column: z.string().min(1),
    expression: z.string().min(1),
    resultType: columnTypeSchema,
  }),
  z.object({
    type: z.literal('expression'),
    id: z.string(),
    mode: z.literal('filter'),
    expression: z.string().min(1),
  }),
  z.object({
    type: z.literal('expression'),
    id: z.string(),
    mode: z.literal('aggregate'),
    groupBys: z.array(
      z.object({
        alias: z.string().min(1),
        expression: z.string().min(1),
        resultType: columnTypeSchema,
      }),
    ),
    aggregates: z
      .array(
        z.object({
          alias: z.string().min(1),
          expression: z.string().min(1),
          resultType: columnTypeSchema,
        }),
      )
      .min(1),
  }),
]);

const histogramBoardSchema = z.object({
  type: z.literal('histogram'),
  id: z.string(),
  groupColumn: z.string().min(1),
  aggregate: aggregateSpecSchema,
  sort: z.object({
    by: z.enum(['value', 'label']),
    direction: z.enum(['asc', 'desc']),
  }),
  selection: z.array(z.string()).optional(),
  pivoted: z.boolean(),
});

const bucketingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exact') }),
  z.object({ kind: z.literal('numeric'), size: z.number().positive() }),
  z.object({
    kind: z.literal('date'),
    unit: z.enum(['hour', 'day', 'week', 'month', 'quarter', 'year']),
  }),
]);

const seriesConfigSchema = z.object({
  id: z.string(),
  aggregate: aggregateSpecSchema,
  segmentBy: z.string().optional(),
});

const chartBoardSchema = z.object({
  type: z.literal('chart'),
  id: z.string(),
  chartType: z.enum(['bar', 'horizontalBar', 'line', 'scatter', 'heatGrid', 'pie']),
  xAxis: z.object({ column: z.string().min(1), bucketing: bucketingSchema }),
  series: z.array(seriesConfigSchema).min(1),
  overlay: z
    .object({
      chartType: z.enum(['line', 'bar']),
      series: z.array(seriesConfigSchema).min(1),
    })
    .optional(),
  format: z
    .object({
      xTitle: z.string().optional(),
      yTitle: z.string().optional(),
      showLegend: z.boolean(),
      legendPosition: z.enum(['right', 'bottom', 'left', 'top']),
      segmentMode: z.enum(['stacked', 'grouped']).optional(),
    })
    .optional(),
});

const pivotBoardSchema = z.object({
  type: z.literal('pivot'),
  id: z.string(),
  rows: z.array(z.string()).min(1),
  columns: z.array(z.string()),
  aggregates: z.array(aggregateSpecSchema).min(1),
  pivoted: z.boolean(),
});

const tableBoardSchema = z.object({
  type: z.literal('table'),
  id: z.string(),
  visibleColumns: z.array(z.string()).optional(),
});

const enrichBoardSchema = z.object({
  type: z.literal('enrich'),
  id: z.string(),
  rightDatasetId: z.string().min(1),
  joinType: z.enum(['left', 'inner']),
  conditions: z
    .array(z.object({ leftColumn: z.string(), rightColumn: z.string() }))
    .min(1),
  selectedColumns: z
    .array(z.object({ name: z.string(), type: columnTypeSchema }))
    .min(1),
});

const setMathBoardSchema = z.object({
  type: z.literal('setMath'),
  id: z.string(),
  operation: z.enum(['keepOnly', 'add', 'remove']),
  otherDatasetId: z.string().min(1),
  keyColumns: z
    .array(z.object({ leftColumn: z.string(), rightColumn: z.string() }))
    .min(1),
});

const columnOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('drop'), column: z.string() }),
  z.object({ op: z.literal('rename'), column: z.string(), newName: z.string() }),
  z.object({ op: z.literal('cast'), column: z.string(), toType: columnTypeSchema }),
  z.object({ op: z.literal('reorder'), order: z.array(z.string()) }),
]);

const editColumnsBoardSchema = z.object({
  type: z.literal('editColumns'),
  id: z.string(),
  operations: z.array(columnOperationSchema),
});

export const boardConfigSchema = z.union([
  filterBoardSchema,
  expressionBoardSchema,
  histogramBoardSchema,
  chartBoardSchema,
  pivotBoardSchema,
  tableBoardSchema,
  enrichBoardSchema,
  setMathBoardSchema,
  editColumnsBoardSchema,
]);

export const queryRequestSchema = z.object({
  datasetId: z.string().min(1),
  boards: z.array(boardConfigSchema),
  targetBoardIndex: z.number().int().nonnegative().optional(),
  parameters: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  limit: z.number().int().positive().max(10_000).optional(),
});
