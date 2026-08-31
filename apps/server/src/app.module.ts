import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AnalysesModule } from './analyses/analyses.module';
import { AuthModule } from './auth/auth.module';
import { DatasetsModule } from './datasets/datasets.module';
import { AlertsModule } from './alerts/alerts.module';
import { AssistantModule } from './assistant/assistant.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { OntologyModule } from './ontology/ontology.module';
import { OntologyAdminModule } from './ontology/ontology-admin.module';
import { QueryModule } from './query/query.module';
import { ReasoningModule } from './reasoning/reasoning.module';
import { SenkronModule } from './senkron/senkron.module';
import { SearchModule } from './search/search.module';

// Prod dağıtımında frontend build'i (deploy.sh) public/ altına kopyalanır
// ve aynı origin'den sunulur; yerelde klasör yoksa devre dışı kalır.
const PUBLIC_DIR = join(process.cwd(), 'public');

@Module({
  imports: [
    ...(existsSync(PUBLIC_DIR)
      ? [
          ServeStaticModule.forRoot({
            rootPath: PUBLIC_DIR,
            serveStaticOptions: {
              // index.html asla cache'lenmesin (her deploy'da bundle hash'i
              // değişir; bayat html eski bundle'ı ister ve uygulama açılmaz).
              // Hash'li asset'ler ise süresiz cache'lenebilir.
              setHeaders: (res, filePath) => {
                if (filePath.endsWith('.html')) {
                  res.setHeader('Cache-Control', 'no-cache');
                } else {
                  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                }
              },
            },
          }),
        ]
      : []),
    AuthModule,
    DatasetsModule,
    QueryModule,
    AnalysesModule,
    OntologyModule,
    AssistantModule,
    AlertsModule,
    SearchModule,
    DashboardsModule,
    OntologyAdminModule,
    ReasoningModule,
    SenkronModule,
  ],
})
export class AppModule {}
