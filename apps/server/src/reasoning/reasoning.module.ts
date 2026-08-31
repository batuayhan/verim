import { Module } from '@nestjs/common';
import { OntologyModule } from '../ontology/ontology.module';
import { COA_ENGINE, HeuristicCoaEngine } from './coa-engine';
import { ReasoningController } from './reasoning.controller';
import { ReasoningService } from './reasoning.service';
import { HeuristicThreatScorer, THREAT_SCORER } from './threat-scorer';

/**
 * Akıl yürütme modülü — MSS AI Reasoning omurgası (AIP Hub).
 *
 * MOSA (tak-çıkar): tehdit skorlayıcı ve COA üreteci PORT'tur; adapter'lar
 * burada bağlanır. İleride ML/harici adapter env ile seçilir, ana omurga
 * bozulmaz. Sorgular OBJECT_SET_ENGINE portundan (dummy/mim agnostik) geçer.
 */
@Module({
  imports: [OntologyModule],
  controllers: [ReasoningController],
  providers: [
    ReasoningService,
    { provide: THREAT_SCORER, useFactory: () => new HeuristicThreatScorer() },
    { provide: COA_ENGINE, useFactory: () => new HeuristicCoaEngine() },
  ],
  exports: [ReasoningService, THREAT_SCORER, COA_ENGINE],
})
export class ReasoningModule {}
