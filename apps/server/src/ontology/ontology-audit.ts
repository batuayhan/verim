import { Injectable, Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ontoloji uzantısı denetim izi (Sprint 4) — SALT-EKLENİR (append-only).
 * Kim, ne zaman, hangi sürüm/sha, hangi eylem, hangi sonuç. Silme yok:
 * askeri bağlamda değişikliğin hesabı verilebilir olmalı.
 *
 * Yerel: .data/ontology-audit.jsonl (satır başı bir JSON).
 * GCS (Cloud Run): append doğrudan desteklenmediğinden mevcut nesneye
 * ekleyip yeniden yazar (küçük hacim; denetim kaydı seyrek).
 */

export interface DenetimKaydi {
  zaman: string;
  kim: string;
  eylem: 'yukle' | 'onayla' | 'aktiflestir' | 'rollback' | 'reddet';
  surum?: number;
  sha256?: string;
  sonuc: string;
}

const DATA_DIR = join(process.cwd(), '.data');
const FILE = 'ontology-audit.jsonl';
const GCS_BUCKET = process.env.GCS_BUCKET;

@Injectable()
export class OntologyAudit {
  private readonly log = new Logger('OntologyAudit');
  private storage = GCS_BUCKET ? new Storage() : null;

  yaz(kayit: Omit<DenetimKaydi, 'zaman'>): void {
    const satir = JSON.stringify({ zaman: new Date().toISOString(), ...kayit });
    if (this.storage && GCS_BUCKET) {
      void this.gcsAppend(satir);
    } else {
      mkdirSync(DATA_DIR, { recursive: true });
      appendFileSync(join(DATA_DIR, FILE), satir + '\n');
    }
    this.log.log(`denetim: ${kayit.kim} ${kayit.eylem} ${kayit.surum ?? ''} → ${kayit.sonuc}`);
  }

  oku(): DenetimKaydi[] {
    try {
      const raw = readFileSync(join(DATA_DIR, FILE), 'utf8');
      return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as DenetimKaydi);
    } catch {
      return [];
    }
  }

  private async gcsAppend(satir: string): Promise<void> {
    try {
      const file = this.storage!.bucket(GCS_BUCKET!).file(FILE);
      let mevcut = '';
      try {
        mevcut = (await file.download())[0].toString('utf8');
      } catch {
        /* ilk kayıt */
      }
      await file.save(mevcut + satir + '\n', { contentType: 'application/x-ndjson' });
    } catch (e) {
      this.log.error(`GCS denetim yazımı başarısız: ${(e as Error).message}`);
    }
  }
}
