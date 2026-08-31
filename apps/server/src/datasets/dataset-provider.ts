/**
 * DatasetProvider — the data-source port.
 *
 * Everything downstream (controllers, query engine) depends only on this
 * interface. Today the binding is DummyDatasetProvider (seeded in-memory
 * data); when the real source arrives (e.g. an ontology layer / MIP
 * information model), implement this port against it and swap the DI
 * binding in datasets.module.ts — nothing else changes.
 *
 * Note for the future adapter: getRows() materializes the full dataset,
 * which is fine for dummy/small data. If the ontology layer supports
 * query pushdown, extend this port with a capability flag so the engine
 * can delegate filters/aggregations instead of pulling raw rows.
 */

import type { DatasetSummary } from '../contract/api';
import type { TableSchema } from '../contract/schema';

export type Row = Record<string, unknown>;

export interface DatasetRecord {
  summary: DatasetSummary;
  schema: TableSchema;
  rows: Row[];
}

export interface DatasetProvider {
  list(): Promise<DatasetSummary[]>;
  /** Returns undefined when the dataset does not exist. */
  get(datasetId: string): Promise<DatasetRecord | undefined>;
  /**
   * Registers a derived dataset (materialized path result). Read-only
   * adapters (e.g. a future ontology layer) may throw; the dummy provider
   * keeps it in memory for the session.
   */
  add(record: DatasetRecord): Promise<void>;
}

/** NestJS injection token for the port. */
export const DATASET_PROVIDER = Symbol('DATASET_PROVIDER');
