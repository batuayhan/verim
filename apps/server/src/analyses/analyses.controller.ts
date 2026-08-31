import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type {
  ListAnalysesResponse,
  SaveAnalysisResponse,
} from '../contract/api';
import { ApiError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AnalysesStore, type StoredAnalysis } from './analyses-store';

const analysisDocumentSchema = z
  .looseObject({
    id: z.string().min(1),
    name: z.string().min(1),
  }) as z.ZodType<StoredAnalysis>;

@ApiTags('analyses')
@Controller('analyses')
export class AnalysesController {
  constructor(private readonly store: AnalysesStore) {}

  @Get()
  @ApiOperation({ summary: 'Kayıtlı analizlerin özet listesi' })
  list(): ListAnalysesResponse {
    return {
      analyses: this.store
        .list()
        .map(({ count, ...rest }) => ({ ...rest, pathCount: count })),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Analiz dokümanının tamamı' })
  get(@Param('id') id: string): StoredAnalysis {
    const doc = this.store.get(id);
    if (!doc) {
      throw new ApiError({ code: 'DATASET_NOT_FOUND', message: `Analysis not found: ${id}` });
    }
    return doc;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Analizi kaydet (upsert — doküman opak blob)' })
  save(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(analysisDocumentSchema)) body: StoredAnalysis,
  ): SaveAnalysisResponse {
    if (body.id !== id) {
      throw ApiError.invalidBoard(`Body id (${body.id}) does not match URL id (${id})`);
    }
    const updatedAt = this.store.upsert(body);
    return { id, updatedAt };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Analizi sil' })
  remove(@Param('id') id: string): void {
    this.store.delete(id);
  }
}
