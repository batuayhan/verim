import type { ObjectSetDef, OntologyResponse } from '../contract/mercek';

/**
 * Def linter — LLM'in (veya herhangi bir istemcinin) ürettiği ObjectSetDef'i
 * motora gitmeden ontolojiye karşı TOPLU doğrular. Motor ilk hatada durur;
 * linter tüm sorunları en-yakın-isim önerileriyle birlikte döner ki LLM
 * kendini TEK denemede düzeltebilsin. ("izler" → "belki: iz" sınıfı hatalar
 * için erken tespit mekanizması.)
 */

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

function suggest(value: string, candidates: string[]): string {
  const best = candidates
    .map((c) => ({ c, d: levenshtein(value.toLowerCase(), c.toLowerCase()) }))
    .sort((x, y) => x.d - y.d)[0];
  const prefixMatch =
    best &&
    (value.toLowerCase().startsWith(best.c.toLowerCase()) ||
      best.c.toLowerCase().startsWith(value.toLowerCase().slice(0, 3)));
  return best && (best.d <= 4 || prefixMatch)
    ? ` — belki: '${best.c}'?`
    : ` — geçerli değerler: ${candidates.join(', ')}`;
}

/** Sorun listesi döner; boşsa def ontolojiyle tutarlıdır. */
export function lintObjectSetDef(
  def: ObjectSetDef,
  ontology: OntologyResponse,
): string[] {
  const typeByName = new Map(ontology.objectTypes.map((t) => [t.apiName, t]));
  const linkByName = new Map(ontology.linkTypes.map((l) => [l.apiName, l]));
  const typeNames = [...typeByName.keys()];
  const issues: string[] = [];

  /** Düğümü gez; düğümün SONUÇ tipini (bilinebiliyorsa) döner */
  const walk = (node: ObjectSetDef): string | null => {
    switch (node.type) {
      case 'base':
      case 'fromPrimaryKeys': {
        if (!typeByName.has(node.objectType)) {
          issues.push(
            `objectType '${node.objectType}' bilinmiyor${suggest(node.objectType, typeNames)}` +
              ` (dataset kimliği değil ontoloji tip adı kullanılır)`,
          );
          return null;
        }
        return node.objectType;
      }
      case 'filter': {
        const t = walk(node.base);
        if (t) {
          const cols = typeByName.get(t)!.properties.map((p) => p.apiName);
          for (const c of node.conditions) {
            // joinLinked sonrası eklenen hedefTip__kolon adları da geçerlidir
            if (!cols.includes(c.column) && !c.column.includes('__')) {
              issues.push(`'${t}' tipinde kolon '${c.column}' yok${suggest(c.column, cols)}`);
            }
          }
        }
        return t;
      }
      case 'searchAround':
      case 'joinLinked': {
        const t = walk(node.base);
        const link = linkByName.get(node.linkType);
        if (!link) {
          issues.push(
            `linkType '${node.linkType}' bilinmiyor${suggest(node.linkType, [...linkByName.keys()])}`,
          );
          return null;
        }
        if (t && link.fromObjectType !== t) {
          const uygun = ontology.linkTypes
            .filter((l) => l.fromObjectType === t)
            .map((l) => l.apiName);
          issues.push(
            `'${node.linkType}' ilişkisi '${link.fromObjectType}' tipinden başlar, küme ise '${t}'` +
              (uygun.length ? ` — '${t}' için uygun linkler: ${uygun.join(', ')}` : ''),
          );
        }
        if (node.type === 'joinLinked') {
          const target = typeByName.get(link.toObjectType);
          if (target) {
            const cols = target.properties.map((p) => p.apiName);
            for (const c of node.columns) {
              if (!cols.includes(c)) {
                issues.push(
                  `'${link.toObjectType}' tipinde kolon '${c}' yok${suggest(c, cols)}`,
                );
              }
            }
          }
          return t; // joinLinked tip değiştirmez
        }
        return link.toObjectType;
      }
    }
  };

  walk(def);
  return issues;
}

/** Def'in SONUÇ nesne tipini döner (bilinemiyorsa null) — panel başlıkları
    ve kolon doğrulaması aynı yürüyüşü paylaşır */
export function resultTypeOf(
  def: ObjectSetDef,
  ontology: OntologyResponse,
): string | null {
  const typeByName = new Map(ontology.objectTypes.map((t) => [t.apiName, t]));
  const linkByName = new Map(ontology.linkTypes.map((l) => [l.apiName, l]));
  const walk = (node: ObjectSetDef): string | null => {
    switch (node.type) {
      case 'base':
      case 'fromPrimaryKeys':
        return typeByName.has(node.objectType) ? node.objectType : null;
      case 'filter':
      case 'joinLinked':
        return walk(node.base);
      case 'searchAround':
        return linkByName.get(node.linkType)?.toObjectType ?? null;
    }
  };
  return walk(def);
}

/** Kolon adını sonuç tipine karşı doğrula (groupBy/dateProperty için) */
export function lintColumn(
  def: ObjectSetDef,
  column: string,
  ontology: OntologyResponse,
): string[] {
  // Sonuç tipini bul (lint zaten koşmuş varsayılır; sessizce tolere et)
  const typeByName = new Map(ontology.objectTypes.map((t) => [t.apiName, t]));
  const t = resultTypeOf(def, ontology);
  if (!t || column.includes('__')) return [];
  const cols = typeByName.get(t)!.properties.map((p) => p.apiName);
  if (!cols.includes(column)) {
    return [`'${t}' tipinde kolon '${column}' yok${suggest(column, cols)}`];
  }
  return [];
}
