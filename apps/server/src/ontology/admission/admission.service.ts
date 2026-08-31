import { Inject, Injectable } from '@nestjs/common';
import { mergeExtension, type OntologyExtension } from '../../contract/ontology-ext';
import type { OntologyResponse } from '../../contract/mercek';
import { DATASET_PROVIDER, type DatasetProvider } from '../../datasets/dataset-provider';
import { SqlClient } from '../../mim/sql-client';
import { SqlObjectSetEngine } from '../../mim/sql-object-set-engine';
import { KERNEL_ONTOLOGY_PROVIDER } from '../composite-ontology-provider';
import { ObjectSetEngine, type IObjectSetEngine } from '../object-set-engine';
import type { OntologyProvider } from '../ontology-provider';
import { SCHEMA_INTROSPECTOR, type SchemaIntrospector } from '../schema-introspector';
import { kademe1Sozdizimi, kademe2Baglama, kademe3Davranis } from './kademeler';
import type { AdmissionRapor, KademeSonuc } from './types';

/**
 * Kabul hattı orkestratörü (Sprint 3): bir ham aday uzantıyı kademe 1→2→3'ten
 * geçirir; bir kademe başarısızsa DURUR (sonraki kademe koşulmaz — hata zaten
 * o katmandadır). Hiçbir doğrulama AKTİF ontolojiyi etkilemez: kademe 3 GEÇİCİ
 * bir motorda (aday ontolojiyle) yalnız SELECT üretir.
 *
 * Sprint 4, bu raporun üstüne etki analizi (kademe 4) + yönetişimi (kademe 5)
 * ekler.
 */
@Injectable()
export class AdmissionService {
  private readonly mim = process.env.DATA_BACKEND === 'mim';

  constructor(
    @Inject(KERNEL_ONTOLOGY_PROVIDER) private readonly kernel: OntologyProvider,
    @Inject(DATASET_PROVIDER) private readonly datasets: DatasetProvider,
    @Inject(SCHEMA_INTROSPECTOR) private readonly introspector: SchemaIntrospector,
    private readonly sql: SqlClient,
  ) {}

  /** Ham (parse edilmemiş) aday uzantıyı 1-3 kademeden geçir. */
  async dogrula(ham: unknown): Promise<AdmissionRapor> {
    const kademeler: KademeSonuc[] = [];

    // Kademe 1 — sözdizimi
    const k1 = kademe1Sozdizimi(ham);
    kademeler.push(k1.sonuc);
    if (!k1.ext) return { gecti: false, kademeler, durduranKademe: 1 };
    const ext = k1.ext;

    // Kademe 2 — bağlama bütünlüğü
    const kernel = await this.kernel.getOntology();
    const k2 = await kademe2Baglama(ext, kernel, this.introspector);
    kademeler.push(k2);
    if (!k2.gecti) return { gecti: false, kademeler, durduranKademe: 2 };

    // Kademe 3 — davranış smoke (geçici motor, aday ontoloji)
    const smoke = this.smokeEngine(mergeExtension(kernel, ext));
    const k3 = await kademe3Davranis(ext, smoke);
    kademeler.push(k3);
    if (!k3.gecti) return { gecti: false, kademeler, durduranKademe: 3 };

    return { gecti: true, kademeler };
  }

  /** Aday ontolojiyi gören GEÇİCİ motor (aktif composite'i etkilemez) */
  private smokeEngine(aday: OntologyResponse): IObjectSetEngine {
    const provider: OntologyProvider = { getOntology: () => Promise.resolve(aday) };
    return this.mim
      ? new SqlObjectSetEngine(this.sql, provider)
      : new ObjectSetEngine(this.datasets, provider);
  }
}
