import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { DatasetSummary } from '../../contract/api';
import type { DatasetProvider, DatasetRecord } from '../dataset-provider';
import { generateDatasets } from './generators';

@Injectable()
export class DummyDatasetProvider implements DatasetProvider, OnModuleInit {
  private readonly logger = new Logger(DummyDatasetProvider.name);
  private datasets = new Map<string, DatasetRecord>();

  onModuleInit(): void {
    const started = Date.now();
    for (const record of generateDatasets()) {
      this.datasets.set(record.summary.id, record);
    }
    const total = [...this.datasets.values()].reduce(
      (sum, d) => sum + d.rows.length,
      0,
    );
    this.logger.log(
      `Seeded ${this.datasets.size} datasets, ${total} rows in ${Date.now() - started}ms`,
    );
  }

  list(): Promise<DatasetSummary[]> {
    return Promise.resolve(
      [...this.datasets.values()].map((d) => d.summary),
    );
  }

  get(datasetId: string): Promise<DatasetRecord | undefined> {
    return Promise.resolve(this.datasets.get(datasetId));
  }

  add(record: DatasetRecord): Promise<void> {
    this.datasets.set(record.summary.id, record);
    this.logger.log(
      `Registered derived dataset ${record.summary.id} (${record.rows.length} rows)`,
    );
    return Promise.resolve();
  }
}
