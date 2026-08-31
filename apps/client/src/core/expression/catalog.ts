/**
 * Expression fonksiyon kataloğu — autocomplete, imza yardımı ve
 * kolay-mod builder'ları bunu kullanır. Server'daki mini expression
 * diliyle birebir aynı fonksiyon seti (parser.ts SCALAR_FNS/AGGREGATE_FNS).
 */

import type { ColumnType } from '../../types/schema';

export interface FunctionDoc {
  name: string;
  signature: string;
  description: string;
  aggregate: boolean;
  /** Kolay modda tek kolonlu şablon olarak sunulabilir mi? */
  simpleTemplate?: boolean;
  resultType: ColumnType;
}

export const FUNCTION_CATALOG: FunctionDoc[] = [
  // Skaler
  { name: 'upper', signature: 'upper(metin)', description: 'Büyük harfe çevirir', aggregate: false, simpleTemplate: true, resultType: 'string' },
  { name: 'lower', signature: 'lower(metin)', description: 'Küçük harfe çevirir', aggregate: false, simpleTemplate: true, resultType: 'string' },
  { name: 'length', signature: 'length(metin)', description: 'Karakter sayısı', aggregate: false, simpleTemplate: true, resultType: 'integer' },
  { name: 'concat', signature: "concat(a, b, …)", description: 'Metinleri birleştirir', aggregate: false, resultType: 'string' },
  { name: 'abs', signature: 'abs(sayı)', description: 'Mutlak değer', aggregate: false, simpleTemplate: true, resultType: 'double' },
  { name: 'round', signature: 'round(sayı, basamak?)', description: 'Yuvarlar', aggregate: false, simpleTemplate: true, resultType: 'double' },
  { name: 'floor', signature: 'floor(sayı)', description: 'Aşağı yuvarlar', aggregate: false, simpleTemplate: true, resultType: 'integer' },
  { name: 'ceil', signature: 'ceil(sayı)', description: 'Yukarı yuvarlar', aggregate: false, simpleTemplate: true, resultType: 'integer' },
  { name: 'coalesce', signature: 'coalesce(a, b, …)', description: 'İlk boş olmayan değeri döner', aggregate: false, resultType: 'string' },
  { name: 'if', signature: 'if(koşul, doğruysa, yanlışsa)', description: 'Koşullu değer', aggregate: false, resultType: 'string' },
  { name: 'year', signature: 'year(tarih)', description: 'Yılı çıkarır', aggregate: false, simpleTemplate: true, resultType: 'integer' },
  { name: 'month', signature: 'month(tarih)', description: 'Ayı çıkarır (1-12)', aggregate: false, simpleTemplate: true, resultType: 'integer' },
  { name: 'day', signature: 'day(tarih)', description: 'Günü çıkarır', aggregate: false, simpleTemplate: true, resultType: 'integer' },
  { name: 'hour', signature: 'hour(tarih)', description: 'Saati çıkarır', aggregate: false, simpleTemplate: true, resultType: 'integer' },
  // Aggregate
  { name: 'sum', signature: 'sum(kolon)', description: 'Toplam', aggregate: true, resultType: 'double' },
  { name: 'avg', signature: 'avg(kolon)', description: 'Ortalama', aggregate: true, resultType: 'double' },
  { name: 'min', signature: 'min(kolon)', description: 'En küçük', aggregate: true, resultType: 'double' },
  { name: 'max', signature: 'max(kolon)', description: 'En büyük', aggregate: true, resultType: 'double' },
  { name: 'count', signature: 'count()', description: 'Satır sayısı', aggregate: true, resultType: 'integer' },
  { name: 'count_distinct', signature: 'count_distinct(kolon)', description: 'Tekil değer sayısı', aggregate: true, resultType: 'integer' },
  { name: 'median', signature: 'median(kolon)', description: 'Medyan', aggregate: true, resultType: 'double' },
  { name: 'stddev', signature: 'stddev(kolon)', description: 'Standart sapma', aggregate: true, resultType: 'double' },
  { name: 'variance', signature: 'variance(kolon)', description: 'Varyans', aggregate: true, resultType: 'double' },
];

export const SCALAR_DOCS = FUNCTION_CATALOG.filter((f) => !f.aggregate);
export const AGGREGATE_DOCS = FUNCTION_CATALOG.filter((f) => f.aggregate);
