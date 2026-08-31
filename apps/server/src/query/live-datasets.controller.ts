import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type {
  LiveDatasetCreateRequest,
  LiveDatasetCreateResponse,
  LiveDatasetDetailResponse,
  ListLiveDatasetsResponse,
} from '../contract/api';
import { boardConfigSchema } from '../contract/zod';
import { ApiError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AnalysesStore } from '../analyses/analyses-store';
import { AlertRulesStore } from '../alerts/alerts.service';
import { DashboardsStore } from '../dashboards/dashboards.controller';
import { MercekAnalysesStore } from '../ontology/mercek-analyses.controller';
import { stringDegerler } from '../ontology/admission/etki';
import { CompositeDatasetProvider } from '../datasets/composite-dataset-provider';
import {
  LiveDatasetsStore,
  referencedDatasetIds,
  type LiveDatasetDef,
} from '../datasets/live-dataset-store';

const liveCreateSchema: z.ZodType<LiveDatasetCreateRequest> = z.object({
  label: z.string().min(1).max(120),
  datasetId: z.string().min(1),
  boards: z.array(boardConfigSchema),
  parameters: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
});

/**
 * CANLI dataset uçları — "Canlı dataset olarak kaydet".
 *
 * Materialize'ın (anlık görüntü) kardeşi: satır değil TARİF saklanır, sonuç
 * her okunuşta güncel veriden hesaplanır. Kabul hattı felsefesi geçerlidir:
 * aday tarif ÖNCE gerçekten çalıştırılır (motor hataları, eksik parametre,
 * tavan aşımı burada yakalanır) — geçemeyen tarif sisteme hiç girmez.
 * Tanımlar değişmezdir: güncelleme yok, sil + yeniden oluştur.
 */
@ApiTags('query')
@Controller('query/live')
export class LiveDatasetsController {
  constructor(
    private readonly provider: CompositeDatasetProvider,
    private readonly store: LiveDatasetsStore,
    private readonly harmanStore: AnalysesStore,
    private readonly mercekStore: MercekAnalysesStore,
    private readonly alarmStore: AlertRulesStore,
    private readonly dashboardStore: DashboardsStore,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Board zincirini CANLI dataset olarak kaydet',
    description:
      'Sonuç satırları değil sorgu tarifi saklanır; dataset her okunuşta ' +
      'güncel veriden yeniden hesaplanır (kullanıcı katında VIEW). Aday ' +
      'tarif kayıttan önce gerçekten çalıştırılır; hatalıysa saklanmaz.',
  })
  async create(
    @Body(new ZodValidationPipe(liveCreateSchema))
    body: LiveDatasetCreateRequest,
  ): Promise<LiveDatasetCreateResponse> {
    // Kaynak (ve enrich/setMath referansları) gerçekten var mı? Motor da
    // yakalar ama burada net 404 dönmek isteriz (bilinmeyen id yazım hatası).
    const known = new Set((await this.provider.list()).map((s) => s.id));
    for (const ref of referencedDatasetIds({
      sourceDatasetId: body.datasetId,
      boards: body.boards,
    })) {
      if (!known.has(ref)) throw ApiError.datasetNotFound(ref);
      // Anlık görüntüler (derived_*) oturumluktur, restart'ta kaybolur;
      // KALICI bir canlı tarif oturumluk kaynağa bağlanamaz — sonrası
      // "listede var ama açılmıyor" olurdu. Kalıcı zincirleme için kaynağı
      // da canlı dataset yapın.
      if (ref.startsWith('derived_')) {
        throw ApiError.invalidBoard(
          `'${ref}' bir anlık görüntü (oturumluk) — kalıcı canlı tarif buna ` +
            `bağlanamaz. Kaynağı canlı dataset olarak kaydedin.`,
        );
      }
    }

    const slug = body.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    // Aynı-ms çakışmasına karşı rastgele sonek + varlık kontrolü (sessiz
    // üzerine yazma → önbellek zehirlenmesi olmasın)
    let id: string;
    do {
      id = `live_${slug || 'dataset'}_${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 6)}`;
    } while (this.store.def(id) !== undefined || known.has(id));

    const def: LiveDatasetDef = {
      id,
      name: body.label,
      sourceDatasetId: body.datasetId,
      boards: body.boards,
      parameters: body.parameters,
      createdAt: new Date().toISOString(),
      cachedSchema: { columns: [] },
      cachedRowCount: 0,
    };

    // Kayıt öncesi smoke: aday tarif güncel veride uçtan uca çözülür.
    // Başarısızsa hata (boardIndex'li) aynen istemciye döner, hiçbir şey
    // saklanmaz. Başarılıysa çözüm zaten önbelleğe alınmıştır.
    const record = await this.provider.resolveDef(def);

    def.cachedSchema = record.schema;
    def.cachedRowCount = record.summary.rowCount;
    this.store.upsert(def);

    return { dataset: record.summary };
  }

  @Get()
  @ApiOperation({ summary: 'Canlı dataset tanımlarını listele' })
  list(): ListLiveDatasetsResponse {
    return {
      liveDatasets: this.store.defs().map((d) => ({
        id: d.id,
        label: d.name,
        sourceDatasetId: d.sourceDatasetId,
        boardCount: d.boards.length,
        rowCount: d.cachedRowCount,
        createdAt: d.createdAt,
      })),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Canlı dataset tanımını (tarifi) getir' })
  detail(@Param('id') id: string): LiveDatasetDetailResponse {
    const def = this.store.def(id);
    if (!def) throw ApiError.datasetNotFound(id);
    // İç önbellek alanları (cachedSchema/cachedRowCount) API'ye sızdırılmaz
    return {
      id: def.id,
      label: def.name,
      sourceDatasetId: def.sourceDatasetId,
      boards: def.boards,
      parameters: def.parameters,
      createdAt: def.createdAt,
    };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Canlı dataset tanımını sil',
    description:
      'Referanslı silme koruması (yönetişim standardı): başka bir canlı ' +
      'dataset VEYA kayıtlı bir Harman/Mercek analizi, alarm kuralı ya da ' +
      "dashboard bu id'ye başvuruyorsa silme reddedilir.",
  })
  remove(@Param('id') id: string): void {
    if (!this.store.def(id)) throw ApiError.datasetNotFound(id);

    const dependents = this.store
      .defs()
      .filter((d) => d.id !== id && referencedDatasetIds(d).includes(id))
      .map((d) => `canlı dataset '${d.id}'`);

    // Ontoloji yönetişimindeki kademe-4 ile aynı çıta: kayıtlı artefaktlar
    // derin taranır — kırılacak bir analiz/alarm/dashboard varsa red.
    const artefaktlar: Array<
      [string, { list(): { id: string }[]; get(i: string): unknown }]
    > = [
      ['Harman analizi', this.harmanStore],
      ['Mercek analizi', this.mercekStore],
      ['alarm kuralı', this.alarmStore],
      ['dashboard', this.dashboardStore],
    ];
    for (const [tur, store] of artefaktlar) {
      for (const s of store.list()) {
        const degerler = new Set<string>();
        stringDegerler(store.get(s.id), degerler);
        if (degerler.has(id)) dependents.push(`${tur} '${s.id}'`);
      }
    }

    if (dependents.length > 0) {
      // Sözleşmede ayrı bir çakışma kodu yok; en yakın kod bilinçli taviz
      throw ApiError.invalidBoard(
        `'${id}' silinemez — şunlar buna bağlı: ${dependents.join(', ')}. ` +
          'Önce onları silin/güncelleyin.',
      );
    }

    this.store.delete(id);
    this.provider.invalidate(id);
  }
}
