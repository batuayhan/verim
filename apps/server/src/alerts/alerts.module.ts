import { Module } from '@nestjs/common';
import { OntologyModule } from '../ontology/ontology.module';
import { AlertsController } from './alerts.controller';
import { AlertRulesStore, AlertsService } from './alerts.service';
import { AlertNotifier } from './notifier';

/** Alarm/kural motoru — sorgular OBJECT_SET_ENGINE portundan geçer. */
@Module({
  imports: [OntologyModule],
  controllers: [AlertsController],
  providers: [AlertRulesStore, AlertsService, AlertNotifier],
  exports: [AlertsService, AlertRulesStore],
})
export class AlertsModule {}
