import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type QueryResultRow } from 'pg';

/**
 * PostgreSQL bağlantı havuzu — MIP staging / gerçek MIP replikası.
 * DATABASE_URL: lokalde postgres://localhost/verim_mip, Cloud Run'da
 * Cloud SQL unix soketi (postgres://user:pass@/db?host=/cloudsql/...).
 */
@Injectable()
export class SqlClient implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://localhost/verim_mip',
    // Eş-zamanlı çok-kullanıcıda havuz doygunluğunu geciktir (ms'lik sorgular
    // bağlantıyı kısa tutar); N replika × havuz ≤ max_connections'ı aşmasın.
    max: Number(process.env.PG_POOL_MAX ?? 16),
    // In-memory motor UTC üzerinden hesaplar; SQL tarafı da aynı dilde konuşsun.
    // statement_timeout: KAÇAK bir sorgu (ör. filtresiz ağır yük) havuzu ve tüm
    // kullanıcıları saniyelerce kilitlemesin — kendini keser (yalnız APP havuzu;
    // ingest/enricher/seed kendi bağlantılarını kullanır, etkilenmez).
    options: `-c TimeZone=UTC -c statement_timeout=${process.env.PG_STATEMENT_TIMEOUT ?? '20000'}`,
  });

  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    return this.pool.query<T>(sql, params as never[]);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
