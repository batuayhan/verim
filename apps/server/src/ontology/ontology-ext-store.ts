import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OntologyExtension } from '../contract/ontology-ext';

/**
 * Ontoloji uzantılarının SÜRÜMLÜ, DEĞİŞMEZ deposu (Sprint 2).
 *
 * Her yükleme yeni bir sürümdür; içeriği asla üzerine yazılmaz (denetim izi).
 * Yalnız DURUM ilerler: taslak → dogrulandi → onayli → aktif → arsiv.
 * Aynı anda en fazla BİR sürüm 'aktif' olabilir; CompositeOntologyProvider
 * çekirdeğin üstüne yalnız aktif sürümü ekler.
 *
 * Kalıcılık AnalysesStore ile aynı (yerel .data / Cloud Run GCS).
 * Yaşam döngüsü geçişlerinin YÖNETİŞİMİ (dört-göz onay, rollback API) Sprint
 * 4'te bu deponun üstüne kurulur; burada mekanik durum makinesi bulunur.
 */

export type ExtDurum = 'taslak' | 'dogrulandi' | 'onayli' | 'aktif' | 'arsiv';

export interface StoredExtVersion {
  surum: number;
  sha256: string;
  yukleyen: string;
  onaylayan?: string;
  durum: ExtDurum;
  icerik: OntologyExtension;
  zaman: string;
  not?: string;
}

const DATA_DIR = join(process.cwd(), '.data');
const GCS_BUCKET = process.env.GCS_BUCKET;
const FILE = 'ontology-extensions.json';

export function sha256(icerik: OntologyExtension): string {
  return createHash('sha256')
    .update(JSON.stringify(icerik, Object.keys(icerik).sort()))
    .digest('hex');
}

@Injectable()
export class OntologyExtStore implements OnModuleInit {
  private readonly log = new Logger('OntologyExtStore');
  private surumler: StoredExtVersion[] = [];
  private storage = GCS_BUCKET ? new Storage() : null;

  async onModuleInit(): Promise<void> {
    try {
      const raw =
        this.storage && GCS_BUCKET
          ? (await this.storage.bucket(GCS_BUCKET).file(FILE).download())[0].toString('utf8')
          : readFileSync(join(DATA_DIR, FILE), 'utf8');
      this.surumler = JSON.parse(raw) as StoredExtVersion[];
      this.log.log(`${this.surumler.length} uzantı sürümü yüklendi`);
    } catch {
      this.log.log('Kayıtlı uzantı yok — boş başlıyor');
    }
  }

  tumSurumler(): StoredExtVersion[] {
    return [...this.surumler].sort((a, b) => b.surum - a.surum);
  }

  surum(n: number): StoredExtVersion | undefined {
    return this.surumler.find((s) => s.surum === n);
  }

  /** Aktif sürüm (durum='aktif'); yoksa undefined → composite saf çekirdektir */
  aktif(): StoredExtVersion | undefined {
    return this.surumler.find((s) => s.durum === 'aktif');
  }

  /** Yeni sürüm ekle (varsayılan taslak). İçerik sha256'lanır, sürüm no artar. */
  ekle(icerik: OntologyExtension, yukleyen: string, durum: ExtDurum = 'taslak'): StoredExtVersion {
    const next = this.surumler.reduce((m, s) => Math.max(m, s.surum), 0) + 1;
    const v: StoredExtVersion = {
      surum: next,
      sha256: sha256(icerik),
      yukleyen,
      durum,
      icerik,
      zaman: new Date().toISOString(),
    };
    this.surumler.push(v);
    this.flush();
    return v;
  }

  /** Durum güncelle (yönetişim Sprint 4'te bu üstüne kurulur). İçerik değişmez. */
  durumDegistir(surum: number, durum: ExtDurum, alan?: Partial<Pick<StoredExtVersion, 'onaylayan' | 'not'>>): boolean {
    const v = this.surum(surum);
    if (!v) return false;
    v.durum = durum;
    if (alan?.onaylayan !== undefined) v.onaylayan = alan.onaylayan;
    if (alan?.not !== undefined) v.not = alan.not;
    this.flush();
    return true;
  }

  /** Bir sürümü aktif yap; önceki aktif arşive düşer (tek aktif garantisi). */
  aktiflestir(surum: number): boolean {
    const v = this.surum(surum);
    if (!v) return false;
    for (const s of this.surumler) if (s.durum === 'aktif') s.durum = 'arsiv';
    v.durum = 'aktif';
    this.flush();
    return true;
  }

  private flush(): void {
    const payload = JSON.stringify(this.surumler, null, 2);
    if (this.storage && GCS_BUCKET) {
      this.storage
        .bucket(GCS_BUCKET)
        .file(FILE)
        .save(payload, { contentType: 'application/json' })
        .catch((e: Error) => this.log.error(`GCS flush hatası: ${e.message}`));
    } else {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(join(DATA_DIR, FILE), payload);
    }
  }
}
