import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  DatasetSchemaResponse,
  ListDatasetsResponse,
} from '../contract/api';
import { ApiError } from '../common/api-error';
import { DATASET_PROVIDER, type DatasetProvider } from './dataset-provider';

@ApiTags('datasets')
@Controller('datasets')
export class DatasetsController {
  constructor(
    @Inject(DATASET_PROVIDER) private readonly datasets: DatasetProvider,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List datasets available as path starting points' })
  async list(): Promise<ListDatasetsResponse> {
    return { datasets: await this.datasets.list() };
  }

  @Get(':id/schema')
  @ApiOperation({ summary: 'Typed column schema and row count of a dataset' })
  async schema(@Param('id') id: string): Promise<DatasetSchemaResponse> {
    const dataset = await this.datasets.get(id);
    if (!dataset) throw ApiError.datasetNotFound(id);
    return {
      datasetId: dataset.summary.id,
      version: dataset.summary.version,
      schema: dataset.schema,
      rowCount: dataset.summary.rowCount,
    };
  }
}
