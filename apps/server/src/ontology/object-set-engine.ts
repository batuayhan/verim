import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import type {
  LinkTypeDef,
  PropertyDef,
  ObjectSetAggregateRequest,
  ObjectSetAggregateResponse,
  ObjectSetDef,
  ObjectSetLoadRequest,
  ObjectSetLoadResponse,
  ObjectSetTimeseriesRequest,
  ObjectSetTimeseriesResponse,
  ObjectTypeDef,
  MercekMetric,
  TimeseriesGranularity,
} from '../contract/mercek';
import {
  DATASET_PROVIDER,
  type DatasetProvider,
  type Row,
} from '../datasets/dataset-provider';
import { matchCondition } from '../query/in-memory/condition-matcher';
import { reduceAggregate, type Params } from '../query/in-memory/expression/evaluator';
import { ExpressionError } from '../query/in-memory/expression/parser';
import { ONTOLOGY_PROVIDER, type OntologyProvider } from './ontology-provider';

const DEFAULT_LIMIT = 500;

const METRIC_FN: Record<MercekMetric['fn'], string> = {
  count: 'count',
  countDistinct: 'count_distinct',
  sum: 'sum',
  avg: 'avg',
  min: 'min',
  max: 'max',
};

/**
 * Motor portu — controller bu arayüze bağlıdır. DATA_BACKEND=mip iken
 * SqlObjectSetEngine (pushdown), aksi halde in-memory ObjectSetEngine bağlanır.
 */
export interface IObjectSetEngine {
  load(req: ObjectSetLoadRequest): Promise<ObjectSetLoadResponse>;
  aggregate(req: ObjectSetAggregateRequest): Promise<ObjectSetAggregateResponse>;
  timeseries(req: ObjectSetTimeseriesRequest): Promise<ObjectSetTimeseriesResponse>;
}

export const OBJECT_SET_ENGINE = Symbol('OBJECT_SET_ENGINE');

interface Resolved {
  objectType: ObjectTypeDef;
  objects: Row[];
  /** joinLinked ile eklenen dinamik kolonlar */
  extraProperties?: PropertyDef[];
}

/**
 * ObjectSetDef çözücü — recursive tanımı gezerek nesne kümesini üretir.
 * MIP adapter'ı geldiğinde bu engine ya aynen kalır (MIP ham nesne verir)
 * ya da pushdown yapan bir implementasyonla değiştirilir; contract sabit.
 */
@Injectable()
export class ObjectSetEngine implements IObjectSetEngine {
  constructor(
    @Inject(DATASET_PROVIDER) private readonly datasets: DatasetProvider,
    @Inject(ONTOLOGY_PROVIDER) private readonly ontology: OntologyProvider,
  ) {}

  async load(req: ObjectSetLoadRequest): Promise<ObjectSetLoadResponse> {
    const resolved = await this.resolve(req.def, req.parameters);
    const limit = req.limit ?? DEFAULT_LIMIT;
    return {
      objectType: resolved.objectType.apiName,
      properties: [
        ...resolved.objectType.properties,
        ...(resolved.extraProperties ?? []),
      ],
      objects: resolved.objects.slice(0, limit),
      totalCount: resolved.objects.length,
      truncated: resolved.objects.length > limit,
    };
  }

  async aggregate(req: ObjectSetAggregateRequest): Promise<ObjectSetAggregateResponse> {
    const resolved = await this.resolve(req.def, req.parameters);
    const metricValues = (rows: Row[]): number => {
      const values =
        req.metric.fn === 'count'
          ? rows.map(() => 1)
          : rows.map((r) => r[req.metric.property!]);
      return Number(reduceAggregate(METRIC_FN[req.metric.fn], values) ?? 0);
    };

    if (!req.groupBy) {
      return {
        rows: [{ group: null, value: metricValues(resolved.objects) }],
        totalGroups: 1,
      };
    }

    const groups = new Map<string, Row[]>();
    for (const obj of resolved.objects) {
      const key = String(obj[req.groupBy] ?? '(boş)');
      const bucket = groups.get(key);
      if (bucket) bucket.push(obj);
      else groups.set(key, [obj]);
    }

    const limit = req.limit ?? 50;
    const rows: ObjectSetAggregateResponse['rows'] = [];

    for (const [group, groupRows] of groups) {
      if (req.segmentBy) {
        const segments = new Map<string, Row[]>();
        for (const obj of groupRows) {
          const seg = String(obj[req.segmentBy] ?? '(boş)');
          const bucket = segments.get(seg);
          if (bucket) bucket.push(obj);
          else segments.set(seg, [obj]);
        }
        for (const [segment, segRows] of segments) {
          rows.push({ group, segment, value: metricValues(segRows) });
        }
      } else {
        rows.push({ group, value: metricValues(groupRows) });
      }
    }

    rows.sort((a, b) => b.value - a.value);
    // grup bazında kes (segmentli satırlar grubuyla kalır)
    const keptGroups = new Set(
      [...groups.keys()]
        .map((g) => ({ g, total: metricValues(groups.get(g)!) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, limit)
        .map((x) => x.g),
    );

    return {
      rows: rows.filter((r) => r.group !== null && keptGroups.has(r.group)),
      totalGroups: groups.size,
    };
  }

  async timeseries(req: ObjectSetTimeseriesRequest): Promise<ObjectSetTimeseriesResponse> {
    const resolved = await this.resolve(req.def, req.parameters);

    const buckets = new Map<string, Row[]>();
    for (const obj of resolved.objects) {
      const raw = obj[req.dateProperty];
      if (raw === null || raw === undefined) continue;
      const date = new Date(String(raw));
      if (Number.isNaN(date.getTime())) continue;
      const key = bucketKey(date, req.granularity);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(obj);
      else buckets.set(key, [obj]);
    }

    const points = [...buckets.entries()]
      .map(([t, rows]) => {
        const values =
          req.metric.fn === 'count'
            ? rows.map(() => 1)
            : rows.map((r) => r[req.metric.property!]);
        return {
          t,
          value: Number(reduceAggregate(METRIC_FN[req.metric.fn], values) ?? 0),
        };
      })
      .sort((a, b) => a.t.localeCompare(b.t));

    return { points };
  }

  // --- çözümleme -------------------------------------------------------------

  private async resolve(def: ObjectSetDef, params: Params): Promise<Resolved> {
    const { objectTypes, linkTypes } = await this.ontology.getOntology();
    const typeByName = new Map(objectTypes.map((t) => [t.apiName, t]));
    const linkByName = new Map(linkTypes.map((l) => [l.apiName, l]));

    const loadType = async (apiName: string): Promise<Resolved> => {
      const objectType = typeByName.get(apiName);
      if (!objectType) {
        throw ApiError.invalidBoard(
          `Bilinmeyen nesne tipi: ${apiName}. Geçerli tipler: ${[...typeByName.keys()].join(', ')}. ` +
            `(Dataset kimliği değil ontoloji tip adı kullanılır — örn. 'izler' değil 'iz'.)`,
        );
      }
      const dataset = await this.datasets.get(objectType.datasetId);
      if (!dataset) throw ApiError.datasetNotFound(objectType.datasetId);
      return { objectType, objects: dataset.rows };
    };

    const walk = async (node: ObjectSetDef): Promise<Resolved> => {
      switch (node.type) {
        case 'base':
          return loadType(node.objectType);

        case 'fromPrimaryKeys': {
          const base = await loadType(node.objectType);
          const keys = new Set(node.keys.map(String));
          return {
            ...base,
            objects: base.objects.filter((o) =>
              keys.has(String(o[base.objectType.primaryKey])),
            ),
          };
        }

        case 'filter': {
          const base = await walk(node.base);
          try {
            const objects = base.objects.filter((obj) => {
              const results = node.conditions.map((c) =>
                matchCondition(c, obj, params),
              );
              if (results.length === 0) return true;
              return node.combinator === 'and'
                ? results.every(Boolean)
                : results.some(Boolean);
            });
            return { ...base, objects };
          } catch (error) {
            if (error instanceof ExpressionError) {
              const missing = /^__PARAM_MISSING__(.+)$/.exec(error.message);
              if (missing) throw ApiError.parameterMissing(missing[1]);
            }
            throw error;
          }
        }

        case 'joinLinked': {
          const base = await walk(node.base);
          const link = linkByName.get(node.linkType);
          if (!link) {
            throw ApiError.invalidBoard(`Bilinmeyen ilişki: ${node.linkType}`);
          }
          if (link.fromObjectType !== base.objectType.apiName) {
            throw ApiError.invalidBoard(
              `İlişki ${node.linkType}, ${base.objectType.apiName} tipinden başlamıyor`,
            );
          }
          const target = await loadType(link.toObjectType);
          const index = new Map<string, Row>();
          for (const row of target.objects) {
            const key = String(row[link.toKey]);
            if (!index.has(key)) index.set(key, row);
          }
          // Kolon adı çakışmasın diye hedef tip önekiyle eklenir
          const fieldKey = (col: string) => `${link.toObjectType}__${col}`;
          const objects = base.objects.map((row) => {
            const match = index.get(String(row[link.fromKey]));
            const extra: Row = {};
            for (const col of node.columns) {
              extra[fieldKey(col)] = match ? (match[col] ?? null) : null;
            }
            return { ...row, ...extra };
          });
          const extraProperties: PropertyDef[] = node.columns.map((col) => {
            const prop = target.objectType.properties.find((x) => x.apiName === col);
            return {
              apiName: fieldKey(col),
              displayName: `${target.objectType.displayName} → ${prop?.displayName ?? col}`,
              type: prop?.type ?? 'string',
            };
          });
          return {
            objectType: base.objectType,
            objects,
            extraProperties: [...(base.extraProperties ?? []), ...extraProperties],
          };
        }

        case 'searchAround': {
          const base = await walk(node.base);
          const link = linkByName.get(node.linkType);
          if (!link) {
            throw ApiError.invalidBoard(`Bilinmeyen ilişki: ${node.linkType}`);
          }
          if (link.fromObjectType !== base.objectType.apiName) {
            throw ApiError.invalidBoard(
              `İlişki ${node.linkType}, ${base.objectType.apiName} tipinden başlamıyor`,
            );
          }
          const target = await loadType(link.toObjectType);
          const wanted = new Set(
            base.objects.map((o) => String(o[link.fromKey])),
          );
          // hedefte eşleşenler, PK'ya göre tekilleştirilmiş
          const seen = new Set<string>();
          const objects = target.objects.filter((o) => {
            if (!wanted.has(String(o[link.toKey]))) return false;
            const pk = String(o[target.objectType.primaryKey]);
            if (seen.has(pk)) return false;
            seen.add(pk);
            return true;
          });
          return { objectType: target.objectType, objects };
        }
      }
    };

    return walk(def);
  }
}

function bucketKey(date: Date, granularity: TimeseriesGranularity): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  switch (granularity) {
    case 'hour': {
      const h = String(date.getUTCHours()).padStart(2, '0');
      return `${y}-${m}-${d} ${h}:00`;
    }
    case 'day':
      return `${y}-${m}-${d}`;
    case 'month':
      return `${y}-${m}`;
    case 'week': {
      // haftanın pazartesi başlangıcı
      const monday = new Date(date);
      const day = monday.getUTCDay() || 7;
      monday.setUTCDate(monday.getUTCDate() - day + 1);
      const wy = monday.getUTCFullYear();
      const wm = String(monday.getUTCMonth() + 1).padStart(2, '0');
      const wd = String(monday.getUTCDate()).padStart(2, '0');
      return `${wy}-${wm}-${wd}`;
    }
  }
}
