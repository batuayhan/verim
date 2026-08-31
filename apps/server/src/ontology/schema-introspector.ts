import { Inject, Injectable } from '@nestjs/common';
import type { ColumnType } from '../contract/schema';
import { DATASET_PROVIDER, type DatasetProvider } from '../datasets/dataset-provider';
import { mimDatasetById } from '../mim/mim-mapping';
import { SqlClient } from '../mim/sql-client';

/**
 * SCHEMA_INTROSPECTOR portu — bir dataset/view'ın kolonlarını UCUZCA
 * (satır taramadan) döndürür. Kabul hattının 2. kademesi (bağlama bütünlüğü)
 * bunu kullanır: uzantı tipinin bağlandığı `datasetId` gerçekten var mı,
 * özellik kolonları o kaynakta mevcut ve tip uyumlu mu?
 *
 *  - MimSchemaIntrospector: information_schema.columns (view'ın GERÇEK şeması;
 *    mim-mapping bildirimiyle view arasındaki sapmayı da yakalar)
 *  - DummySchemaIntrospector: DatasetProvider şeması (bellek-içi, ucuz)
 */

export interface KolonBilgi {
  name: string;
  type: ColumnType;
}

export interface SchemaIntrospector {
  /** Kolonlar; dataset yoksa null */
  columns(datasetId: string): Promise<KolonBilgi[] | null>;
}

export const SCHEMA_INTROSPECTOR = Symbol('SCHEMA_INTROSPECTOR');

// --- dummy: DatasetProvider şeması -------------------------------------------

@Injectable()
export class DummySchemaIntrospector implements SchemaIntrospector {
  constructor(@Inject(DATASET_PROVIDER) private readonly datasets: DatasetProvider) {}

  async columns(datasetId: string): Promise<KolonBilgi[] | null> {
    const ds = await this.datasets.get(datasetId);
    if (!ds) return null;
    return ds.schema.columns.map((c) => ({ name: c.name, type: c.type }));
  }
}

// --- mim: information_schema (view'ın gerçek kolonları) ----------------------

/** PostgreSQL data_type → Verim ColumnType */
function pgToColumnType(dataType: string): ColumnType {
  const t = dataType.toLowerCase();
  if (['integer', 'bigint', 'smallint'].includes(t)) return 'integer';
  if (['double precision', 'numeric', 'real', 'decimal'].includes(t)) return 'double';
  if (t === 'boolean') return 'boolean';
  if (t === 'date') return 'date';
  if (t.startsWith('timestamp')) return 'timestamp';
  return 'string'; // text, character varying, vs.
}

@Injectable()
export class MimSchemaIntrospector implements SchemaIntrospector {
  constructor(private readonly sql: SqlClient) {}

  async columns(datasetId: string): Promise<KolonBilgi[] | null> {
    // datasetId → view adı (mim-mapping); yoksa dataset yok
    const view = mimDatasetById.get(datasetId)?.view;
    if (!view) return null;
    const r = await this.sql.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = $1 ORDER BY ordinal_position`,
      [view],
    );
    if (r.rows.length === 0) return null;
    return r.rows.map((c) => ({ name: c.column_name, type: pgToColumnType(c.data_type) }));
  }
}
