import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATASET_PROVIDER, type DatasetProvider } from '../datasets/dataset-provider';
import type { QueryRequest, QueryResponse } from '../contract/api';
import type { BoardConfig, FilterBoardConfig } from '../contract/boards';
import type { PropertyDef } from '../contract/mercek';
import type { Params } from '../query/in-memory/expression/evaluator';
import { InMemoryQueryEngine, type Frame } from '../query/in-memory/engine';
import type { QueryEngine } from '../query/query-engine';
import { mimDatasetById } from './mim-mapping';
import { conditionSql } from './sql-object-set-engine';
import { SqlClient } from './sql-client';

/**
 * Harman board zinciri için SQL PUSHDOWN motoru.
 *
 * Strateji: board zincirinin baştan gelen FİLTRE önekini (filter + görüntü-
 * amaçlı chart/table board'ları) tek bir SQL WHERE'e derleyip view'a iter —
 * böylece 1M+ satırlık tabloda tüm veriyi belleğe çekmek yerine YALNIZCA
 * eşleşen satırlar getirilir. Kalan board'lar (expression/histogram/pivot/
 * enrich/setMath/editColumns) doğrulanmış in-memory mantıkla işlenir
 * (InMemoryQueryEngine.runFromFrame — tek doğruluk kaynağı, sapma yok).
 *
 * Filtre önekiyle azaltılamayan sorgular (ör. ilk board expression) aynen
 * in-memory'ye düşer; sonuç her iki yolda birebir aynıdır (eşdeğerlik testi).
 * Türev/materyalize dataset'ler de doğrudan in-memory'ye düşer.
 */
@Injectable()
export class SqlPushdownQueryEngine implements QueryEngine {
  private readonly log = new Logger('SqlPushdown');
  private readonly scanLimit = Number(process.env.MIP_SCAN_LIMIT ?? 100_000);

  constructor(
    private readonly sql: SqlClient,
    private readonly inMemory: InMemoryQueryEngine,
    @Inject(DATASET_PROVIDER) private readonly datasets: DatasetProvider,
  ) {}

  async execute(request: QueryRequest): Promise<QueryResponse> {
    const mapping = mimDatasetById.get(request.datasetId);
    // MIM view'ı olmayan (türev/materyalize) dataset → tümüyle in-memory
    if (!mapping) return this.inMemory.execute(request);

    const target =
      request.targetBoardIndex ?? Math.max(request.boards.length - 1, -1);
    const props: PropertyDef[] = mapping.columns.map((c) => ({
      apiName: c.name,
      displayName: c.name,
      type: c.type,
    }));

    // Baştan gelen filtre önekini (pushdown edilebilir) topla — hedefe kadar
    const clauses: string[] = [];
    const binds: unknown[] = [];
    const bind = (v: unknown): string => {
      binds.push(v);
      return `$${binds.length}`;
    };
    let pushed = 0;
    for (let i = 0; i <= target; i++) {
      const b = request.boards[i];
      if (b.type === 'chart' || b.type === 'table') {
        pushed++; // görüntü board'ı satırı değiştirmez, atlanabilir
        continue;
      }
      if (b.type === 'filter') {
        clauses.push(this.filterBoardSql(b, props, request.parameters, bind));
        pushed++;
        continue;
      }
      break; // ilk pushdown-edilemeyen board'da dur
    }

    // Hiç filtre itilemediyse: klasik in-memory yol (fark yok)
    if (clauses.length === 0) return this.inMemory.execute(request);

    const where = clauses.filter((c) => c !== 'TRUE').join(' AND ') || 'TRUE';
    const started = Date.now();
    const [count, data] = await Promise.all([
      this.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${mapping.view} WHERE ${where}`,
        binds,
      ),
      this.sql.query<Record<string, unknown>>(
        `SELECT * FROM ${mapping.view} WHERE ${where} ORDER BY "${mapping.pk}" LIMIT ${this.scanLimit}`,
        binds,
      ),
    ]);

    // timestamptz → contract ISO string
    const tsCols = mapping.columns.filter((c) => c.type === 'timestamp').map((c) => c.name);
    const rows = data.rows.map((r) => {
      const out = { ...r };
      for (const c of tsCols) if (out[c] instanceof Date) out[c] = (out[c] as Date).toISOString();
      return out;
    });

    const frame: Frame = {
      rows,
      schema: { columns: mapping.columns },
      truncated: count.rows[0].n > rows.length,
    };

    const version = (await this.datasetVersion(request.datasetId)) ?? 'mip';
    this.log.debug(
      `pushdown ${mapping.view}: ${clauses.length} filtre → ${count.rows[0].n} satır (tarama yerine)`,
    );

    // Kalan board'lar (pushed'dan sonrası) in-memory çalışır
    return this.inMemory.runFromFrame(
      frame,
      request.boards,
      request.parameters,
      target,
      request.limit ?? 1000,
      version,
      started,
      pushed,
    );
  }

  /** Bir filtre board'unu tek bir SQL koşuluna derler (keep/remove + and/or) */
  private filterBoardSql(
    board: FilterBoardConfig,
    props: PropertyDef[],
    params: Params,
    bind: (v: unknown) => string,
  ): string {
    if (board.conditions.length === 0) return 'TRUE';
    const glue = board.combinator === 'or' ? ' OR ' : ' AND ';
    const inner = board.conditions
      .map((c) => `(${conditionSql(c, props, params, bind)})`)
      .join(glue);
    return board.action === 'remove' ? `NOT (${inner})` : `(${inner})`;
  }

  private async datasetVersion(datasetId: string): Promise<string | undefined> {
    const summaries = await this.datasets.list();
    return summaries.find((s) => s.id === datasetId)?.version;
  }
}
