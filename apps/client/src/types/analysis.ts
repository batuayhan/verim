/**
 * Analysis / Path / Parameter — the document model.
 *
 * Analysis → Paths → Boards. Each path starts from a dataset (or forks
 * from another path's result) and holds an ordered board list. This whole
 * tree is what Redux stores, what undo/redo operates on, and what gets
 * persisted/shared.
 */

import type { BoardConfig } from './boards';
import type { ColumnType } from './schema';

export type PathSource =
  | { kind: 'dataset'; datasetId: string }
  | { kind: 'pathResult'; pathId: string };

export interface AnalysisPath {
  id: string;
  name: string;
  source: PathSource;
  boards: BoardConfig[];
}

export interface Parameter {
  id: string;
  /** Referenced as `$name` in filters and expressions */
  name: string;
  type: ColumnType;
  value: string | number | boolean | null;
  suggestedValues?: Array<string | number>;
}

export interface Analysis {
  id: string;
  name: string;
  paths: AnalysisPath[];
  parameters: Parameter[];
  dashboard: Dashboard;
}

// ---------------------------------------------------------------------------
// Dashboard — a projection over the analysis, not a standalone artifact.
// Widgets reference boards by id; provenance stays intact.
// ---------------------------------------------------------------------------

export interface DashboardWidget {
  id: string;
  kind: 'board' | 'text';
  /** For kind: 'board' — which path/board this widget projects */
  pathId?: string;
  boardId?: string;
  /** For kind: 'text' */
  text?: string;
  title?: string;
}

export interface WidgetLayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardTab {
  id: string;
  name: string;
  widgets: DashboardWidget[];
  /** Sürükle-bırak grid yerleşimi (widget id → hücre) */
  layout?: Record<string, WidgetLayoutRect>;
}

export interface Dashboard {
  title: string;
  tabs: DashboardTab[];
}
