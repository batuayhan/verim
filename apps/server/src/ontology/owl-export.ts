import type {
  LinkTypeDef,
  ObjectTypeDef,
  OntologyResponse,
  PropertyDef,
} from '../contract/mercek';
import type { ColumnType } from '../contract/schema';

/**
 * Ontoloji → OWL/Turtle dışa aktarımı (Sprint 1, ADR K3).
 *
 * Verim'in `OntologyResponse`'unu W3C standart bir ontoloji temsiline çevirir:
 *   objectType → owl:Class
 *   property   → owl:DatatypeProperty (rdfs:domain + xsd range)
 *   link       → owl:ObjectProperty  (rdfs:domain/range; one → FunctionalProperty)
 *
 * OWL "anlamı" taşır ama Verim'in ihtiyaç duyduğu VERİ-BAĞLAMA + SUNUM
 * bilgisini taşımaz (hangi view, hangi anahtar, hangi ikon). Bu bilgi
 * `verim:` annotation'larıyla eklenir — böylece dışa aktarım KAYIPSIZ ve
 * içe aktarım (Sprint 5) URI ayrıştırmaya bağlı kalmadan orijinali kurabilir.
 *
 * Bağlama annotation'ları:
 *   verim:datasetId, verim:primaryKey  (tipte)
 *   verim:apiName, verim:kolon         (özellik/tipin tam apiName'i)
 *   verim:fromKey, verim:toKey, verim:cardinality  (linkte)
 *   verim:icon, verim:pluralName       (sunum)
 *   verim:mimKaynak                    (opsiyonel MIM izlenebilirliği)
 */

export interface OwlExportOptions {
  /** Ontoloji base URI (kapalı ağ: verim.local). Sonu # ile biter. */
  baseUri?: string;
  /** apiName → MIM kaynak etiketi (yalnız mim backend; izlenebilirlik) */
  mimKaynak?: Record<string, string>;
}

const DEFAULT_BASE = 'https://verim.local/ontoloji#';

const XSD: Record<ColumnType, string> = {
  string: 'xsd:string',
  integer: 'xsd:integer',
  double: 'xsd:double',
  boolean: 'xsd:boolean',
  date: 'xsd:date',
  timestamp: 'xsd:dateTime',
};

/** Turtle string literal kaçışı */
function lit(s: string, lang?: string): string {
  const esc = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return lang ? `"${esc}"@${lang}` : `"${esc}"`;
}

/**
 * Turtle PN_LOCAL güvenli yerel ad. apiName'ler zaten [a-z0-9_-] (tip/özellik)
 * ve link'ler tire içerir — hepsi geçerli PN_LOCAL. Yine de beklenmedik
 * karakteri kaçır (ters-eğik çizgiyle) ki üretim asla bozulmasın.
 */
function local(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`);
}

/** Bir özelliğin global-benzersiz URI yerel adı: <tip>__<özellik> */
function propLocal(typeApi: string, propApi: string): string {
  return `${local(typeApi)}__${local(propApi)}`;
}

export function ontologyToTurtle(
  ontology: OntologyResponse,
  opts: OwlExportOptions = {},
): string {
  const base = opts.baseUri ?? DEFAULT_BASE;
  const mim = opts.mimKaynak ?? {};
  const L: string[] = [];

  // --- başlık: prefixler + ontoloji + verim: annotation property'leri ---
  L.push(`@prefix owl:   <http://www.w3.org/2002/07/owl#> .`);
  L.push(`@prefix rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .`);
  L.push(`@prefix rdfs:  <http://www.w3.org/2000/01/rdf-schema#> .`);
  L.push(`@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .`);
  L.push(`@prefix verim: <${base}> .`);
  L.push('');
  L.push(`<${base.replace(/#$/, '')}> a owl:Ontology ;`);
  L.push(`    rdfs:label ${lit('Verim Ontolojisi', 'tr')} ;`);
  L.push(
    `    rdfs:comment ${lit('Verim OntologyResponse dışa aktarımı — kavramlar OWL, veri-bağlama verim: annotation. Bkz. docs/KARAR_TRIPLE_VS_ILISKISEL.md', 'tr')} .`,
  );
  L.push('');
  // verim: annotation property'lerini bildir (Protégé temiz açsın)
  const annProps = [
    'datasetId', 'primaryKey', 'apiName', 'kolon',
    'fromKey', 'toKey', 'cardinality', 'icon', 'pluralName', 'mimKaynak',
  ];
  for (const a of annProps) L.push(`verim:${a} a owl:AnnotationProperty .`);
  L.push('');

  // --- nesne tipleri → owl:Class ---
  for (const t of ontology.objectTypes) {
    L.push(...classTurtle(t, mim[t.apiName]));
    for (const p of t.properties) L.push(...propertyTurtle(t, p));
    L.push('');
  }

  // --- ilişkiler → owl:ObjectProperty ---
  for (const l of ontology.linkTypes) L.push(...linkTurtle(l, mim[l.apiName]));

  return L.join('\n') + '\n';
}

function classTurtle(t: ObjectTypeDef, mimKaynak?: string): string[] {
  const out: string[] = [];
  out.push(`verim:${local(t.apiName)} a owl:Class ;`);
  out.push(`    rdfs:label ${lit(t.displayName, 'tr')} ;`);
  out.push(`    verim:apiName ${lit(t.apiName)} ;`);
  out.push(`    verim:pluralName ${lit(t.pluralName, 'tr')} ;`);
  if (t.icon) out.push(`    verim:icon ${lit(t.icon)} ;`);
  out.push(`    verim:datasetId ${lit(t.datasetId)} ;`);
  const son = mimKaynak ? ';' : '.';
  out.push(`    verim:primaryKey ${lit(t.primaryKey)} ${son}`);
  if (mimKaynak) out.push(`    verim:mimKaynak ${lit(mimKaynak)} .`);
  return out;
}

function propertyTurtle(t: ObjectTypeDef, p: PropertyDef): string[] {
  return [
    `verim:${propLocal(t.apiName, p.apiName)} a owl:DatatypeProperty ;`,
    `    rdfs:label ${lit(p.displayName, 'tr')} ;`,
    `    rdfs:domain verim:${local(t.apiName)} ;`,
    `    rdfs:range ${XSD[p.type]} ;`,
    `    verim:apiName ${lit(t.apiName)} ;`,
    `    verim:kolon ${lit(p.apiName)} .`,
  ];
}

function linkTurtle(l: LinkTypeDef, mimKaynak?: string): string[] {
  const out: string[] = [];
  const types = l.cardinality === 'one'
    ? 'owl:ObjectProperty , owl:FunctionalProperty'
    : 'owl:ObjectProperty';
  out.push(`verim:${local(l.apiName)} a ${types} ;`);
  out.push(`    rdfs:label ${lit(l.displayName, 'tr')} ;`);
  out.push(`    verim:apiName ${lit(l.apiName)} ;`);
  out.push(`    rdfs:domain verim:${local(l.fromObjectType)} ;`);
  out.push(`    rdfs:range verim:${local(l.toObjectType)} ;`);
  out.push(`    verim:cardinality ${lit(l.cardinality)} ;`);
  out.push(`    verim:fromKey ${lit(l.fromKey)} ;`);
  const son = mimKaynak ? ';' : '.';
  out.push(`    verim:toKey ${lit(l.toKey)} ${son}`);
  if (mimKaynak) out.push(`    verim:mimKaynak ${lit(mimKaynak)} .`);
  out.push('');
  return out;
}
