import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GOREV_DURUMLARI, type GorevDurum, type PlanGorev } from './plan-model';
import { SenkronService } from './senkron.service';

/**
 * SYNC MATRIX uçları — harekât senkronizasyon matrisi (zaman/kaynak/senaryo).
 *   GET  /senkron/plan                         canlı plan + CPM (kritik yol/ihlal)
 *   POST /senkron/plan/:id/kaydir              dinamik zaman kaydırma (zincir yayılımı)
 *   POST /senkron/plan/:id/gorev/:gid/durum    görev durumu / onay (Ontology Action)
 *   POST /senkron/senaryo                      what-if senaryo dalı
 *   GET  /senkron/plan/:id/fark                senaryo ↔ baz farkı
 *   POST /senkron/sensor-to-shooter            tehdit → COA → otomatik angajman görevi
 */
@ApiTags('senkron')
@Controller('senkron')
export class SenkronController {
  constructor(private readonly svc: SenkronService) {}

  @Get('plan')
  @ApiOperation({ summary: 'Canlı harekât planı + kritik yol analizi' })
  plan() {
    return this.svc.planPaketi('canli');
  }

  @Get('planlar')
  @ApiOperation({ summary: 'Tüm planlar (canlı + senaryolar)' })
  planlar() {
    return this.svc.listele();
  }

  @Get('plan/:id')
  planId(@Param('id') id: string) {
    return this.svc.planPaketi(id);
  }

  @Get('plan/:id/geo')
  @ApiOperation({ summary: 'Plan görevlerinin coğrafi izdüşümü (GeoJSON — harita katmanı)' })
  geo(@Param('id') id: string) {
    return this.svc.planGeo(id);
  }

  @Post('plan/:id/kaydir')
  @ApiOperation({ summary: 'Görevi yeni zamana al; bağlı adımlar otomatik kayar' })
  kaydir(@Param('id') id: string, @Body() b: { gorevId?: string; baslangicDk?: number }) {
    return this.svc.kaydir(id, String(b?.gorevId ?? ''), Math.round(Number(b?.baslangicDk ?? 0)));
  }

  @Post('plan/:id/gorev/:gorevId/durum')
  @ApiOperation({ summary: 'Görev durumu güncelle / onayla (Ontology Action)' })
  durum(
    @Param('id') id: string,
    @Param('gorevId') gorevId: string,
    @Body() b: { durum?: string },
  ) {
    const durum = (GOREV_DURUMLARI as readonly string[]).includes(String(b?.durum))
      ? (b!.durum as GorevDurum)
      : 'planli';
    return this.svc.durumGuncelle(id, gorevId, durum);
  }

  @Post('senaryo')
  @ApiOperation({ summary: 'What-if senaryo dalı türet (canlı plandan)' })
  senaryo(@Body() b: { ad?: string }) {
    return this.svc.senaryoTuret(b?.ad);
  }

  @Get('plan/:id/fark')
  @ApiOperation({ summary: 'Senaryo ↔ baz plan farkı' })
  fark(@Param('id') id: string) {
    return this.svc.senaryoFark(id);
  }

  @Delete('plan/:id')
  sil(@Param('id') id: string) {
    return this.svc.sil(id);
  }

  @Post('sensor-to-shooter')
  @ApiOperation({ summary: 'Tehdit izini COA ile otomatik angajman görevine dönüştür' })
  s2s(@Body() b: { izNo?: string; planId?: string }) {
    return this.svc.sensorToShooter(String(b?.izNo ?? ''), b?.planId || 'canli');
  }

  // --- Düzenleme (görev/bağımlılık CRUD) ---
  @Get('varliklar')
  @ApiOperation({ summary: 'Ontoloji varlıkları (görev atama listeleri için)' })
  varliklar() {
    return this.svc.varliklar();
  }

  @Post('plan/:id/gorev')
  @ApiOperation({ summary: 'Yeni görev ekle' })
  gorevEkle(@Param('id') id: string, @Body() b: Partial<PlanGorev>) {
    return this.svc.gorevEkle(id, b ?? {});
  }

  @Patch('plan/:id/gorev/:gorevId')
  @ApiOperation({ summary: 'Görevi düzenle (ad/süre/başlangıç/varlık/tür)' })
  gorevGuncelle(
    @Param('id') id: string,
    @Param('gorevId') gorevId: string,
    @Body() b: Partial<PlanGorev>,
  ) {
    return this.svc.gorevGuncelle(id, gorevId, b ?? {});
  }

  @Delete('plan/:id/gorev/:gorevId')
  gorevSil(@Param('id') id: string, @Param('gorevId') gorevId: string) {
    return this.svc.gorevSil(id, gorevId);
  }

  @Post('plan/:id/bagimlilik')
  @ApiOperation({ summary: 'Bağımlılık kur (döngü koruması)' })
  bagimlilikEkle(
    @Param('id') id: string,
    @Body() b: { oncekiId?: string; sonrakiId?: string; tur?: string; gecikmeDk?: number },
  ) {
    return this.svc.bagimlilikEkle(id, {
      oncekiId: String(b?.oncekiId ?? ''),
      sonrakiId: String(b?.sonrakiId ?? ''),
      tur: b?.tur === 'SS' ? 'SS' : 'FS',
      gecikmeDk: Math.round(Number(b?.gecikmeDk ?? 0)),
    });
  }

  @Post('plan/:id/bagimlilik/sil')
  bagimlilikSil(@Param('id') id: string, @Body() b: { oncekiId?: string; sonrakiId?: string }) {
    return this.svc.bagimlilikSil(id, String(b?.oncekiId ?? ''), String(b?.sonrakiId ?? ''));
  }

  @Post('plan/:id/toplu-kaydir')
  @ApiOperation({ summary: 'Toplu zaman kaydırma (opsiyonel domain filtresi)' })
  topluKaydir(@Param('id') id: string, @Body() b: { deltaDk?: number; domain?: string }) {
    return this.svc.topluKaydir(id, Math.round(Number(b?.deltaDk ?? 0)), b?.domain || undefined);
  }

  @Post('plan/:id/h-saati')
  @ApiOperation({ summary: 'Harekât H-saatini (başlangıç zamanı) ayarla' })
  hSaati(@Param('id') id: string, @Body() b: { iso?: string }) {
    return this.svc.hSaatiAyarla(id, String(b?.iso ?? ''));
  }

  @Post('plan/:id/geri')
  @ApiOperation({ summary: 'Son değişikliği GERİ al (undo)' })
  geri(@Param('id') id: string) {
    return this.svc.geriAl(id);
  }

  @Post('plan/:id/ileri')
  @ApiOperation({ summary: 'Geri alınan değişikliği İLERİ al (redo)' })
  ileri(@Param('id') id: string) {
    return this.svc.ileriAl(id);
  }

  @Post('plan/:id/satir-sirasi')
  @ApiOperation({ summary: 'Satır (varlık) sıralamasını kaydet (sürükle-bırak)' })
  satirSirasi(@Param('id') id: string, @Body() b: { sira?: string[] }) {
    return this.svc.satirSirala(id, Array.isArray(b?.sira) ? b.sira.map(String) : []);
  }

  @Post('plan/:id/terfi')
  @ApiOperation({ summary: 'Senaryoyu canlı plana terfi ettir' })
  terfi(@Param('id') id: string) {
    return this.svc.promote(id);
  }
}
