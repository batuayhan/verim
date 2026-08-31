import { Module } from '@nestjs/common';
import { OntologyModule } from '../ontology/ontology.module';
import { ReasoningModule } from '../reasoning/reasoning.module';
import { PlanStore } from './plan-store';
import { SenkronController } from './senkron.controller';
import { SenkronService } from './senkron.service';

/**
 * SYNC MATRIX modülü — MSS zaman/kaynak/senaryo orkestrasyonu.
 *
 * OntologyModule → OBJECT_SET_ENGINE (satırlar = ontoloji varlıkları).
 * ReasoningModule → ReasoningService (sensör-to-shooter için COA).
 * Motor deterministik/saf (sync-engine); plan kalıcılığı PlanStore.
 */
@Module({
  imports: [OntologyModule, ReasoningModule],
  controllers: [SenkronController],
  providers: [SenkronService, PlanStore],
  exports: [SenkronService],
})
export class SenkronModule {}
