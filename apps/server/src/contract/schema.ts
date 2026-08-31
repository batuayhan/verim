/**
 * Column & table schema types.
 *
 * Schema flows board-to-board down a path: every board receives its
 * upstream board's output schema and produces its own. Config forms are
 * always driven by the *input* schema of the board being edited.
 */

export type ColumnType =
  | 'string'
  | 'integer'
  | 'double'
  | 'boolean'
  | 'date'
  | 'timestamp';

export interface ColumnSchema {
  name: string;
  type: ColumnType;
  nullable: boolean;
}

export interface TableSchema {
  columns: ColumnSchema[];
}

export const NUMERIC_TYPES: ColumnType[] = ['integer', 'double'];
export const TEMPORAL_TYPES: ColumnType[] = ['date', 'timestamp'];

export function isNumeric(col: ColumnSchema): boolean {
  return NUMERIC_TYPES.includes(col.type);
}

export function isTemporal(col: ColumnSchema): boolean {
  return TEMPORAL_TYPES.includes(col.type);
}

export function findColumn(
  schema: TableSchema,
  name: string,
): ColumnSchema | undefined {
  return schema.columns.find((c) => c.name === name);
}
