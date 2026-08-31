import { Module } from '@nestjs/common';
import { DatasetsModule } from '../datasets/datasets.module';
import { MimOntologyProvider } from '../mim/mim-ontology';
import { Neo4jGraphProvider } from '../mim/neo4j-graph.provider';
import { SqlObjectSetEngine } from '../mim/sql-object-set-engine';
import { DummyGraphProvider, GRAPH_PROVIDER } from './graph-provider';
import { DummyOntologyProvider } from './dummy-ontology-provider';
import {
  CompositeOntologyProvider,
  KERNEL_ONTOLOGY_PROVIDER,
} from './composite-ontology-provider';
import { OntologyExtStore } from './ontology-ext-store';
import { AdmissionService } from './admission/admission.service';
import {
  DummySchemaIntrospector,
  MimSchemaIntrospector,
  SCHEMA_INTROSPECTOR,
} from './schema-introspector';
import { OBJECT_SET_ENGINE, ObjectSetEngine } from './object-set-engine';
import { OntologyController } from './ontology.controller';
import { ONTOLOGY_PROVIDER } from './ontology-provider';
import {
  MercekAnalysesController,
  MercekAnalysesStore,
} from './mercek-analyses.controller';

/**
 * DATA_BACKEND=mim: ontoloji MIM eşlemesinden türetilir (MimOntologyProvider)
 * ve object set sorguları SqlObjectSetEngine ile PostgreSQL'e itilir
 * (pushdown). Aksi halde statik dummy ontoloji + in-memory motor çalışır.
 * İki mod da /ontology'de birebir aynı yanıtı verir — frontend farkı görmez.
 */
@Module({
  imports: [DatasetsModule],
  controllers: [OntologyController, MercekAnalysesController],
  providers: [
    // Çekirdek ontoloji (kod): mim→MIM eşlemesi, aksi→dummy. Ayrı token.
    {
      provide: KERNEL_ONTOLOGY_PROVIDER,
      useClass:
        process.env.DATA_BACKEND === 'mim' ? MimOntologyProvider : DummyOntologyProvider,
    },
    OntologyExtStore,
    // Dışa görünen ontoloji = çekirdek ⊕ (bayrak açık + aktif) uzantı
    {
      provide: ONTOLOGY_PROVIDER,
      useClass: CompositeOntologyProvider,
    },
    // Kabul hattı: şema keşfi (mim→information_schema, dummy→DatasetProvider)
    DummySchemaIntrospector,
    MimSchemaIntrospector,
    {
      provide: SCHEMA_INTROSPECTOR,
      useExisting:
        process.env.DATA_BACKEND === 'mim' ? MimSchemaIntrospector : DummySchemaIntrospector,
    },
    AdmissionService,
    ObjectSetEngine,
    SqlObjectSetEngine,
    {
      provide: OBJECT_SET_ENGINE,
      useExisting:
        process.env.DATA_BACKEND === 'mim' ? SqlObjectSetEngine : ObjectSetEngine,
    },
    // Bağlantı grafı: GRAPH_BACKEND=neo4j → GERÇEK graf DB (docker servisi);
    // aksi halde bellek-içi adjacency (docker'sız dev + DÜŞÜK-KAYNAK profili).
    // SEARCH_BACKEND ile aynı desen: DATA_BACKEND'den AYRI seçilir, böylece
    // mim (gerçek SQL) verisi Neo4j OLMADAN da çalışır — lite deploy Neo4j'yi
    // (~425MB RAM) çıkarabilir.
    DummyGraphProvider,
    Neo4jGraphProvider,
    {
      provide: GRAPH_PROVIDER,
      useExisting:
        process.env.GRAPH_BACKEND === 'neo4j' ? Neo4jGraphProvider : DummyGraphProvider,
    },
    MercekAnalysesStore,
  ],
  exports: [
    ONTOLOGY_PROVIDER,
    KERNEL_ONTOLOGY_PROVIDER,
    OBJECT_SET_ENGINE,
    GRAPH_PROVIDER,
    MercekAnalysesStore,
    OntologyExtStore,
    AdmissionService,
  ],
})
export class OntologyModule {}
