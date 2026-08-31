/**
 * Tip-farkındalıklı aggregation kuralları — kullanıcıya yalnızca
 * anlamlı seçenekler sunulur ("kullanıcı doğru seçenekleri seçmek
 * zorunda kalmalı"):
 *
 *   count / countDistinct → her tip
 *   sum / avg / median / stddev / variance → yalnızca sayısal
 *   min / max → sayısal + tarih (metin min/max acemi için anlamsız)
 *
 * Hem Harman board'ları hem Mercek kartları bu modülü kullanır.
 */

import type { AggregationFn } from '../types/boards';
import type { ColumnType } from '../types/schema';

const NUMERIC: ColumnType[] = ['integer', 'double'];
const TEMPORAL: ColumnType[] = ['date', 'timestamp'];

export const AGGREGATION_LABELS: Record<AggregationFn, string> = {
  count: 'Satır sayısı',
  countDistinct: 'Tekil sayısı',
  sum: 'Toplam',
  avg: 'Ortalama',
  min: 'En küçük',
  max: 'En büyük',
  median: 'Medyan',
  stddev: 'Std. sapma',
  variance: 'Varyans',
};

const NUMERIC_ONLY: AggregationFn[] = ['sum', 'avg', 'median', 'stddev', 'variance'];
const NUMERIC_OR_TEMPORAL: AggregationFn[] = ['min', 'max'];

/** Bu fonksiyon hangi kolon tiplerine uygulanabilir? */
export function typesForAggregation(fn: AggregationFn): ColumnType[] | 'any' {
  if (fn === 'count') return 'any';
  if (fn === 'countDistinct') return 'any';
  if (NUMERIC_ONLY.includes(fn)) return NUMERIC;
  if (NUMERIC_OR_TEMPORAL.includes(fn)) return [...NUMERIC, ...TEMPORAL];
  return 'any';
}

/** Eldeki kolon tiplerine göre sunulabilecek fonksiyonlar. */
export function allowedAggregations<T extends { type: ColumnType }>(
  columns: T[],
  candidates: AggregationFn[],
): AggregationFn[] {
  const present = new Set(columns.map((c) => c.type));
  return candidates.filter((fn) => {
    const types = typesForAggregation(fn);
    if (types === 'any') return true;
    return types.some((t) => present.has(t));
  });
}

/** Seçilen fonksiyon için geçerli kolonlar. */
export function columnsForAggregation<T extends { type: ColumnType }>(
  fn: AggregationFn,
  columns: T[],
): T[] {
  const types = typesForAggregation(fn);
  if (types === 'any') return columns;
  return columns.filter((c) => types.includes(c.type));
}
