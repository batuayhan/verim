/**
 * search-load — ontolojideki tüm nesneleri OpenSearch'e indeksleyen tek-seferlik
 * yükleyici (seed sonrası çalışır; graph-load'un arama karşılığı). İz/gözlem
 * telemetrisi (milyonlar) İNDEKSLENMEZ — arama varlık nesnelerine (birlik/
 * platform/sensör/görev/personel/istihbarat) odaklıdır; izler harita/motor
 * yoluyla zaten sorgulanır.
 *
 *   OPENSEARCH_URL=http://opensearch:9200 DATA_BACKEND=mim node dist/search/search-load.js
 */

import { Client } from '@opensearch-project/opensearch';
import { DummyDatasetProvider } from '../datasets/dummy/dummy-dataset-provider';
import { MimDatasetProvider } from '../mim/mim-dataset-provider';
import { MimOntologyProvider } from '../mim/mim-ontology';
import { SqlClient } from '../mim/sql-client';
import { DummyOntologyProvider } from '../ontology/dummy-ontology-provider';
import {
  SEARCH_INDEX,
  hitLabel,
  hitSummary,
  type SearchHit,
} from './search-provider';

// Arama VARLIK nesnelerine odaklıdır (telemetri hariç)
const INDEXED_TYPES = ['birlik', 'platform', 'sensor', 'gorev', 'personel', 'istihbarat_raporu'];

async function main() {
  const useMim = process.env.DATA_BACKEND === 'mim';
  const ontologyProvider = useMim ? new MimOntologyProvider() : new DummyOntologyProvider();
  const sqlClient = useMim ? new SqlClient() : null;
  const datasets = useMim
    ? new MimDatasetProvider(sqlClient!)
    : await (async () => {
        const d = new DummyDatasetProvider();
        await d.onModuleInit();
        return d;
      })();

  const client = new Client({ node: process.env.OPENSEARCH_URL ?? 'http://localhost:9200' });

  // OpenSearch hazır olana kadar bekle (compose healthcheck yedeği)
  for (let i = 0; i < 60; i++) {
    try {
      await client.cluster.health({ wait_for_status: 'yellow', timeout: '5s' });
      break;
    } catch {
      if (i === 59) throw new Error('OpenSearch erişilemedi');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // İdempotan: indeksi sıfırla, mapping kur
  await client.indices.delete({ index: SEARCH_INDEX }, { ignore: [404] });
  await client.indices.create({
    index: SEARCH_INDEX,
    body: {
      mappings: {
        properties: {
          objectType: { type: 'keyword' },
          displayName: { type: 'keyword' },
          pk: { type: 'text', fields: { raw: { type: 'keyword' } } },
          label: { type: 'text' },
          icon: { type: 'keyword' },
          ozet: { type: 'text' },
          metin: { type: 'text' }, // tüm alanların birleşik metni (tam-metin)
        },
      },
    },
  });

  const ontology = await ontologyProvider.getOntology();
  let total = 0;
  for (const t of ontology.objectTypes) {
    if (!INDEXED_TYPES.includes(t.apiName)) continue;
    const ds = await datasets.get(t.datasetId);
    if (!ds) continue;
    const body: Record<string, unknown>[] = [];
    for (const row of ds.rows) {
      const pk = String(row[t.primaryKey] ?? '');
      const doc: SearchHit & { metin: string } = {
        objectType: t.apiName,
        displayName: t.displayName,
        pk,
        label: hitLabel(pk, row),
        icon: t.icon,
        ozet: hitSummary(t.displayName, row),
        metin: Object.values(row).filter((v) => v != null).map(String).join(' '),
      };
      body.push(
        { index: { _index: SEARCH_INDEX, _id: `${t.apiName}:${pk}` } },
        doc as unknown as Record<string, unknown>,
      );
    }
    if (body.length > 0) {
      // 5000 dokümanlık partiler halinde bulk
      for (let off = 0; off < body.length; off += 10_000) {
        await client.bulk({ body: body.slice(off, off + 10_000), refresh: false });
      }
      total += body.length / 2;
      console.log(`${t.apiName}: ${body.length / 2} nesne indekslendi`);
    }
  }
  await client.indices.refresh({ index: SEARCH_INDEX });
  console.log(`Toplam ${total} nesne OpenSearch'e indekslendi.`);
  if (sqlClient) await sqlClient.onModuleDestroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
