import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReasoningService } from './reasoning.service';

/**
 * Akıl yürütme uçları (MSS "Joint Fires / önceliklendirme" yüzeyi):
 *   GET  /reasoning/tehditler  → en yüksek tehdit skorlu izler (writeback'ten)
 *   POST /reasoning/coa        → bir iz için ROE-uyumlu COA seçenekleri
 */
@ApiTags('reasoning')
@Controller('reasoning')
export class ReasoningController {
  constructor(private readonly svc: ReasoningService) {}

  @Get('tehditler')
  @ApiOperation({ summary: 'En yüksek tehdit skorlu izler' })
  tehditler(@Query('limit') limit?: string) {
    const n = Math.min(200, Math.max(1, Number(limit) || 20));
    return this.svc.enUstTehditler(n);
  }

  @Post('coa')
  @ApiOperation({ summary: 'İz için ROE-uyumlu angajman senaryoları (COA) üret' })
  coa(@Body() body: { izNo?: string }) {
    return this.svc.coaUret(String(body?.izNo ?? ''));
  }

  @Get('durum')
  @ApiOperation({ summary: 'Durum özeti (çok-kaynak füzyonu, önceliklendirilmiş)' })
  durum(@Query('domain') domain?: string) {
    return this.svc.durumOzeti(domain || undefined);
  }

  @Get('senkronizasyon')
  @ApiOperation({ summary: 'Angajman senkronizasyon matrisi (dost varlık × zaman penceresi)' })
  senkronizasyon(@Query('limit') limit?: string) {
    const n = Math.min(60, Math.max(1, Number(limit) || 20));
    return this.svc.senkronizasyonMatrisi(n);
  }
}
