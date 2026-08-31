import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { objectSetDefSchema } from '../ontology/ontology.controller';
import { AlertsService, type AlertRule } from './alerts.service';

const ruleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  def: objectSetDefSchema,
  windowMin: z.number().int().positive().max(24 * 60).optional(),
  operator: z.enum(['gt', 'gte', 'lt', 'lte']),
  threshold: z.number(),
  cooldownSec: z.number().int().min(10).max(24 * 3600).default(300),
  channels: z
    .object({
      webhook: z.string().url().optional(),
      email: z.string().email().optional(),
    })
    .optional(),
});

@ApiTags('alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get('rules')
  @ApiOperation({ summary: 'Alarm kuralları' })
  rules(): { rules: AlertRule[] } {
    return { rules: this.alerts.listRules() };
  }

  @Get('channels')
  @ApiOperation({ summary: 'Kullanılabilir bildirim kanalları (webhook/e-posta)' })
  channels(): { webhook: boolean; email: boolean } {
    return this.alerts.channelStatus();
  }

  @Put('rules/:id')
  @ApiOperation({ summary: 'Kural oluştur/güncelle' })
  upsert(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ruleSchema)) body: AlertRule,
  ): { ok: true } {
    this.alerts.upsertRule({ ...body, id });
    return { ok: true };
  }

  @Delete('rules/:id')
  @HttpCode(204)
  remove(@Param('id') id: string): void {
    this.alerts.deleteRule(id);
  }

  @Get('events')
  @ApiOperation({ summary: 'Son alarm olayları + okunmamış sayısı' })
  events(@Query('limit') limit?: string) {
    return this.alerts.listEvents(Math.min(Number(limit ?? 100), 500));
  }

  @Post('events/:id/ack')
  ack(@Param('id') id: string): { ok: boolean } {
    return { ok: this.alerts.acknowledge(id) };
  }

  @Post('events/ack-all')
  ackAll(): { ok: true } {
    this.alerts.acknowledgeAll();
    return { ok: true };
  }

  @Post('evaluate')
  @ApiOperation({ summary: 'Değerlendirmeyi hemen tetikle (test/elle)' })
  async evaluate(): Promise<{ ok: true }> {
    await this.alerts.evaluateAll();
    return { ok: true };
  }
}
