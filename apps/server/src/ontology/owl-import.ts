import { Parser, Store, DataFactory } from 'n3';
import type { ColumnType } from '../contract/schema';
import type { OntologyExtension } from '../contract/ontology-ext';

/**
 * OWL/Turtle → OntologyExtension içe aktarımı (Sprint 5, ADR K3).
 *
 * owl-export'un tersi. OWL "anlamı" taşır ama VERİ-BAĞLAMASINI taşımaz; bu
 * yüzden içe aktarım `verim:*` annotation'larını ZORUNLU tutar — eksikse
 * "bağlama manifesti eksik" hatası (kabul hattının kademe-1'ine düşecek şekilde
 * fırlatılır). Böylece "kavramı içeri aldım ama hangi view'a bağlı bilmiyorum"
 * sessiz durumu imkânsızdır.
 *
 * Kapsam bilinçli DAR: yalnız bizim export profilimiz + verim: annotation'lı
 * dosyalar. Profil dışı OWL yapıları (restriction, union, vs.) yok sayılır;
 * gerekli bağlama yoksa net hata verilir.
 */

const OWL = 'http://www.w3.org/2002/07/owl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const { namedNode } = DataFactory;

export class OwlImportError extends Error {}

const XSD_TERS: Record<string, ColumnType> = {
  [XSD + 'string']: 'string',
  [XSD + 'integer']: 'integer',
  [XSD + 'double']: 'double',
  [XSD + 'boolean']: 'boolean',
  [XSD + 'date']: 'date',
  [XSD + 'dateTime']: 'timestamp',
};

export function turtleToExtension(ttl: string, baseUri?: string): OntologyExtension {
  let store: Store;
  try {
    store = new Store(new Parser().parse(ttl));
  } catch (e) {
    throw new OwlImportError(`Turtle ayrıştırılamadı: ${(e as Error).message}`);
  }

  // verim: base'i belirle (dosyadaki @prefix'ten ya da parametreden ya da vars.)
  const base = baseUri ?? tespitEtBase(store) ?? 'https://verim.local/ontoloji#';
  const V = (yerel: string) => base + yerel;

  const tekDeger = (s: string, p: string): string | undefined =>
    store.getQuads(namedNode(s), namedNode(p), null, null)[0]?.object.value;
  const localName = (uri: string) => (uri.startsWith(base) ? uri.slice(base.length) : uri);

  // --- sınıflar → tipler ---
  const objectTypes: OntologyExtension['objectTypes'] = [];
  for (const q of store.getQuads(null, namedNode(RDF + 'type'), namedNode(OWL + 'Class'), null)) {
    const s = q.subject.value;
    const apiName = tekDeger(s, V('apiName')) ?? localName(s);
    const datasetId = tekDeger(s, V('datasetId'));
    const primaryKey = tekDeger(s, V('primaryKey'));
    if (!datasetId || !primaryKey) {
      throw new OwlImportError(
        `Bağlama manifesti eksik — '${apiName}' tipinde verim:datasetId/verim:primaryKey yok`,
      );
    }
    objectTypes.push({
      apiName,
      displayName: tekDeger(s, RDFS + 'label') ?? apiName,
      pluralName: tekDeger(s, V('pluralName')) ?? apiName,
      icon: tekDeger(s, V('icon')),
      primaryKey,
      datasetId,
      properties: [],
    });
  }
  const tipByApi = new Map(objectTypes.map((t) => [t.apiName, t]));

  // --- datatype property'ler → özellikler (sahip tip = verim:apiName) ---
  for (const q of store.getQuads(null, namedNode(RDF + 'type'), namedNode(OWL + 'DatatypeProperty'), null)) {
    const s = q.subject.value;
    const sahipApi = tekDeger(s, V('apiName'));
    const kolon = tekDeger(s, V('kolon'));
    if (!sahipApi || !kolon) {
      throw new OwlImportError(`Bağlama manifesti eksik — bir özellikte verim:apiName/verim:kolon yok`);
    }
    const tip = tipByApi.get(sahipApi);
    if (!tip) continue; // sahibi bu uzantıda değilse (kernel özelliği) atla
    const rangeUri = tekDeger(s, RDFS + 'range') ?? XSD + 'string';
    tip.properties.push({
      apiName: kolon,
      displayName: tekDeger(s, RDFS + 'label') ?? kolon,
      type: XSD_TERS[rangeUri] ?? 'string',
    });
  }

  // --- object property'ler → linkler ---
  const linkTypes: OntologyExtension['linkTypes'] = [];
  for (const q of store.getQuads(null, namedNode(RDF + 'type'), namedNode(OWL + 'ObjectProperty'), null)) {
    const s = q.subject.value;
    const apiName = tekDeger(s, V('apiName')) ?? localName(s);
    const fromKey = tekDeger(s, V('fromKey'));
    const toKey = tekDeger(s, V('toKey'));
    const domain = tekDeger(s, RDFS + 'domain');
    const range = tekDeger(s, RDFS + 'range');
    if (!fromKey || !toKey || !domain || !range) {
      throw new OwlImportError(
        `Bağlama manifesti eksik — '${apiName}' linkinde verim:fromKey/toKey veya domain/range yok`,
      );
    }
    linkTypes.push({
      apiName,
      displayName: tekDeger(s, RDFS + 'label') ?? apiName,
      fromObjectType: localName(domain),
      toObjectType: localName(range),
      cardinality: (tekDeger(s, V('cardinality')) as 'one' | 'many') ?? 'many',
      fromKey,
      toKey,
    });
  }

  const aciklama = store
    .getQuads(null, namedNode(RDFS + 'comment'), null, null)[0]
    ?.object.value.slice(0, 500);

  return { aciklama, objectTypes, linkTypes };
}

/** @prefix verim: <...#> satırından base'i çıkar (yoksa undefined) */
function tespitEtBase(store: Store): string | undefined {
  // n3 prefix'i quad'a yansıtmaz; apiName annotation'ının predicate'inden türet
  const q = store.getQuads(null, null, null, null).find((x) => x.predicate.value.endsWith('#apiName'));
  return q ? q.predicate.value.replace(/apiName$/, '') : undefined;
}
