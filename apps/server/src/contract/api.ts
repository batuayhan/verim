/**
 * REST contract with the query service.
 *
 * The frontend never compiles queries; it serializes the board chain and
 * parameters, and the service returns the computed result WITH its schema.
 * The returned schema is authoritative — the client-side propagation in
 * core/schemaPropagation.ts is only an optimistic mirror used to drive
 * config forms before a query round-trips.
 *
 * Human-readable version of this contract: docs/API_CONTRACT.md
 */

import type { BoardConfig } from './boards';
import type { TableSchema } from './schema';

// GET /datasets
export interface DatasetSummary {
  id: string;
  label: string;
  rowCount: number;
  lastUpdated: string; // ISO 8601
  /** Opaque version token; changes whenever the data changes */
  version: string;
}

export interface ListDatasetsResponse {
  datasets: DatasetSummary[];
}

// GET /datasets/:id/schema
export interface DatasetSchemaResponse {
  datasetId: string;
  version: string;
  schema: TableSchema;
  rowCount: number;
}

// POST /query
export interface QueryRequest {
  datasetId: string;
  /**
   * Boards applied in order. The service executes the chain up to and
   * including `targetBoardIndex` and returns that board's output.
   * Display-only boards (chart/table) upstream of the target are skipped
   * by the executor — they don't transform rows.
   */
  boards: BoardConfig[];
  /** Index into `boards` whose output is requested; defaults to the last */
  targetBoardIndex?: number;
  /** Resolved parameter values, keyed by parameter name (without `$`) */
  parameters: Record<string, string | number | boolean | null>;
  /** Row cap for previews; service also enforces its own hard cap */
  limit?: number;
}

export interface QueryResponse {
  /** Authoritative output schema of the target board */
  schema: TableSchema;
  rows: Array<Record<string, unknown>>;
  /** Total rows the result would have without `limit` */
  totalRows: number;
  /** True when rows were cut off by limit or service caps */
  truncated: boolean;
  executionTimeMs: number;
  /** Echo of the dataset version the query ran against — cache key input */
  datasetVersion: string;
}

// GET /analyses — kayıtlı analiz listesi
export interface AnalysisSummary {
  id: string;
  name: string;
  updatedAt: string; // ISO 8601
  pathCount: number;
}

export interface ListAnalysesResponse {
  analyses: AnalysisSummary[];
}

// PUT /analyses/:id — dokümanın tamamı upsert edilir (server için opak blob)
export interface SaveAnalysisResponse {
  id: string;
  updatedAt: string;
}

// POST /query/materialize — path sonucunu yeni dataset olarak kaydet
export interface MaterializeRequest {
  label: string;
  datasetId: string;
  boards: BoardConfig[];
  parameters: Record<string, string | number | boolean | null>;
}

export interface MaterializeResponse {
  dataset: DatasetSummary;
}

// POST /query/live — board zincirini CANLI dataset olarak kaydet.
// Materialize'ın kardeşi: satırlar değil TARİF saklanır; dataset her
// okunuşta güncel veriden yeniden hesaplanır (kullanıcı katında VIEW).
// Tanımlar değişmezdir: güncelleme ucu yok — sil + yeniden oluştur.
export type LiveDatasetCreateRequest = MaterializeRequest;
export type LiveDatasetCreateResponse = MaterializeResponse;

// GET /query/live
export interface LiveDatasetSummary {
  id: string;
  label: string;
  sourceDatasetId: string;
  boardCount: number;
  /** Son çözümden bilinen sayı (bilgi amaçlı; sorgu her zaman günceli verir) */
  rowCount: number;
  createdAt: string; // ISO 8601
}

export interface ListLiveDatasetsResponse {
  liveDatasets: LiveDatasetSummary[];
}

// GET /query/live/:id — kayıtlı tarif (iç önbellek alanları sızdırılmaz)
export interface LiveDatasetDetailResponse {
  id: string;
  label: string;
  sourceDatasetId: string;
  boards: BoardConfig[];
  parameters: Record<string, string | number | boolean | null>;
  createdAt: string;
}

// POST /query error shape (non-2xx)
export interface QueryError {
  code:
    | 'DATASET_NOT_FOUND'
    | 'INVALID_BOARD_CONFIG'
    | 'EXPRESSION_ERROR'
    | 'PARAMETER_MISSING'
    | 'RESULT_TOO_LARGE'
    | 'INTERNAL';
  message: string;
  /** Index of the board that failed, when attributable */
  boardIndex?: number;
}
