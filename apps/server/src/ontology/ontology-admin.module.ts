import { Module } from '@nestjs/common';
import { AnalysesModule } from '../analyses/analyses.module';
import { AlertsModule } from '../alerts/alerts.module';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { ExtensionAdminController } from './admission/extension-admin.controller';
import { GovernanceService } from './admission/governance.service';
import { OntologyModule } from './ontology.module';
import { OntologyAudit } from './ontology-audit';

/**
 * Ontoloji yönetişim katmanı (Sprint 4). OntologyModule'ün ÜSTÜNDE durur:
 * kabul hattı (AdmissionService, kademe 1-3) + uzantı deposu oradan gelir;
 * bu modül etki analizi (kademe 4) + yaşam döngüsü/onay/denetim (kademe 5) +
 * kayıtlı artefakt store'larını ekler.
 *
 * Döngüsel bağımlılık yok: OntologyModule bu modülü/altındakileri İMPORT
 * ETMEZ; yönetişim yukarıda toplanır (admin → {ontology, analyses, alerts,
 * dashboards}).
 */
@Module({
  imports: [OntologyModule, AnalysesModule, AlertsModule, DashboardsModule],
  controllers: [ExtensionAdminController],
  providers: [GovernanceService, OntologyAudit],
})
export class OntologyAdminModule {}
