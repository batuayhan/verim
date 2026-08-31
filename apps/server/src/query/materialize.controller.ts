import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { MaterializeRequest, MaterializeResponse } from '../contract/api';
import { boardConfigSchema } from '../contract/zod';
import { ApiError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  DATASET_PROVIDER,
  type DatasetProvider,
} from '../datasets/dataset-provider';
import { QUERY_ENGINE, type QueryEngine } from './query-engine';

const materializeSchema: z.ZodType<MaterializeRequest> = z.object({
  label: z.string().min(1).max(120),
  datasetId: z.string().min(1),
  boards: z.array(boardConfigSchema),
  parameters: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
}) as z.ZodType<MaterializeRequest>;

/** "Save as dataset" — path sonucunu yeni bir dataset olarak kaydeder. */
@ApiTags('query')
@Controller('query')
export class MaterializeController {
  constructor(
    @Inject(QUERY_ENGINE) private readonly engine: QueryEngine,
    @Inject(DATASET_PROVIDER) private readonly datasets: DatasetProvider,
  ) {}

  @Post('materialize')
  @ApiOperation({
    summary: 'Board zincirinin sonucunu yeni dataset olarak materialize et',
    description:
      'Harman "Save as dataset" karşılığı. Dummy backend için sonuç ' +
      '100.000 satırla sınırlıdır ve bellekte tutulur.',
  })
  async materialize(
    @Body(new ZodValidationPipe(materializeSchema)) body: MaterializeRequest,
  ): Promise<MaterializeResponse> {
    const result = await this.engine.execute({
      datasetId: body.datasetId,
      boards: body.boards,
      targetBoardIndex: body.boards.length > 0 ? body.boards.length - 1 : undefined,
      parameters: body.parameters,
      limit: 100_000,
    });

    // FAIL-CLOSED: kırpık sonuç "tam dataset" olarak SAKLANMAZ — aksi halde
    // rowCount=rows.length yazıldığı için kısmilik kalıcı olarak görünmez
    // olur ve bu snapshot'ı kaynak alan her hesap sessizce yanlış çıkardı.
    if (result.truncated) {
      throw new ApiError({
        code: 'RESULT_TOO_LARGE',
        message:
          `Sonuç tavana takıldı (${result.totalRows} satır) — kırpık anlık ` +
          `görüntü kaydedilmez. Zinciri daraltın.`,
      });
    }

    const id = `derived_${body.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')}_${Date.now().toString(36)}`;

    const summary = {
      id,
      label: body.label,
      rowCount: result.rows.length,
      lastUpdated: new Date().toISOString(),
      version: `derived-${Date.now().toString(36)}`,
    };

    await this.datasets.add({
      summary,
      schema: result.schema,
      rows: result.rows as Array<Record<string, unknown>>,
    });

    return { dataset: summary };
  }
}
