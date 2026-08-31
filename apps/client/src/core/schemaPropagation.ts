/**
 * Client-side schema propagation.
 *
 * Rules (mirroring Harman's verified behavior):
 *  - filter, chart, table, setMath  → passthrough
 *  - expression addColumn           → append column
 *  - expression replaceColumn       → retype column in place
 *  - expression filter              → passthrough
 *  - expression aggregate           → REPLACE schema: group-bys + aggregates
 *  - histogram (pivoted)            → REPLACE schema: group column + aggregate
 *  - pivot (pivoted)                → REPLACE schema (columns depend on data,
 *                                     so only row dims + a marker are known)
 *  - enrich                         → append selected right-side columns
 *  - editColumns                    → apply drop/rename/cast/reorder
 *
 * The backend's QueryResponse.schema is authoritative; this module exists
 * so config forms can offer correct columns *immediately* while editing,
 * before any query round-trip.
 */

import type {
  AggregateSpec,
  BoardConfig,
  EditColumnsBoardConfig,
} from '../types/boards';
import type { ColumnSchema, ColumnType, TableSchema } from '../types/schema';

/** Result type of an aggregate output column. */
function aggregateResultType(
  spec: AggregateSpec,
  input: TableSchema,
): ColumnType {
  switch (spec.fn) {
    case 'count':
    case 'countDistinct':
      return 'integer';
    case 'min':
    case 'max': {
      // min/max preserve the source column's type
      const src = input.columns.find((c) => c.name === spec.column);
      return src?.type ?? 'double';
    }
    default:
      return 'double';
  }
}

function aggregateColumns(
  specs: AggregateSpec[],
  input: TableSchema,
): ColumnSchema[] {
  return specs.map((spec) => ({
    name: spec.alias,
    type: aggregateResultType(spec, input),
    nullable: false,
  }));
}

function applyEditColumns(
  input: TableSchema,
  board: EditColumnsBoardConfig,
): TableSchema {
  let columns = [...input.columns];
  for (const op of board.operations) {
    switch (op.op) {
      case 'drop':
        columns = columns.filter((c) => c.name !== op.column);
        break;
      case 'rename':
        columns = columns.map((c) =>
          c.name === op.column ? { ...c, name: op.newName } : c,
        );
        break;
      case 'cast':
        columns = columns.map((c) =>
          c.name === op.column ? { ...c, type: op.toType } : c,
        );
        break;
      case 'reorder': {
        const byName = new Map(columns.map((c) => [c.name, c]));
        const ordered = op.order
          .map((name) => byName.get(name))
          .filter((c): c is ColumnSchema => c !== undefined);
        const rest = columns.filter((c) => !op.order.includes(c.name));
        columns = [...ordered, ...rest];
        break;
      }
    }
  }
  return { columns };
}

/** Output schema of a single board given its input schema. */
export function propagateBoard(
  input: TableSchema,
  board: BoardConfig,
): TableSchema {
  switch (board.type) {
    case 'filter':
    case 'chart':
    case 'table':
    case 'setMath':
      return input;

    case 'expression':
      switch (board.mode) {
        case 'filter':
          return input;
        case 'addColumn':
          return {
            columns: [
              ...input.columns,
              { name: board.columnName, type: board.resultType, nullable: true },
            ],
          };
        case 'replaceColumn':
          return {
            columns: input.columns.map((c) =>
              c.name === board.column ? { ...c, type: board.resultType } : c,
            ),
          };
        case 'aggregate':
          return {
            columns: [
              ...board.groupBys.map((g) => ({
                name: g.alias,
                type: g.resultType,
                nullable: true,
              })),
              ...board.aggregates.map((a) => ({
                name: a.alias,
                type: a.resultType,
                nullable: false,
              })),
            ],
          };
      }
      break;

    case 'histogram': {
      if (!board.pivoted) return input;
      const groupCol = input.columns.find((c) => c.name === board.groupColumn);
      return {
        columns: [
          groupCol ?? { name: board.groupColumn, type: 'string', nullable: true },
          ...aggregateColumns([board.aggregate], input),
        ],
      };
    }

    case 'pivot': {
      if (!board.pivoted) return input;
      // Pivoted column names depend on the data (one column per distinct
      // value combination), so client-side we only know the row dimensions
      // and aggregate columns. The backend schema fills in the rest.
      const rowCols = board.rows
        .map((name) => input.columns.find((c) => c.name === name))
        .filter((c): c is ColumnSchema => c !== undefined);
      return { columns: [...rowCols, ...aggregateColumns(board.aggregates, input)] };
    }

    case 'enrich':
      return {
        columns: [
          ...input.columns,
          ...board.selectedColumns.map((c) => ({
            name: c.name,
            type: c.type,
            nullable: true,
          })),
        ],
      };

    case 'editColumns':
      return applyEditColumns(input, board);
  }
}

/**
 * Schema at each position of a path: result[i] is the INPUT schema of
 * boards[i] (i.e. the output of everything above it). result[boards.length]
 * is the path's final output schema.
 */
export function propagatePath(
  sourceSchema: TableSchema,
  boards: BoardConfig[],
): TableSchema[] {
  const schemas: TableSchema[] = [sourceSchema];
  let current = sourceSchema;
  for (const board of boards) {
    current = propagateBoard(current, board);
    schemas.push(current);
  }
  return schemas;
}
