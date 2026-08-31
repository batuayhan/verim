import { Module } from '@nestjs/common';
import { DashboardsController, DashboardsStore } from './dashboards.controller';

@Module({
  controllers: [DashboardsController],
  providers: [DashboardsStore],
  exports: [DashboardsStore],
})
export class DashboardsModule {}
