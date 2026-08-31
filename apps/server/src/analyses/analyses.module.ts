import { Module } from '@nestjs/common';
import { AnalysesController } from './analyses.controller';
import { AnalysesStore } from './analyses-store';

@Module({
  controllers: [AnalysesController],
  providers: [AnalysesStore],
  exports: [AnalysesStore],
})
export class AnalysesModule {}
