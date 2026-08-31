import { Injectable } from '@nestjs/common';
import { AnalysesStore, type StoredAnalysis } from '../analyses/analyses-store';

/**
 * Harekât planı store'u — AnalysesStore kalıcılık desenini yeniden kullanır
 * (yerel `.data/harekat-planlari.json`, Cloud Run'da GCS). Doküman = HarekatPlani.
 */
@Injectable()
export class PlanStore extends AnalysesStore {
  protected readonly fileName = 'harekat-planlari.json';
  protected countOf(doc: StoredAnalysis): number {
    return Array.isArray(doc.gorevler) ? (doc.gorevler as unknown[]).length : 0;
  }
}
