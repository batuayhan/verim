import type { ObjectSetDef, OntologyResponse } from '../types/mercek';

/**
 * Def'in SONUÇ nesne tipini döner (sunucudaki def-lint.resultTypeOf ile
 * aynı yürüyüş) — tablo satırına tıklanınca hangi tipin detayının
 * açılacağını belirler.
 */
export function resultTypeOf(
  def: ObjectSetDef | null,
  ontology: OntologyResponse | undefined,
): string | null {
  if (!def || !ontology) return null;
  const typeNames = new Set(ontology.objectTypes.map((t) => t.apiName));
  const linkByName = new Map(ontology.linkTypes.map((l) => [l.apiName, l]));
  const walk = (node: ObjectSetDef): string | null => {
    switch (node.type) {
      case 'base':
      case 'fromPrimaryKeys':
        return typeNames.has(node.objectType) ? node.objectType : null;
      case 'filter':
      case 'joinLinked':
        return walk(node.base);
      case 'searchAround':
        return linkByName.get(node.linkType)?.toObjectType ?? null;
    }
  };
  return walk(def);
}
