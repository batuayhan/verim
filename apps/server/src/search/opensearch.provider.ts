import { Inject, Injectable, Logger } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { ONTOLOGY_PROVIDER, type OntologyProvider } from '../ontology/ontology-provider';
import {
  SEARCH_INDEX,
  type SearchHit,
  type SearchProvider,
} from './search-provider';

/**
 * SEARCH_PROVIDER'ın OpenSearch adapter'ı — gerçek arama motoruna sorgu iter.
 * İndeks search-load servisiyle bir kez doldurulur; burada yalnızca okunur.
 * multi_match ile etiket/özet/pk alanlarında bulanık (fuzzy) tam-metin arama.
 */
@Injectable()
export class OpenSearchProvider implements SearchProvider {
  private readonly log = new Logger('OpenSearch');
  private readonly client: Client;

  constructor(@Inject(ONTOLOGY_PROVIDER) private readonly ontology: OntologyProvider) {
    this.client = new Client({ node: process.env.OPENSEARCH_URL ?? 'http://localhost:9200' });
  }

  async search(query: string, limit: number): Promise<SearchHit[]> {
    const q = query.trim();
    if (!q) return [];
    try {
      const res = await this.client.search({
        index: SEARCH_INDEX,
        body: {
          size: limit,
          query: {
            multi_match: {
              query: q,
              type: 'best_fields',
              fields: ['label^3', 'pk^2', 'ozet', 'metin'],
              fuzziness: 'AUTO',
            },
          },
        },
      });
      const hits = (res.body.hits?.hits ?? []) as unknown as Array<{ _source: SearchHit }>;
      return hits.map((h) => h._source).filter(Boolean);
    } catch (e) {
      this.log.warn(`OpenSearch sorgusu başarısız: ${(e as Error).message}`);
      return [];
    }
  }
}
