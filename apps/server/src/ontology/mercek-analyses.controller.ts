import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Param,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { MercekAnalysisSummary } from '../contract/mercek';
import { ApiError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AnalysesStore, type StoredAnalysis } from '../analyses/analyses-store';

/** Mercek dokümanları ayrı dosyada; sayım = kart sayısı. */
@Injectable()
export class MercekAnalysesStore extends AnalysesStore {
  protected override readonly fileName = 'mercek-analyses.json';
  /** Eski ad (Quiver dönemi) — mevcut kayıtlar kaybolmasın diye okunur. */
  protected override readonly legacyFileName = 'quiver-analyses.json';
  protected override countOf(doc: StoredAnalysis): number {
    return Array.isArray(doc.cards) ? doc.cards.length : 0;
  }
}

const documentSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
}) as z.ZodType<StoredAnalysis>;

@ApiTags('mercek')
@Controller('mercek/analyses')
export class MercekAnalysesController {
  constructor(private readonly store: MercekAnalysesStore) {}

  @Get()
  @ApiOperation({ summary: 'Kayıtlı Mercek analizleri' })
  list(): { analyses: MercekAnalysisSummary[] } {
    return {
      analyses: this.store
        .list()
        .map(({ count, ...rest }) => ({ ...rest, cardCount: count })),
    };
  }

  @Get(':id')
  get(@Param('id') id: string): StoredAnalysis {
    const doc = this.store.get(id);
    if (!doc) {
      throw new ApiError({
        code: 'DATASET_NOT_FOUND',
        message: `Mercek analysis not found: ${id}`,
      });
    }
    return doc;
  }

  @Put(':id')
  save(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(documentSchema)) body: StoredAnalysis,
  ): { id: string; updatedAt: string } {
    if (body.id !== id) {
      throw ApiError.invalidBoard(`Body id (${body.id}) does not match URL id (${id})`);
    }
    return { id, updatedAt: this.store.upsert(body) };
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): void {
    this.store.delete(id);
  }
}
