import { Module } from '@nestjs/common';
import { DatasetsModule } from '../datasets/datasets.module';
import { OntologyModule } from '../ontology/ontology.module';
import { OpenSearchProvider } from './opensearch.provider';
import { SearchController } from './search.controller';
import { InMemorySearchProvider, SEARCH_PROVIDER } from './search-provider';

/**
 * SEARCH_BACKEND=opensearch → gerçek OpenSearch (docker servisi, indeksli);
 * aksi halde bellek-içi tarama (yalnız docker'sız dev). Graf DB'deki
 * (Neo4j vs dummy) ayrımın aynısı.
 */
@Module({
  imports: [OntologyModule, DatasetsModule],
  controllers: [SearchController],
  providers: [
    InMemorySearchProvider,
    OpenSearchProvider,
    {
      provide: SEARCH_PROVIDER,
      useExisting:
        process.env.SEARCH_BACKEND === 'opensearch' ? OpenSearchProvider : InMemorySearchProvider,
    },
  ],
})
export class SearchModule {}
