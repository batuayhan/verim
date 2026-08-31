import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { AnalysesModule } from '../analyses/analyses.module';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { DatasetsModule } from '../datasets/datasets.module';
import { OntologyModule } from '../ontology/ontology.module';
import { SqlPushdownQueryEngine } from '../mim/sql-query-engine';
import { InMemoryQueryEngine } from './in-memory/engine';
import { LiveDatasetsController } from './live-datasets.controller';
import { MaterializeController } from './materialize.controller';
import { QueryController } from './query.controller';
import { QUERY_ENGINE } from './query-engine';

/**
 * DATA_BACKEND=mim → SqlPushdownQueryEngine (filtre önekini SQL'e iter,
 * kalanı in-memory), aksi halde saf InMemoryQueryEngine. İki yol da
 * InMemoryQueryEngine'in board mantığını paylaşır → sonuç birebir aynı.
 */
@Module({
  // Analyses/Ontology/Alerts/Dashboards importları canlı dataset SİLME
  // korumasının artefakt taraması içindir (yönetişim kademe-4 çıtası)
  imports: [
    DatasetsModule,
    AnalysesModule,
    OntologyModule,
    AlertsModule,
    DashboardsModule,
  ],
  controllers: [QueryController, MaterializeController, LiveDatasetsController],
  providers: [
    InMemoryQueryEngine,
    SqlPushdownQueryEngine,
    {
      provide: QUERY_ENGINE,
      useExisting:
        process.env.DATA_BACKEND === 'mim'
          ? SqlPushdownQueryEngine
          : InMemoryQueryEngine,
    },
  ],
})
export class QueryModule {}
