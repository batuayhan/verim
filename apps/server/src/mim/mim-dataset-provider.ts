import { Injectable } from '@nestjs/common';
import type {
  DatasetProvider,
  DatasetRecord,
  Row,
} from '../datasets/dataset-provider';
import type { DatasetSummary } from '../contract/api';
import { MIM_DATASETS, mimDatasetById } from './mim-mapping';
import { SqlClient } from './sql-client';

/**
 * DATASET_PROVIDER'ın MIP adapter'ı — v_* view'larından okur.
 *
 * Harman'ın in-memory board motoru get() ile TAM tabloyu ister; gerçek
 * hacimde bunu MIP_SCAN_LIMIT ile sınırlarız (en yeni kayıtlar önce
 * gelecek şekilde pk'ye göre sıralı). Mercek bu yoldan geçmez —
 * SqlObjectSetEngine sorguyu veritabanına iter, tavana takılmaz.
 * Materialize edilen türev dataset'ler oturum içi bellekte tutulur
 * (dummy provider ile aynı davranış).
 */
@Injectable()
export class MimDatasetProvider implements DatasetProvider {
  private readonly scanLimit = Number(process.env.MIP_SCAN_LIMIT ?? 100_000);
  private readonly derived = new Map<string, DatasetRecord>();
  private baseCache: { version: string; lastUpdated: string } | null = null;
  private wmCache: { wm: string; at: number } | null = null;

  constructor(private readonly sql: SqlClient) {}

  /**
   * version = seed damgası + WATERMARK (son gözlem id'si). Canlı sistemde
   * simülatör/ingest yazdıkça watermark ilerler → frontend cache anahtarları
   * değişir → sorgular dürüstçe tazelenir. Watermark 2sn memo'lanır ki her
   * istek veritabanına ayrı max() sormasın.
   */
  private async meta() {
    if (!this.baseCache) {
      const r = await this.sql.query<{ version: string; seeded_at: Date }>(
        'SELECT version, seeded_at FROM meta ORDER BY seeded_at DESC LIMIT 1',
      );
      this.baseCache = r.rows[0]
        ? { version: r.rows[0].version, lastUpdated: r.rows[0].seeded_at.toISOString() }
        : { version: 'mip-unseeded', lastUpdated: new Date(0).toISOString() };
    }
    if (!this.wmCache || Date.now() - this.wmCache.at > 2_000) {
      // Gözlem + istihbarat akışlarının ikisi de watermark'ı ilerletir
      const r = await this.sql.query<{ wm: string }>(
        `SELECT (SELECT coalesce(max(reporting_data_id), 0) FROM reporting_data)::text
                || '.' ||
                (SELECT coalesce(max(intel_report_id), 0) FROM intel_report)::text AS wm`,
      );
      this.wmCache = { wm: r.rows[0].wm, at: Date.now() };
    }
    return {
      version: `${this.baseCache.version}#${this.wmCache.wm}`,
      lastUpdated: this.baseCache.lastUpdated,
    };
  }

  async list(): Promise<DatasetSummary[]> {
    const { version, lastUpdated } = await this.meta();
    const summaries = await Promise.all(
      MIM_DATASETS.map(async (d) => {
        const r = await this.sql.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM ${d.view}`,
        );
        return { id: d.id, label: d.label, rowCount: r.rows[0].n, lastUpdated, version };
      }),
    );
    return [...summaries, ...[...this.derived.values()].map((d) => d.summary)];
  }

  async get(datasetId: string): Promise<DatasetRecord | undefined> {
    const derived = this.derived.get(datasetId);
    if (derived) return derived;

    const d = mimDatasetById.get(datasetId);
    if (!d) return undefined;
    const { version, lastUpdated } = await this.meta();

    const [count, data] = await Promise.all([
      this.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${d.view}`),
      this.sql.query<Row>(
        `SELECT * FROM ${d.view} ORDER BY "${d.pk}" LIMIT ${this.scanLimit}`,
      ),
    ]);

    // timestamptz → contract'ın beklediği ISO string
    const tsCols = d.columns.filter((c) => c.type === 'timestamp').map((c) => c.name);
    const rows =
      tsCols.length === 0
        ? data.rows
        : data.rows.map((r) => {
            const out = { ...r };
            for (const c of tsCols) {
              if (out[c] instanceof Date) out[c] = (out[c] as Date).toISOString();
            }
            return out;
          });

    return {
      summary: {
        id: d.id,
        label: d.label,
        rowCount: count.rows[0].n,
        lastUpdated,
        version,
      },
      schema: { columns: d.columns },
      rows,
    };
  }

  async add(record: DatasetRecord): Promise<void> {
    this.derived.set(record.summary.id, record);
  }
}
