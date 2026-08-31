import { Inject, Injectable } from '@nestjs/common';
import type { QueryRequest, QueryResponse } from '../../contract/api';
import type {
  AggregateSpec,
  BoardConfig,
  EnrichBoardConfig,
  FilterBoardConfig,
  FilterCondition,
  HistogramBoardConfig,
  PivotBoardConfig,
  SetMathBoardConfig,
} from '../../contract/boards';
import type { ColumnSchema, ColumnType, TableSchema } from '../../contract/schema';
import { ApiError } from '../../common/api-error';
import {
  DATASET_PROVIDER,
  type DatasetProvider,
  type Row,
} from '../../datasets/dataset-provider';
import type { QueryEngine } from '../query-engine';
import {
  evaluate,
  evaluateAggregate,
  reduceAggregate,
  type Params,
} from './expression/evaluator';
import { ExpressionError, parseExpression } from './expression/parser';
import { matchCondition } from './condition-matcher';

const DEFAULT_LIMIT = 1000;
const MAX_PIVOT_COLUMNS = 100;

export interface Frame {
  rows: Row[];
  schema: TableSchema;
  truncated: boolean;
}

const AGG_FN_TO_EXPR: Record<AggregateSpec['fn'], string> = {
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

function aggregateResultType(spec: AggregateSpec, schema: TableSchema): ColumnType {
  if (spec.fn === 'count' || spec.fn === 'countDistinct') return 'integer';
  if (spec.fn === 'min' || spec.fn === 'max') {
    return schema.columns.find((c) => c.name === spec.column)?.type ?? 'double';
  }
  return 'double';
}

function runAggregates(specs: AggregateSpec[], rows: Row[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const spec of specs) {
    const values =
      spec.fn === 'count' && !spec.column
        ? rows.map(() => 1)
        : rows.map((r) => r[spec.column!]);
    out[spec.alias] = reduceAggregate(AGG_FN_TO_EXPR[spec.fn], values);
  }
  return out;
}

function groupBy(rows: Row[], keyFn: (row: Row) => string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

@Injectable()
export class InMemoryQueryEngine implements QueryEngine {
  constructor(
    @Inject(DATASET_PROVIDER) private readonly datasets: DatasetProvider,
  ) {}

  async execute(request: QueryRequest): Promise<QueryResponse> {
    const started = Date.now();
    const dataset = await this.datasets.get(request.datasetId);
    if (!dataset) throw ApiError.datasetNotFound(request.datasetId);

    const target =
      request.targetBoardIndex ?? Math.max(request.boards.length - 1, -1);
    if (target >= request.boards.length) {
      throw ApiError.invalidBoard(
        `targetBoardIndex ${target} out of range (${request.boards.length} boards)`,
      );
    }

    const frame: Frame = {
      rows: dataset.rows,
      schema: dataset.schema,
      // Provider tarama tavanına takıldıysa (mim: MIP_SCAN_LIMIT) bunu
      // DÜRÜSTÇE taşı — kısmi veri üzerinde yapılan her hesap 'truncated'
      // bayrağıyla döner (pushdown yolu zaten böyle davranıyordu).
      truncated: dataset.rows.length < dataset.summary.rowCount,
    };

    return this.runFromFrame(
      frame,
      request.boards,
      request.parameters,
      target,
      request.limit ?? DEFAULT_LIMIT,
      dataset.summary.version,
      started,
    );
  }

  /**
   * Board zincirini verilen bir başlangıç Frame'i üzerinde çalıştırır.
   * SQL pushdown motoru, filtre önekini SQL'e itip AZALTILMIŞ satır kümesini
   * bu metoda geçirir — kalan board'lar (expression/enrich/setMath vb.) yine
   * bu doğrulanmış in-memory mantıkla işlenir (tek doğruluk kaynağı).
   *
   * @param boardOffset pushdown ile atlanan board sayısı (index/hata mesajı için)
   */
  async runFromFrame(
    initial: Frame,
    boards: BoardConfig[],
    params: Params,
    target: number,
    limit: number,
    datasetVersion: string,
    started = Date.now(),
    boardOffset = 0,
  ): Promise<QueryResponse> {
    let frame = initial;
    for (let i = boardOffset; i <= target; i++) {
      const board = boards[i];
      try {
        frame = await this.applyBoard(board, frame, params, i === target);
      } catch (error) {
        if (error instanceof ExpressionError) {
          const missing = /^__PARAM_MISSING__(.+)$/.exec(error.message);
          if (missing) throw ApiError.parameterMissing(missing[1], i);
          throw ApiError.expression(error.message, i);
        }
        if (error instanceof ApiError) throw error;
        throw ApiError.invalidBoard(
          error instanceof Error ? error.message : String(error),
          i,
        );
      }
    }

    const totalRows = frame.rows.length;
    const truncated = frame.truncated || totalRows > limit;

    return {
      schema: frame.schema,
      rows: frame.rows.slice(0, limit),
      totalRows,
      truncated,
      executionTimeMs: Date.now() - started,
      datasetVersion,
    };
  }

  private async applyBoard(
    board: BoardConfig,
    frame: Frame,
    params: Params,
    isTarget: boolean,
  ): Promise<Frame> {
    switch (board.type) {
      case 'chart':
      case 'table':
        return frame; // display-only: never transforms rows

      case 'filter':
        return this.applyFilter(board, frame, params);

      case 'expression':
        return this.applyExpression(board, frame, params);

      case 'histogram':
        return this.applyHistogram(board, frame, isTarget);

      case 'pivot':
        return this.applyPivot(board, frame, isTarget);

      case 'enrich':
        return this.applyEnrich(board, frame);

      case 'setMath':
        return this.applySetMath(board, frame);

      case 'editColumns':
        return this.applyEditColumns(board, frame);
    }
  }

  // --- Filter -------------------------------------------------------------

  private applyFilter(
    board: FilterBoardConfig,
    frame: Frame,
    params: Params,
  ): Frame {
    const matches = (row: Row): boolean => {
      const results = board.conditions.map((c) =>
        matchCondition(c, row, params),
      );
      if (results.length === 0) return true;
      return board.combinator === 'and'
        ? results.every(Boolean)
        : results.some(Boolean);
    };

    let rows = frame.rows.filter((row) =>
      board.action === 'keep' ? matches(row) : !matches(row),
    );

    if (board.removeDuplicateRows) {
      const seen = new Set<string>();
      rows = rows.filter((row) => {
        const key = JSON.stringify(frame.schema.columns.map((c) => row[c.name]));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    return { ...frame, rows };
  }

  // --- Expression ----------------------------------------------------------

  private applyExpression(
    board: Extract<BoardConfig, { type: 'expression' }>,
    frame: Frame,
    params: Params,
  ): Frame {
    switch (board.mode) {
      case 'addColumn': {
        const ast = parseExpression(board.expression);
        const rows = frame.rows.map((row) => ({
          ...row,
          [board.columnName]: evaluate(ast, row, params),
        }));
        return {
          ...frame,
          rows,
          schema: {
            columns: [
              ...frame.schema.columns,
              { name: board.columnName, type: board.resultType, nullable: true },
            ],
          },
        };
      }
      case 'replaceColumn': {
        const ast = parseExpression(board.expression);
        const rows = frame.rows.map((row) => ({
          ...row,
          [board.column]: evaluate(ast, row, params),
        }));
        return {
          ...frame,
          rows,
          schema: {
            columns: frame.schema.columns.map((c) =>
              c.name === board.column ? { ...c, type: board.resultType } : c,
            ),
          },
        };
      }
      case 'filter': {
        const ast = parseExpression(board.expression);
        const rows = frame.rows.filter((row) => {
          const result = evaluate(ast, row, params);
          return result === true || result === 1;
        });
        return { ...frame, rows };
      }
      case 'aggregate': {
        const groupAsts = board.groupBys.map((g) => ({
          alias: g.alias,
          ast: parseExpression(g.expression),
        }));
        const aggAsts = board.aggregates.map((a) => ({
          alias: a.alias,
          ast: parseExpression(a.expression),
        }));

        const groups = groupBy(frame.rows, (row) =>
          JSON.stringify(groupAsts.map((g) => evaluate(g.ast, row, params))),
        );

        const rows: Row[] = [];
        for (const groupRows of groups.values()) {
          const out: Row = {};
          for (const g of groupAsts) {
            out[g.alias] = evaluate(g.ast, groupRows[0], params);
          }
          for (const a of aggAsts) {
            out[a.alias] = evaluateAggregate(a.ast, groupRows, params);
          }
          rows.push(out);
        }

        return {
          ...frame,
          rows,
          schema: {
            columns: [
              ...board.groupBys.map(
                (g): ColumnSchema => ({ name: g.alias, type: g.resultType, nullable: true }),
              ),
              ...board.aggregates.map(
                (a): ColumnSchema => ({ name: a.alias, type: a.resultType, nullable: false }),
              ),
            ],
          },
        };
      }
    }
  }

  // --- Histogram -----------------------------------------------------------

  private applyHistogram(
    board: HistogramBoardConfig,
    frame: Frame,
    isTarget: boolean,
  ): Frame {
    if (!frame.schema.columns.some((c) => c.name === board.groupColumn)) {
      throw ApiError.invalidBoard(`Unknown column: ${board.groupColumn}`);
    }

    // Bar selection filters everything downstream (and the aggregation itself
    // when the histogram is pivoted or targeted).
    const selected =
      board.selection && board.selection.length > 0
        ? frame.rows.filter((row) =>
            board.selection!.includes(String(row[board.groupColumn])),
          )
        : frame.rows;

    if (!isTarget && !board.pivoted) {
      // Display-only histogram: pass (possibly selection-filtered) rows through.
      return { ...frame, rows: selected };
    }

    const groups = groupBy(selected, (row) => String(row[board.groupColumn]));
    let rows: Row[] = [];
    for (const [label, groupRows] of groups) {
      rows.push({
        [board.groupColumn]: label,
        ...runAggregates([board.aggregate], groupRows),
      });
    }

    const direction = board.sort.direction === 'asc' ? 1 : -1;
    const sortKey = board.sort.by === 'label' ? board.groupColumn : board.aggregate.alias;
    rows = rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
      return String(av).localeCompare(String(bv)) * direction;
    });

    const groupCol = frame.schema.columns.find((c) => c.name === board.groupColumn)!;
    return {
      ...frame,
      rows,
      schema: {
        columns: [
          groupCol,
          {
            name: board.aggregate.alias,
            type: aggregateResultType(board.aggregate, frame.schema),
            nullable: false,
          },
        ],
      },
    };
  }

  // --- Pivot ----------------------------------------------------------------

  private applyPivot(
    board: PivotBoardConfig,
    frame: Frame,
    isTarget: boolean,
  ): Frame {
    if (!isTarget && !board.pivoted) return frame;

    for (const col of [...board.rows, ...board.columns]) {
      if (!frame.schema.columns.some((c) => c.name === col)) {
        throw ApiError.invalidBoard(`Unknown column: ${col}`);
      }
    }

    const rowGroups = groupBy(frame.rows, (row) =>
      JSON.stringify(board.rows.map((c) => row[c])),
    );

    // Distinct column-dimension combos define the pivoted column set.
    const comboLabels = new Map<string, string>();
    if (board.columns.length > 0) {
      for (const row of frame.rows) {
        const key = JSON.stringify(board.columns.map((c) => row[c]));
        if (!comboLabels.has(key)) {
          comboLabels.set(key, board.columns.map((c) => String(row[c])).join(' / '));
        }
        if (comboLabels.size > MAX_PIVOT_COLUMNS) break;
      }
    }

    const truncatedCols =
      comboLabels.size > MAX_PIVOT_COLUMNS ||
      comboLabels.size * board.aggregates.length > MAX_PIVOT_COLUMNS;
    const combos = [...comboLabels.entries()].slice(0, MAX_PIVOT_COLUMNS);

    const rows: Row[] = [];
    for (const groupRows of rowGroups.values()) {
      const out: Row = {};
      for (const dim of board.rows) out[dim] = groupRows[0][dim];

      if (board.columns.length === 0) {
        Object.assign(out, runAggregates(board.aggregates, groupRows));
      } else {
        for (const [comboKey, comboLabel] of combos) {
          const cell = groupRows.filter(
            (r) => JSON.stringify(board.columns.map((c) => r[c])) === comboKey,
          );
          const aggs = runAggregates(board.aggregates, cell);
          for (const spec of board.aggregates) {
            const name =
              board.aggregates.length > 1
                ? `${comboLabel} · ${spec.alias}`
                : comboLabel;
            out[name] = cell.length === 0 ? null : aggs[spec.alias];
          }
        }
      }
      rows.push(out);
    }

    const rowDimCols = board.rows.map(
      (name) => frame.schema.columns.find((c) => c.name === name)!,
    );
    const valueCols: ColumnSchema[] =
      board.columns.length === 0
        ? board.aggregates.map((spec) => ({
            name: spec.alias,
            type: aggregateResultType(spec, frame.schema),
            nullable: false,
          }))
        : combos.flatMap(([, comboLabel]) =>
            board.aggregates.map((spec) => ({
              name:
                board.aggregates.length > 1
                  ? `${comboLabel} · ${spec.alias}`
                  : comboLabel,
              type: aggregateResultType(spec, frame.schema),
              nullable: true,
            })),
          );

    return {
      rows,
      schema: { columns: [...rowDimCols, ...valueCols] },
      truncated: frame.truncated || truncatedCols,
    };
  }

  // --- Enrich (join) ---------------------------------------------------------

  private async applyEnrich(
    board: EnrichBoardConfig,
    frame: Frame,
  ): Promise<Frame> {
    const right = await this.datasets.get(board.rightDatasetId);
    if (!right) throw ApiError.datasetNotFound(board.rightDatasetId);
    // SAĞ taraf tarama tavanına takıldıysa join eksik anahtarlarla eşleşir —
    // bu kısmilik de dürüstçe truncated'a yazılır (fail-closed'ın arka
    // kapısı kapanır; sol/kaynak bayrağını execute() taşıyor).
    const rightTruncated = right.rows.length < right.summary.rowCount;

    const rightKey = (row: Row): string =>
      JSON.stringify(board.conditions.map((c) => row[c.rightColumn]));
    const leftKey = (row: Row): string =>
      JSON.stringify(board.conditions.map((c) => row[c.leftColumn]));

    const index = groupBy(right.rows, rightKey);
    const selected = board.selectedColumns.map((c) => c.name);

    const rows: Row[] = [];
    for (const row of frame.rows) {
      const matches = index.get(leftKey(row));
      if (matches && matches.length > 0) {
        // First match wins — merge selected right columns in.
        const merged = { ...row };
        for (const name of selected) merged[name] = matches[0][name];
        rows.push(merged);
      } else if (board.joinType === 'left') {
        const merged = { ...row };
        for (const name of selected) merged[name] = null;
        rows.push(merged);
      }
    }

    return {
      ...frame,
      rows,
      truncated: frame.truncated || rightTruncated,
      schema: {
        columns: [
          ...frame.schema.columns,
          ...board.selectedColumns.map(
            (c): ColumnSchema => ({ name: c.name, type: c.type, nullable: true }),
          ),
        ],
      },
    };
  }

  // --- Set math ----------------------------------------------------------------

  private async applySetMath(
    board: SetMathBoardConfig,
    frame: Frame,
  ): Promise<Frame> {
    const other = await this.datasets.get(board.otherDatasetId);
    if (!other) throw ApiError.datasetNotFound(board.otherDatasetId);
    // Karşı küme kırpıksa keepOnly/remove/add eksik anahtarlarla çalışır —
    // kısmilik dürüstçe truncated'a yazılır (enrich ile aynı gerekçe).
    const otherTruncated = other.rows.length < other.summary.rowCount;

    const otherKeys = new Set(
      other.rows.map((row) =>
        JSON.stringify(board.keyColumns.map((k) => row[k.rightColumn])),
      ),
    );
    const key = (row: Row): string =>
      JSON.stringify(board.keyColumns.map((k) => row[k.leftColumn]));

    const truncated = frame.truncated || otherTruncated;
    switch (board.operation) {
      case 'keepOnly':
        return { ...frame, truncated, rows: frame.rows.filter((r) => otherKeys.has(key(r))) };
      case 'remove':
        return { ...frame, truncated, rows: frame.rows.filter((r) => !otherKeys.has(key(r))) };
      case 'add': {
        // Append other-dataset rows projected onto the current schema
        // (matching column names; everything else null).
        const appended = other.rows.map((row) => {
          const out: Row = {};
          for (const col of frame.schema.columns) {
            out[col.name] = col.name in row ? row[col.name] : null;
          }
          return out;
        });
        return { ...frame, truncated, rows: [...frame.rows, ...appended] };
      }
    }
  }

  // --- Edit columns ---------------------------------------------------------

  private applyEditColumns(
    board: Extract<BoardConfig, { type: 'editColumns' }>,
    frame: Frame,
  ): Frame {
    let columns = [...frame.schema.columns];
    let rows = frame.rows;

    for (const op of board.operations) {
      switch (op.op) {
        case 'drop':
          columns = columns.filter((c) => c.name !== op.column);
          rows = rows.map((row) => {
            const { [op.column]: _dropped, ...rest } = row;
            return rest;
          });
          break;
        case 'rename':
          columns = columns.map((c) =>
            c.name === op.column ? { ...c, name: op.newName } : c,
          );
          rows = rows.map((row) => {
            const { [op.column]: value, ...rest } = row;
            return { ...rest, [op.newName]: value };
          });
          break;
        case 'cast':
          columns = columns.map((c) =>
            c.name === op.column ? { ...c, type: op.toType } : c,
          );
          rows = rows.map((row) => ({
            ...row,
            [op.column]: castValue(row[op.column], op.toType),
          }));
          break;
        case 'reorder': {
          const byName = new Map(columns.map((c) => [c.name, c]));
          const ordered = op.order
            .map((n) => byName.get(n))
            .filter((c): c is ColumnSchema => c !== undefined);
          const rest = columns.filter((c) => !op.order.includes(c.name));
          columns = [...ordered, ...rest];
          break;
        }
      }
    }

    return { ...frame, rows, schema: { columns } };
  }
}

function castValue(value: unknown, toType: ColumnType): unknown {
  if (value === null || value === undefined) return null;
  switch (toType) {
    case 'string': return String(value);
    case 'integer': {
      const n = Math.trunc(Number(value));
      return Number.isNaN(n) ? null : n;
    }
    case 'double': {
      const n = Number(value);
      return Number.isNaN(n) ? null : n;
    }
    case 'boolean': return value === true || value === 'true' || value === 1;
    case 'date': {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    case 'timestamp': {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
  }
}
