/**
 * QueryEngine — the execution port.
 *
 * The in-memory implementation materializes rows from DatasetProvider and
 * executes the board chain in TypeScript. If a future data layer (e.g. the
 * MIP information model) supports query pushdown, implement this port
 * against it instead — the controller stays untouched.
 */

import type { QueryRequest, QueryResponse } from '../contract/api';

export interface QueryEngine {
  execute(request: QueryRequest): Promise<QueryResponse>;
}

export const QUERY_ENGINE = Symbol('QUERY_ENGINE');
