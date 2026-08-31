/**
 * Mercek contract — ontoloji (object type + link) ve object set sorguları.
 *
 * Ontoloji, gelecekte MIP information model'den gelecek; şimdilik dummy
 * dataset'lerin üzerine tanımlı. ObjectSetDef recursive bir tanımdır:
 * kartlar zincirlendikçe def iç içe büyür, server tek seferde çözer.
 *
 * İki repoda senkron tutulur: verim-frontend/src/types ↔ verim-server/src/contract
 */

import type { FilterCondition } from './boards';
import type { ColumnType } from './schema';

// --- Ontoloji tanımı --------------------------------------------------------

export interface PropertyDef {
  apiName: string; // backing dataset kolonu
  displayName: string;
  type: ColumnType;
}

export interface ObjectTypeDef {
  apiName: string;
  displayName: string;
  pluralName: string;
  /** MUI ikon adı değil — basit bir emoji/etiket ipucu */
  icon?: string;
  primaryKey: string;
  properties: PropertyDef[];
  /** Dummy adapter'da backing dataset; MIP'te anlamsız olabilir */
  datasetId: string;
}

export interface LinkTypeDef {
  apiName: string;
  displayName: string; // "Siparişin ürünü"
  fromObjectType: string;
  toObjectType: string;
  cardinality: 'one' | 'many';
  /** from tarafındaki kolon = to tarafındaki kolon eşleşmesi */
  fromKey: string;
  toKey: string;
}

export interface OntologyResponse {
  objectTypes: ObjectTypeDef[];
  linkTypes: LinkTypeDef[];
}

// --- Object set tanımı (recursive) ------------------------------------------

export type ObjectSetDef =
  | { type: 'base'; objectType: string }
  | {
      type: 'filter';
      base: ObjectSetDef;
      combinator: 'and' | 'or';
      conditions: FilterCondition[];
    }
  | { type: 'searchAround'; base: ObjectSetDef; linkType: string }
  | {
      // Kümeyi değiştirmeden ilişkili nesnenin kolonlarını satır-bazlı ekler
      // (Mercek'ın "Join to linked objects" operasyonu)
      type: 'joinLinked';
      base: ObjectSetDef;
      linkType: string;
      /** Eklenecek karşı-taraf özellikleri */
      columns: string[];
    }
  | {
      type: 'fromPrimaryKeys'; // chart drill-down sonucu
      objectType: string;
      keys: Array<string | number>;
    };

// --- Sorgu istek/yanıtları ---------------------------------------------------

export interface ObjectSetLoadRequest {
  def: ObjectSetDef;
  parameters: Record<string, string | number | boolean | null>;
  limit?: number;
}

export interface ObjectSetLoadResponse {
  objectType: string;
  properties: PropertyDef[];
  objects: Array<Record<string, unknown>>;
  totalCount: number;
  truncated: boolean;
}

export type MercekMetricFn = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'countDistinct';

export interface MercekMetric {
  fn: MercekMetricFn;
  /** count için boş */
  property?: string;
}

export interface ObjectSetAggregateRequest {
  def: ObjectSetDef;
  parameters: Record<string, string | number | boolean | null>;
  groupBy?: string;
  segmentBy?: string;
  metric: MercekMetric;
  limit?: number;
}

export interface ObjectSetAggregateResponse {
  /** groupBy yoksa tek satır (group=null) */
  rows: Array<{ group: string | null; segment?: string | null; value: number }>;
  totalGroups: number;
}

export type TimeseriesGranularity = 'hour' | 'day' | 'week' | 'month';

export interface ObjectSetTimeseriesRequest {
  def: ObjectSetDef;
  parameters: Record<string, string | number | boolean | null>;
  dateProperty: string;
  metric: MercekMetric;
  granularity: TimeseriesGranularity;
}

export interface ObjectSetTimeseriesResponse {
  points: Array<{ t: string; value: number }>;
}

// --- Mercek analiz dokümanı (server için opak, tip frontend'in) --------------

export type MercekCardKind =
  | 'objectSet'
  | 'filter'
  | 'searchAround'
  | 'joinLinked'
  | 'chart'
  | 'metric'
  | 'timeseries'
  | 'drilldown';

export interface MercekCardBase {
  id: string;
  /** $A, $B... — değişken çipi */
  chip: string;
  title: string;
}

export type MercekCard =
  | (MercekCardBase & { kind: 'objectSet'; objectType: string })
  | (MercekCardBase & {
      kind: 'filter';
      inputId: string;
      combinator: 'and' | 'or';
      conditions: FilterCondition[];
    })
  | (MercekCardBase & { kind: 'searchAround'; inputId: string; linkType: string })
  | (MercekCardBase & {
      kind: 'joinLinked';
      inputId: string;
      linkType: string;
      columns: string[];
    })
  | (MercekCardBase & {
      kind: 'chart';
      inputId: string;
      chartType: 'bar' | 'pie';
      groupBy: string;
      segmentBy?: string;
      metric: MercekMetric;
    })
  | (MercekCardBase & { kind: 'metric'; inputId: string; metric: MercekMetric })
  | (MercekCardBase & {
      kind: 'timeseries';
      inputId: string;
      dateProperty: string;
      metric: MercekMetric;
      granularity: TimeseriesGranularity;
    })
  | (MercekCardBase & {
      kind: 'drilldown';
      objectType: string;
      keys: Array<string | number>;
      /** hangi karttan drill edildi (provenance) */
      sourceCardId: string;
    });

export interface MercekLayoutItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MercekParameter {
  id: string;
  /** Filtrelerde $name olarak kullanılır */
  name: string;
  value: string | number | boolean | null;
}

export interface MercekDashboardWidget {
  id: string;
  cardId: string;
  title?: string;
}

export interface MercekAnalysis {
  id: string;
  name: string;
  cards: MercekCard[];
  layout: Record<string, MercekLayoutItem>;
  /** Geriye uyum: eski dokümanlarda bulunmayabilir */
  parameters?: MercekParameter[];
  dashboard?: {
    title: string;
    widgets: MercekDashboardWidget[];
    layout?: Record<string, MercekLayoutItem>;
  };
}

export interface MercekAnalysisSummary {
  id: string;
  name: string;
  updatedAt: string;
  cardCount: number;
}
