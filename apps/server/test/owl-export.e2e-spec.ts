/**
 * OWL EXPORT ROUND-TRIP TESTİ (Sprint 1)
 *
 * ontologyToTurtle çıktısının:
 *  1. Geçerli Turtle olması (n3 parser hatasız yutar),
 *  2. KAYIPSIZ olması — her tip owl:Class, her özellik owl:DatatypeProperty,
 *     her link owl:ObjectProperty; sayılar canlı ontolojiyle birebir,
 *  3. VERİ-BAĞLAMASINI taşıması — her tipte verim:datasetId + verim:primaryKey,
 *     her özellikte verim:kolon, her linkte verim:fromKey/toKey
 *     (OWL'un taşımadığı, içe aktarımın muhtaç olduğu bilgi).
 * dummy ≡ mim ontolojisi olduğundan iki sağlayıcıda da koşar.
 */

import { Parser, Store, DataFactory } from 'n3';
import { DummyOntologyProvider } from '../src/ontology/dummy-ontology-provider';
import { MimOntologyProvider, mimKaynakMap } from '../src/mim/mim-ontology';
import { ontologyToTurtle } from '../src/ontology/owl-export';
import type { OntologyProvider } from '../src/ontology/ontology-provider';

const OWL = 'http://www.w3.org/2002/07/owl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const V = 'https://verim.local/ontoloji#';
const { namedNode } = DataFactory;

async function parseToStore(ttl: string): Promise<Store> {
  const store = new Store();
  const parser = new Parser();
  const quads = parser.parse(ttl); // hata olursa throw (senkron)
  store.addQuads(quads);
  return store;
}

function subjectsOfType(store: Store, typeUri: string): string[] {
  return store
    .getQuads(null, namedNode(RDF + 'type'), namedNode(typeUri), null)
    .map((q) => q.subject.value);
}

describe.each<[string, OntologyProvider]>([
  ['dummy', new DummyOntologyProvider()],
  ['mim', new MimOntologyProvider()],
])('OWL export (%s)', (_ad, provider) => {
  it('geçerli Turtle + kayıpsız sayılar + bağlama annotation', async () => {
    const ontology = await provider.getOntology();
    const ttl = ontologyToTurtle(ontology, { mimKaynak: mimKaynakMap() });
    const store = await parseToStore(ttl); // sözdizimi geçerli değilse burada patlar

    // 1. Sınıf sayısı = tip sayısı
    const classes = subjectsOfType(store, OWL + 'Class');
    expect(classes.length).toBe(ontology.objectTypes.length);
    for (const t of ontology.objectTypes) {
      expect(classes).toContain(V + t.apiName);
    }

    // 2. ObjectProperty sayısı = link sayısı; one → FunctionalProperty
    const objProps = subjectsOfType(store, OWL + 'ObjectProperty');
    expect(objProps.length).toBe(ontology.linkTypes.length);
    const funcProps = subjectsOfType(store, OWL + 'FunctionalProperty');
    const oneLinks = ontology.linkTypes.filter((l) => l.cardinality === 'one');
    expect(funcProps.length).toBe(oneLinks.length);

    // 3. DatatypeProperty sayısı = toplam özellik sayısı
    const dataProps = subjectsOfType(store, OWL + 'DatatypeProperty');
    const totalProps = ontology.objectTypes.reduce((n, t) => n + t.properties.length, 0);
    expect(dataProps.length).toBe(totalProps);

    // 4. Her tipte verim:datasetId + verim:primaryKey (VERİ-BAĞLAMA)
    for (const t of ontology.objectTypes) {
      const ds = store.getQuads(namedNode(V + t.apiName), namedNode(V + 'datasetId'), null, null);
      expect(ds[0]?.object.value).toBe(t.datasetId);
      const pk = store.getQuads(namedNode(V + t.apiName), namedNode(V + 'primaryKey'), null, null);
      expect(pk[0]?.object.value).toBe(t.primaryKey);
    }

    // 5. Her linkte verim:fromKey/toKey/cardinality
    for (const l of ontology.linkTypes) {
      const fk = store.getQuads(namedNode(V + l.apiName), namedNode(V + 'fromKey'), null, null);
      expect(fk[0]?.object.value).toBe(l.fromKey);
      const tk = store.getQuads(namedNode(V + l.apiName), namedNode(V + 'toKey'), null, null);
      expect(tk[0]?.object.value).toBe(l.toKey);
    }

    // 6. Her özellikte verim:kolon (tam apiName — içe aktarım buna dayanır)
    const kolonlar = store
      .getQuads(null, namedNode(V + 'kolon'), null, null)
      .map((q) => q.object.value)
      .sort();
    const beklenen = ontology.objectTypes
      .flatMap((t) => t.properties.map((p) => p.apiName))
      .sort();
    expect(kolonlar).toEqual(beklenen);
  });
});
