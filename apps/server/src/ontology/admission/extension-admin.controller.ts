import { Body, Controller, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roller, type Kullanici } from '../../auth/auth.module';
import { OntologyAudit } from '../ontology-audit';
import { OntologyExtStore } from '../ontology-ext-store';
import { OwlImportError, turtleToExtension } from '../owl-import';
import { GovernanceService } from './governance.service';
import { sonuc, type AdmissionRapor } from './types';

interface ReqK {
  kullanici?: Kullanici;
}
const kimlik = (req: ReqK): string => req.kullanici?.ad ?? 'bilinmeyen';

/**
 * Ontoloji uzantısı yönetim uçları (Sprint 4) — rol korumalı yaşam döngüsü.
 * yükle(admin) → onayla(onaylayan, dört-göz) → aktiflestir(admin) → geriDon(admin).
 * Denetim izi her eylemde yazılır.
 */
@ApiTags('ontology-admin')
@Controller('ontology/extensions')
export class ExtensionAdminController {
  constructor(
    private readonly gov: GovernanceService,
    private readonly store: OntologyExtStore,
    private readonly audit: OntologyAudit,
  ) {}

  @Get()
  @Roller('admin')
  @ApiOperation({ summary: 'Tüm uzantı sürümleri (durumlarıyla)' })
  liste() {
    return { surumler: this.store.tumSurumler(), aktif: this.store.aktif()?.surum ?? null };
  }

  @Get('audit')
  @Roller('admin')
  @ApiOperation({ summary: 'Denetim izi (salt-eklenir)' })
  denetim() {
    return { kayitlar: this.audit.oku() };
  }

  @Post()
  @Roller('admin')
  @ApiOperation({ summary: 'Aday uzantı yükle — JSON (kademe 1-4 otomatik koşar)' })
  yukle(@Body() body: unknown, @Req() req: ReqK) {
    return this.gov.yukle(body, kimlik(req));
  }

  @Post('import')
  @Roller('admin')
  @ApiOperation({ summary: 'OWL/Turtle dosyasından uzantı içe aktar + doğrula' })
  async importTtl(@Body() body: { ttl?: string }, @Req() req: ReqK) {
    const p = this.ayrıştır(body.ttl ?? '');
    if (p.hataRapor) return { rapor: p.hataRapor, etkilenen: [] };
    return this.gov.yukle(p.ext, kimlik(req));
  }

  @Post('preview')
  @Roller('admin')
  @ApiOperation({ summary: 'Aday uzantıyı SAKLAMADAN önizle: parse + kademe 1-4' })
  async onizle(@Body() body: { ttl?: string; json?: unknown }) {
    let ext: unknown;
    if (body.ttl !== undefined) {
      const p = this.ayrıştır(body.ttl);
      if (p.hataRapor) return { ext: null, rapor: p.hataRapor, etkilenen: [] };
      ext = p.ext;
    } else {
      ext = body.json;
    }
    const { rapor, etkilenen } = await this.gov.onizle(ext);
    return { ext, rapor, etkilenen };
  }

  /** TTL'i uzantıya çevir; parse/manifest hatası kademe-1 raporuna düşer. */
  private ayrıştır(ttl: string): { ext?: unknown; hataRapor?: AdmissionRapor } {
    try {
      return { ext: turtleToExtension(ttl) };
    } catch (e) {
      const kod = e instanceof OwlImportError ? 'OWL_IMPORT' : 'BILINMEYEN';
      return {
        hataRapor: {
          gecti: false,
          durduranKademe: 1,
          kademeler: [sonuc(1, [{ kademe: 1, kod, mesaj: (e as Error).message }])],
        },
      };
    }
  }

  @Post(':surum/approve')
  @Roller('onaylayan')
  @ApiOperation({ summary: 'Sürümü onayla (DÖRT-GÖZ: yükleyen onaylayamaz)' })
  onayla(@Param('surum', ParseIntPipe) surum: number, @Req() req: ReqK) {
    return this.gov.onayla(surum, kimlik(req));
  }

  @Post(':surum/activate')
  @Roller('admin')
  @ApiOperation({ summary: 'Onaylı sürümü aktifleştir (önceki arşive)' })
  aktiflestir(@Param('surum', ParseIntPipe) surum: number, @Req() req: ReqK) {
    return this.gov.aktiflestir(surum, kimlik(req));
  }

  @Post('rollback')
  @Roller('admin')
  @ApiOperation({ summary: 'Bir önceki aktif sürüme dön' })
  geriDon(@Req() req: ReqK) {
    return this.gov.geriDon(kimlik(req));
  }
}
