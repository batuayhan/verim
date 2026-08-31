/**
 * SPRINT 5 — ASİSTAN SENKRON KANITI
 *
 * İddia: ontoloji uzantısı aktifleşince asistan/def-lint YENİ tipi
 * KENDİLİĞİNDEN tanır — çünkü hepsi aynı composite ontolojiden türer
 * (injectRuntimeEnums, tool-schemas, def-lint). Ayrı bir "asistana aktar"
 * adımı gerekmez. Bu, capability contract'ın uzantılara da geçtiğini gösterir.
 */

import { CompositeOntologyProvider } from '../src/ontology/composite-ontology-provider';
import { lintObjectSetDef } from '../src/capabilities/def-lint';
import type { OntologyExtension } from '../src/contract/ontology-ext';
import { DummyOntologyProvider } from '../src/ontology/dummy-ontology-provider';
import type { OntologyExtStore, StoredExtVersion } from '../src/ontology/ontology-ext-store';

const TESIS: OntologyExtension = {
  objectTypes: [{
    apiName: 'tesis', displayName: 'Tesis', pluralName: 'Tesisler',
    primaryKey: 'tesis_no', datasetId: 'tesisler',
    properties: [{ apiName: 'tesis_no', displayName: 'No', type: 'string' }],
  }],
  linkTypes: [],
};

const store = { aktif: () => ({ surum: 1, durum: 'aktif', icerik: TESIS } as StoredExtVersion) } as unknown as OntologyExtStore;

describe('Asistan senkronu (uzantı ontolojisi)', () => {
  const prev = process.env.ONTOLOGY_EXTENSIONS;
  beforeAll(() => { process.env.ONTOLOGY_EXTENSIONS = 'on'; });
  afterAll(() => { if (prev === undefined) delete process.env.ONTOLOGY_EXTENSIONS; else process.env.ONTOLOGY_EXTENSIONS = prev; });

  it('def-lint uzantı tipini TANIR, çekirdek dışı sanmaz', async () => {
    const comp = new CompositeOntologyProvider(new DummyOntologyProvider(), store);
    const ont = await comp.getOntology();
    // yeni tip ontolojide görünür → asistanın enum'ları da otomatik içerir
    expect(ont.objectTypes.some((t) => t.apiName === 'tesis')).toBe(true);
    // geçerli def → sorun yok
    expect(lintObjectSetDef({ type: 'base', objectType: 'tesis' }, ont)).toEqual([]);
  });

  it('yakın yazım hatası → uzantı tipini ÖNERİR', async () => {
    const comp = new CompositeOntologyProvider(new DummyOntologyProvider(), store);
    const ont = await comp.getOntology();
    const sorunlar = lintObjectSetDef({ type: 'base', objectType: 'tesiss' }, ont);
    expect(sorunlar.length).toBeGreaterThan(0);
    expect(sorunlar.join(' ')).toMatch(/tesis/); // öneri uzantı tipini gösterir
  });
});
