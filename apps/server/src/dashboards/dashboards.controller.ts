import { Body, Controller, Delete, Get, HttpCode, Injectable, NotFoundException, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { AnalysesStore, type StoredAnalysis } from '../analyses/analyses-store';
import { ApiError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dashboardSchema, type DashboardDoc } from './dashboard-schema';
import { SISTEM_DASHBOARD_ID, sistemDashboard } from './sistem-dashboard';

/**
 * Birleşik dashboard CRUD'u. 'sistem' dashboard'u SANALDIR: listede ve
 * get'te koddan üretilir, yazılamaz/silinemez — kullanıcı kopyalayıp
 * kendi dashboard'unu düzenler (Jira modeli).
 */

@Injectable()
export class DashboardsStore extends AnalysesStore {
  protected override readonly fileName = 'dashboards.json';
  protected override countOf(doc: StoredAnalysis): number {
    const gadgets = (doc as unknown as { gadgets?: unknown[] }).gadgets;
    return Array.isArray(gadgets) ? gadgets.length : 0;
  }
}

export interface DashboardSummary {
  id: string;
  name: string;
  updatedAt: string;
  gadgetCount: number;
  sistem: boolean;
}

@ApiTags('dashboards')
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly store: DashboardsStore) {}

  @Get()
  @ApiOperation({ summary: 'Dashboard listesi (Sistem + kullanıcı dashboardları)' })
  list(): { dashboards: DashboardSummary[] } {
    const sistem = sistemDashboard();
    return {
      dashboards: [
        {
          id: sistem.id,
          name: sistem.name,
          updatedAt: '',
          gadgetCount: sistem.gadgets.length,
          sistem: true,
        },
        ...this.store.list().map((s) => ({
          id: s.id,
          name: s.name,
          updatedAt: s.updatedAt,
          gadgetCount: s.count,
          sistem: false,
        })),
      ],
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dashboard dokümanı (sistem → koddan üretilir)' })
  get(@Param('id') id: string): DashboardDoc {
    if (id === SISTEM_DASHBOARD_ID) return sistemDashboard();
    const doc = this.store.get(id);
    if (!doc) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `Dashboard yok: ${id}` });
    }
    return doc as unknown as DashboardDoc;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Dashboard kaydet (sistem yazılamaz)' })
  put(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(dashboardSchema as unknown as z.ZodType))
    body: DashboardDoc,
  ): { id: string; updatedAt: string } {
    if (id === SISTEM_DASHBOARD_ID || body.id === SISTEM_DASHBOARD_ID) {
      throw ApiError.invalidBoard(
        "Sistem dashboard'u salt okunur — kopyalayıp kendi dashboard'unu düzenle.",
      );
    }
    if (body.id !== id) {
      throw ApiError.invalidBoard('Gövde id ile yol id uyuşmuyor.');
    }
    const updatedAt = this.store.upsert(body as unknown as StoredAnalysis);
    return { id, updatedAt };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Dashboard sil (sistem silinemez)' })
  remove(@Param('id') id: string): void {
    if (id === SISTEM_DASHBOARD_ID) {
      throw ApiError.invalidBoard("Sistem dashboard'u silinemez.");
    }
    if (!this.store.delete(id)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `Dashboard yok: ${id}` });
    }
  }
}
