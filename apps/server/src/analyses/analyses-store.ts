import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Analiz dokümanlarını saklayan store. Doküman server için opak bir JSON
 * blob'udur — şeması frontend'e aittir.
 *
 * Kalıcılık iki modlu:
 *  - Yerel: .data/<dosya>.json
 *  - Cloud Run (GCS_BUCKET tanımlıysa): GCS objesi — container dosya
 *    sistemi geçici olduğundan deploy/instans değişiminde veri kaybını
 *    önler.
 */

export interface StoredAnalysis {
  id: string;
  name: string;
  paths?: unknown[];
  cards?: unknown[];
  [key: string]: unknown;
}

interface StoredEntry {
  document: StoredAnalysis;
  updatedAt: string;
}

export interface StoredSummary {
  id: string;
  name: string;
  updatedAt: string;
  count: number;
}

const DATA_DIR = join(process.cwd(), '.data');
const GCS_BUCKET = process.env.GCS_BUCKET;

@Injectable()
export class AnalysesStore implements OnModuleInit {
  private readonly logger = new Logger(this.constructor.name);
  private entries = new Map<string, StoredEntry>();
  private storage = GCS_BUCKET ? new Storage() : null;

  /** Alt sınıflar dosya adını ve sayım alanını değiştirir. */
  protected readonly fileName: string = 'analyses.json';
  /**
   * Dosya adı değişmişse eski ad: yenisi yoksa buradan okunur (ilk kayıtta
   * yeni ada yazılır). Eski dosya silinmez — geri dönüş güvenli kalır.
   */
  protected readonly legacyFileName?: string;
  protected countOf(doc: StoredAnalysis): number {
    return Array.isArray(doc.paths) ? doc.paths.length : 0;
  }

  private get localFile(): string {
    return join(DATA_DIR, this.fileName);
  }

  async onModuleInit(): Promise<void> {
    for (const name of [this.fileName, this.legacyFileName]) {
      if (!name) continue;
      try {
        let raw: string;
        if (this.storage && GCS_BUCKET) {
          const [buf] = await this.storage.bucket(GCS_BUCKET).file(name).download();
          raw = buf.toString('utf8');
          this.logger.log(`Loaded from gs://${GCS_BUCKET}/${name}`);
        } else {
          raw = readFileSync(join(DATA_DIR, name), 'utf8');
          this.logger.log(`Loaded from ${join(DATA_DIR, name)}`);
        }
        const parsed = JSON.parse(raw) as Record<string, StoredEntry>;
        this.entries = new Map(Object.entries(parsed));
        this.logger.log(`${this.entries.size} documents`);
        return;
      } catch {
        // sıradaki adı dene (yoksa boş başlanır)
      }
    }
    this.logger.log(`No persisted data for ${this.fileName}, starting empty`);
  }

  list(): StoredSummary[] {
    return [...this.entries.values()]
      .map((e) => ({
        id: e.document.id,
        name: e.document.name,
        updatedAt: e.updatedAt,
        count: this.countOf(e.document),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): StoredAnalysis | undefined {
    return this.entries.get(id)?.document;
  }

  upsert(document: StoredAnalysis): string {
    const updatedAt = new Date().toISOString();
    this.entries.set(document.id, { document, updatedAt });
    this.flush();
    return updatedAt;
  }

  delete(id: string): boolean {
    const existed = this.entries.delete(id);
    if (existed) this.flush();
    return existed;
  }

  private flush(): void {
    const payload = JSON.stringify(Object.fromEntries(this.entries), null, 2);
    if (this.storage && GCS_BUCKET) {
      this.storage
        .bucket(GCS_BUCKET)
        .file(this.fileName)
        .save(payload, { contentType: 'application/json' })
        .catch((err: Error) =>
          this.logger.error(`GCS flush failed (${this.fileName}): ${err.message}`),
        );
    } else {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(this.localFile, payload);
    }
  }
}
