import { Injectable } from '@nestjs/common';
import type { BoardConfig } from '../contract/boards';
import type { TableSchema } from '../contract/schema';
import { AnalysesStore, type StoredAnalysis } from '../analyses/analyses-store';

/**
 * CANLI DATASET tanımı — "kaydedilmiş sorgunun dinamik sonucu".
 *
 * Materialize (anlık görüntü / fotoğraf) satırları kopyalar; canlı dataset
 * ise yalnız TARİFİ saklar: kaynak dataset + board zinciri + bağlı
 * parametreler. Satırlar her okunuşta güncel veriden yeniden hesaplanır
 * (CompositeDatasetProvider.resolveDef) — veritabanındaki VIEW kavramının
 * kullanıcı katındaki karşılığı.
 *
 * Tanımlar DEĞİŞMEZDİR (güncelleme ucu yok — sil + yeniden oluştur). Bu,
 * canlı dataset'ler arası döngüyü yapısal olarak imkânsız kılar: yeni bir
 * tanım yalnız o an VAR OLAN dataset'lere başvurabilir; var olanlar sonradan
 * ona başvuracak şekilde değiştirilemez. (Çalışma zamanında yine de bir
 * derinlik kalkanı vardır — savunma katmanı.)
 */
export interface LiveDatasetDef {
  /** live_<slug>_<ts36> — kernel/derived ad alanlarıyla çakışmaz */
  id: string;
  /** Kullanıcı etiketi (AnalysesStore 'name' alanını paylaşır) */
  name: string;
  sourceDatasetId: string;
  boards: BoardConfig[];
  parameters: Record<string, string | number | boolean | null>;
  createdAt: string;
  /** Kayıt anındaki çözümden — liste görünümü için önbellek (bilgi amaçlı) */
  cachedSchema: TableSchema;
  cachedRowCount: number;
  [key: string]: unknown;
}

/**
 * Bir tanımın başvurduğu TÜM dataset id'leri: kaynak + enrich sağ tarafı +
 * setMath karşı kümesi. Sürüm kompozisyonu, silme koruması ve döngü
 * denetimi bu listeden beslenir.
 */
export function referencedDatasetIds(
  def: Pick<LiveDatasetDef, 'sourceDatasetId' | 'boards'>,
): string[] {
  const ids = new Set<string>([def.sourceDatasetId]);
  for (const b of def.boards) {
    if (b.type === 'enrich') ids.add(b.rightDatasetId);
    if (b.type === 'setMath') ids.add(b.otherDatasetId);
  }
  return [...ids];
}

/**
 * Kalıcı dosyadan gelen dokümanın asgari tarif şekli — elle bozulmuş/eski
 * şemalı bir kayıt, sağlayıcıyı (ve /datasets listesini) düşürmemeli.
 */
function gecerliDef(d: unknown): d is LiveDatasetDef {
  const x = d as Partial<LiveDatasetDef> | undefined;
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.sourceDatasetId === 'string' &&
    Array.isArray(x.boards) &&
    typeof x.parameters === 'object' &&
    x.parameters !== null
  );
}

/** Kalıcılık AnalysesStore deseniyle: yerel .data/ veya GCS. */
@Injectable()
export class LiveDatasetsStore extends AnalysesStore {
  protected override readonly fileName = 'live-datasets.json';
  protected override countOf(doc: StoredAnalysis): number {
    return Array.isArray(doc.boards) ? doc.boards.length : 0;
  }

  def(id: string): LiveDatasetDef | undefined {
    const doc = this.get(id);
    return gecerliDef(doc) ? doc : undefined;
  }

  defs(): LiveDatasetDef[] {
    return this.list()
      .map((s) => this.get(s.id))
      .filter(gecerliDef);
  }
}
