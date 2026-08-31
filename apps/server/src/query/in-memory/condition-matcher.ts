/**
 * FilterCondition eşleştirme — hem Harman board engine'i hem Mercek
 * object set engine'i kullanır. Parametre çözümü ExpressionError'ın
 * __PARAM_MISSING__ kanalıyla üst katmana taşınır.
 */

import type { FilterCondition } from '../../contract/boards';
import { ApiError } from '../../common/api-error';
import type { Row } from '../../datasets/dataset-provider';
import { relativeIso } from '../relative-time';
import { ExpressionError } from './expression/parser';
import type { Params } from './expression/evaluator';

export function matchCondition(
  condition: FilterCondition,
  row: Row,
  params: Params,
): boolean {
  if (!(condition.column in row)) {
    throw ApiError.invalidBoard(`Unknown column: ${condition.column}`);
  }
  const cell = row[condition.column];
  const resolved = condition.values.map((v) => {
    if (v.kind === 'literal') return v.value;
    if (v.kind === 'relative') return relativeIso(v.unit, v.amount);
    if (!(v.name in params)) {
      throw new ExpressionError(`__PARAM_MISSING__${v.name}`);
    }
    return params[v.name];
  });

  const asStr = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return condition.caseSensitive ? s : s.toLowerCase();
  };
  const cmp = (a: unknown, b: unknown): number => {
    if (typeof a === 'number' || typeof b === 'number') {
      return Number(a) - Number(b);
    }
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  };

  switch (condition.operator) {
    case 'isNull': return cell === null || cell === undefined;
    case 'isNotNull': return cell !== null && cell !== undefined;
    case 'eq': return cell !== null && cmp(cell, resolved[0]) === 0;
    case 'neq': return cell === null || cmp(cell, resolved[0]) !== 0;
    case 'lt': return cell !== null && cmp(cell, resolved[0]) < 0;
    case 'lte': return cell !== null && cmp(cell, resolved[0]) <= 0;
    case 'gt': return cell !== null && cmp(cell, resolved[0]) > 0;
    case 'gte': return cell !== null && cmp(cell, resolved[0]) >= 0;
    case 'between':
      return (
        cell !== null &&
        cmp(cell, resolved[0]) >= 0 &&
        cmp(cell, resolved[1]) <= 0
      );
    case 'in':
      return resolved.some((v) => cell !== null && cmp(cell, v) === 0);
    case 'contains': return asStr(cell).includes(asStr(resolved[0]));
    case 'startsWith': return asStr(cell).startsWith(asStr(resolved[0]));
    case 'endsWith': return asStr(cell).endsWith(asStr(resolved[0]));
    case 'matchesRegex': {
      try {
        return new RegExp(
          String(resolved[0]),
          condition.caseSensitive ? '' : 'i',
        ).test(String(cell ?? ''));
      } catch {
        throw ApiError.invalidBoard(`Invalid regex: ${String(resolved[0])}`);
      }
    }
  }
}
