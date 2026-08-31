import { Inject, Injectable } from '@nestjs/common';
import { DATASET_PROVIDER, type DatasetProvider } from '../datasets/dataset-provider';
import { ONTOLOGY_PROVIDER, type OntologyProvider } from '../ontology/ontology-provider';

/**
 * SEARCH_PROVIDER portu — ontolojideki tüm nesneler üzerinde tam-metin/serbest
 * arama (Palantir global arama karşılığı). Nesneler tipten bağımsız tek bir
 * indekste aranır; sonuç tıklanınca NesneDetay açılır.
 *
 *  - OpenSearchProvider: gerçek OpenSearch (docker compose servisi, indeksli)
 *  - InMemorySearchProvider: yalnız docker'sız dev için bellek-içi tarama
 *    (GRAPH_PROVIDER'daki DummyGraphProvider ile aynı "yalnız-dev" rolü)
 */

export interface SearchHit {
  objectType: string;
  displayName: string;
  pk: string;
  label: string;
  icon?: string;
  /** Eşleşmeyi bağlamlayan kısa özet (tip + belirgin alanlar) */
  ozet: string;
}

export interface SearchProvider {
  search(query: string, limit: number): Promise<SearchHit[]>;
}

export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');

/** Ontolojideki her tip için etiket + özet alanlarını türeten ortak yardımcı */
export const SEARCH_INDEX = 'verim-nesneler';
export const LABEL_FIELDS = ['ad', 'ad_soyad', 'cagri_adi', 'baslik', 'isim', 'name'];
export const SUMMARY_FIELDS = [
  'tur', 'tip', 'domain', 'siniflandirma', 'rol', 'rutbe', 'durum',
  'kademe', 'bolge', 'uzmanlik', 'kaynak', 'oncelik', 'tehdit_tipi',
];

export function hitLabel(pk: string, row: Record<string, unknown>): string {
  for (const f of LABEL_FIELDS) if (row[f]) return String(row[f]);
  return pk;
}
export function hitSummary(displayName: string, row: Record<string, unknown>): string {
  const parts = SUMMARY_FIELDS.map((f) => row[f]).filter((v) => v != null && v !== '');
  return [displayName, ...parts.slice(0, 3).map(String)].join(' · ');
}

// --- Bellek-içi arama (yalnız docker'sız dev) --------------------------------

@Injectable()
export class InMemorySearchProvider implements SearchProvider {
  constructor(
    @Inject(ONTOLOGY_PROVIDER) private readonly ontology: OntologyProvider,
    @Inject(DATASET_PROVIDER) private readonly datasets: DatasetProvider,
  ) {}

  async search(query: string, limit: number): Promise<SearchHit[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const ontology = await this.ontology.getOntology();
    const hits: SearchHit[] = [];
    for (const t of ontology.objectTypes) {
      const ds = await this.datasets.get(t.datasetId);
      if (!ds) continue;
      for (const row of ds.rows) {
        // Tüm string alanlarda alt-metin araması
        let matched = false;
        for (const v of Object.values(row)) {
          if (typeof v === 'string' && v.toLowerCase().includes(q)) { matched = true; break; }
        }
        if (!matched && String(row[t.primaryKey] ?? '').toLowerCase().includes(q)) matched = true;
        if (!matched) continue;
        const pk = String(row[t.primaryKey] ?? '');
        hits.push({
          objectType: t.apiName,
          displayName: t.displayName,
          pk,
          label: hitLabel(pk, row),
          icon: t.icon,
          ozet: hitSummary(t.displayName, row),
        });
        if (hits.length >= limit * 4) break; // tip başına aşırı taramayı kes
      }
    }
    // Etikette tam-önek eşleşmesi öne
    hits.sort((a, b) => {
      const ap = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      return ap - bp;
    });
    return hits.slice(0, limit);
  }
}
