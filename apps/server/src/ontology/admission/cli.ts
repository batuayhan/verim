/**
 * Kabul hattı CLI — bir aday uzantı JSON dosyasını kademe 1-3'ten geçirir.
 * Geliştirici, dosyayı sisteme yüklemeden yerelde doğrular. Dummy çekirdeği
 * kullanır (DB gerektirmez); mim doğrulaması için /ontology/extensions:validate.
 *
 *   node dist/ontology/admission/cli.js aday.json
 */

import { readFileSync } from 'node:fs';
import { DummyDatasetProvider } from '../../datasets/dummy/dummy-dataset-provider';
import { SqlClient } from '../../mim/sql-client';
import { DummyOntologyProvider } from '../dummy-ontology-provider';
import { DummySchemaIntrospector } from '../schema-introspector';
import { AdmissionService } from './admission.service';
import { KADEME_AD } from './types';

async function main() {
  const dosya = process.argv[2];
  if (!dosya) {
    console.error('Kullanım: node dist/ontology/admission/cli.js <aday.json>');
    process.exit(2);
  }
  const ham: unknown = JSON.parse(readFileSync(dosya, 'utf8'));

  const datasets = new DummyDatasetProvider();
  await datasets.onModuleInit();
  const admission = new AdmissionService(
    new DummyOntologyProvider(),
    datasets,
    new DummySchemaIntrospector(datasets),
    new SqlClient(), // dummy yolunda kullanılmaz
  );

  const rapor = await admission.dogrula(ham);
  for (const k of rapor.kademeler) {
    console.log(`${k.gecti ? '✓' : '✗'} Kademe ${k.kademe} — ${KADEME_AD[k.kademe]}`);
    for (const b of k.bulgular) {
      console.log(`    [${b.kod}] ${b.mesaj}${b.konum ? ` (${b.konum})` : ''}`);
    }
  }
  console.log(rapor.gecti ? '\nSONUÇ: GEÇTİ ✓' : `\nSONUÇ: REDDEDİLDİ ✗ (kademe ${rapor.durduranKademe})`);
  process.exit(rapor.gecti ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
