import { Module } from '@nestjs/common';
import { MimDatasetProvider } from '../mim/mim-dataset-provider';
import { SqlClient } from '../mim/sql-client';
import {
  CompositeDatasetProvider,
  KERNEL_DATASET_PROVIDER,
} from './composite-dataset-provider';
import { DATASET_PROVIDER } from './dataset-provider';
import { DatasetsController } from './datasets.controller';
import { DummyDatasetProvider } from './dummy/dummy-dataset-provider';
import { LiveDatasetsStore } from './live-dataset-store';

/**
 * İki katmanlı binding (ontoloji modülüyle aynı desen):
 *  - KERNEL_DATASET_PROVIDER: DATA_BACKEND=mim → MimDatasetProvider
 *    (PostgreSQL v_* view'ları), aksi halde DummyDatasetProvider (seeded
 *    in-memory). Gerçek MIP replikası geldiğinde de bu ikisinden biri kalır.
 *  - DATASET_PROVIDER: her zaman CompositeDatasetProvider — çekirdeğin
 *    üstüne kullanıcı tanımlı CANLI dataset'leri (kayıtlı sorgunun dinamik
 *    sonucu) ekler. Tüketiciler (motorlar, controller'lar) farkı görmez.
 *
 * Gizli bağımlılık notu: composite, canlı tarif çözümü için QUERY_ENGINE'i
 * ModuleRef ile tembel alır — DatasetsModule'ü QueryModule'süz yükleyen bir
 * bağlamda canlı dataset OKUMASI açık hatayla reddedilir (kernel yol
 * etkilenmez).
 */
@Module({
  controllers: [DatasetsController],
  providers: [
    SqlClient,
    DummyDatasetProvider,
    MimDatasetProvider,
    LiveDatasetsStore,
    {
      provide: KERNEL_DATASET_PROVIDER,
      useExisting:
        process.env.DATA_BACKEND === 'mim'
          ? MimDatasetProvider
          : DummyDatasetProvider,
    },
    CompositeDatasetProvider,
    {
      provide: DATASET_PROVIDER,
      useExisting: CompositeDatasetProvider,
    },
  ],
  exports: [
    DATASET_PROVIDER,
    CompositeDatasetProvider,
    LiveDatasetsStore,
    SqlClient,
  ],
})
export class DatasetsModule {}
