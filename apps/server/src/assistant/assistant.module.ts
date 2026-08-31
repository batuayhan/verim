import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { AnalysesModule } from '../analyses/analyses.module';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { DatasetsModule } from '../datasets/datasets.module';
import { OntologyModule } from '../ontology/ontology.module';
import { SenkronModule } from '../senkron/senkron.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

/**
 * Verim Asistanı (AIP karşılığı) — ontoloji + sorgu motorunu LLM'e araç
 * olarak sunar. OntologyModule'den ONTOLOGY_PROVIDER + OBJECT_SET_ENGINE
 * provider'larını ödünç alır.
 */
@Module({
  imports: [
    OntologyModule,
    AlertsModule,
    AnalysesModule,
    DatasetsModule,
    DashboardsModule,
    SenkronModule,
  ],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
