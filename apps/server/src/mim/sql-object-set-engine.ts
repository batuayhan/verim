import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { relativeIso } from '../query/relative-time';
import type {
  LinkTypeDef,
  ObjectSetAggregateRequest,
  ObjectSetAggregateResponse,
  ObjectSetDef,
  ObjectSetLoadRequest,
  ObjectSetLoadResponse,
  ObjectSetTimeseriesRequest,
  ObjectSetTimeseriesResponse,
  ObjectTypeDef,
  PropertyDef,
  MercekMetric,
} from '../contract/mercek';
import type { FilterCondition } from '../contract/boards';
import type { Params } from '../query/in-memory/expression/evaluator';
import type { IObjectSetEngine } from '../ontology/object-set-engine';
import { ONTOLOGY_PROVIDER, type OntologyProvider } from '../ontology/ontology-provider';
import { mimDatasetById } from './mim-mapping';
import { SqlClient } from './sql-client';

const DEFAULT_LIMIT = 500;
const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

interface Compiled {
  /** Nesne kümesini üreten SELECT (alt sorgu olarak sarılabilir) */
  sql: string;
  objectType: ObjectTypeDef;
  extraProperties: PropertyDef[];
}

/**
 * ObjectSetDef → SQL derleyicisi (Mercek pushdown). In-memory motorla aynı
 * sözleşme; fark: filtre/ilişki/join/aggregate satırları belleğe çekmeden
 * veritabanında koşar — milyon satırlık iz tablosunda da çalışır.
 * Kolon adları ontoloji şemasına karşı doğrulanır (injection önlemi),
 * değerler her zaman bağlı parametre olarak gönderilir.
 */
@Injectable()
export class SqlObjectSetEngine implements IObjectSetEngine {
  constructor(
    private readonly sql: SqlClient,
    @Inject(ONTOLOGY_PROVIDER) private readonly ontology: OntologyProvider,
  ) {}

  async load(req: ObjectSetLoadRequest): Promise<ObjectSetLoadResponse> {
    const c = await this.compile(req.def, req.parameters);
    const params: unknown[] = [...c.params];
    const limit = req.limit ?? DEFAULT_LIMIT;
    // totalCount istenmiyorsa (iç çağrılar) count(*)'ı ATLA — v_iz gibi ağır
    // view'larda bu, her yükten 37M-satır seq-scan'i (1966ms) siler.
    const sayimIster = req.includeTotal !== false;

    const dataP = this.sql.query(`SELECT * FROM (${c.sql}) q LIMIT ${limit}`, params);
    const countP = sayimIster
      ? this.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${c.sql}) q`, params)
      : null;
    const [data, count] = await Promise.all([dataP, countP]);

    const properties = [...c.objectType.properties, ...c.extraProperties];
    const tsCols = properties.filter((p) => p.type === 'timestamp').map((p) => p.apiName);
    const objects = data.rows.map((r) => {
      const out: Record<string, unknown> = { ...r };
      for (const col of tsCols) {
        if (out[col] instanceof Date) out[col] = (out[col] as Date).toISOString();
      }
      return out;
    });

    // Sayım atlandıysa totalCount döndürülen satır sayısıdır; tam sayfa geldiyse
    // (rows === limit) daha fazlası olabilir → truncated muhafazakâr biçimde true.
    const totalCount = count ? count.rows[0].n : objects.length;
    const truncated = count ? count.rows[0].n > limit : objects.length >= limit;

    return {
      objectType: c.objectType.apiName,
      properties,
      objects,
      totalCount,
      truncated,
    };
  }

  async aggregate(req: ObjectSetAggregateRequest): Promise<ObjectSetAggregateResponse> {
    const c = await this.compile(req.def, req.parameters);
    const props = [...c.objectType.properties, ...c.extraProperties];
    const metric = metricSql(req.metric, props);

    if (!req.groupBy) {
      const r = await this.sql.query<{ value: number }>(
        `SELECT ${metric} AS value FROM (${c.sql}) q`,
        c.params,
      );
      return { rows: [{ group: null, value: Number(r.rows[0]?.value ?? 0) }], totalGroups: 1 };
    }

    const g = quoted(req.groupBy, props);
    const seg = req.segmentBy ? quoted(req.segmentBy, props) : null;
    const groupExpr = `coalesce((${g})::text, '(boş)')`;
    const segExpr = seg ? `coalesce((${seg})::text, '(boş)')` : null;

    const r = await this.sql.query<{ g: string; s?: string; value: number }>(
      segExpr
        ? `SELECT ${groupExpr} AS g, ${segExpr} AS s, ${metric} AS value FROM (${c.sql}) q GROUP BY 1, 2`
        : `SELECT ${groupExpr} AS g, ${metric} AS value FROM (${c.sql}) q GROUP BY 1`,
      c.params,
    );

    // In-memory motorla aynı son işleme: grup toplamına göre top-N grup tut
    const totals = new Map<string, number>();
    for (const row of r.rows) {
      totals.set(row.g, (totals.get(row.g) ?? 0) + Number(row.value));
    }
    const limit = req.limit ?? 50;
    const kept = new Set(
      [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map((x) => x[0]),
    );
    const rows = r.rows
      .filter((row) => kept.has(row.g))
      .map((row) =>
        segExpr
          ? { group: row.g, segment: row.s, value: Number(row.value) }
          : { group: row.g, value: Number(row.value) },
      )
      .sort((a, b) => b.value - a.value);

    return { rows, totalGroups: totals.size };
  }

  async timeseries(req: ObjectSetTimeseriesRequest): Promise<ObjectSetTimeseriesResponse> {
    const c = await this.compile(req.def, req.parameters);
    const props = [...c.objectType.properties, ...c.extraProperties];
    const dateCol = quoted(req.dateProperty, props);
    const bucket =
      req.granularity === 'month'
        ? `to_char(${dateCol} AT TIME ZONE 'UTC', 'YYYY-MM')`
        : req.granularity === 'week'
          ? `to_char(date_trunc('week', ${dateCol} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
          : req.granularity === 'hour'
            ? `to_char(${dateCol} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:00')`
            : `to_char(${dateCol} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
    const metric = metricSql(req.metric, props);

    const r = await this.sql.query<{ t: string; value: number }>(
      `SELECT ${bucket} AS t, ${metric} AS value
       FROM (${c.sql}) q
       WHERE ${dateCol} IS NOT NULL
       GROUP BY 1 ORDER BY 1`,
      c.params,
    );
    return { points: r.rows.map((p) => ({ t: p.t, value: Number(p.value) })) };
  }

  // --- derleme ---------------------------------------------------------------

  private async compile(
    def: ObjectSetDef,
    parameters: Params,
  ): Promise<Compiled & { params: unknown[] }> {
    const { objectTypes, linkTypes } = await this.ontology.getOntology();
    const typeByName = new Map(objectTypes.map((t) => [t.apiName, t]));
    const linkByName = new Map(linkTypes.map((l) => [l.apiName, l]));
    const params: unknown[] = [];
    const bind = (v: unknown): string => {
      params.push(v);
      return `$${params.length}`;
    };

    const viewOf = (t: ObjectTypeDef): string => {
      const m = mimDatasetById.get(t.datasetId);
      if (!m) throw ApiError.datasetNotFound(t.datasetId);
      return m.view;
    };
    const typeOf = (apiName: string): ObjectTypeDef => {
      const t = typeByName.get(apiName);
      if (!t)
        throw ApiError.invalidBoard(
          `Bilinmeyen nesne tipi: ${apiName}. Geçerli tipler: ${[...typeByName.keys()].join(', ')}. ` +
            `(Dataset kimliği değil ontoloji tip adı kullanılır — örn. 'izler' değil 'iz'.)`,
        );
      return t;
    };
    const linkOf = (apiName: string): LinkTypeDef => {
      const l = linkByName.get(apiName);
      if (!l) throw ApiError.invalidBoard(`Bilinmeyen ilişki: ${apiName}`);
      return l;
    };

    const walk = (node: ObjectSetDef): Compiled => {
      switch (node.type) {
        case 'base': {
          const t = typeOf(node.objectType);
          return { sql: `SELECT * FROM ${viewOf(t)}`, objectType: t, extraProperties: [] };
        }
        case 'fromPrimaryKeys': {
          const t = typeOf(node.objectType);
          const pk = quoted(t.primaryKey, t.properties);
          const arr = bind(node.keys.map(String));
          return {
            sql: `SELECT * FROM ${viewOf(t)} WHERE (${pk})::text = ANY(${arr}::text[])`,
            objectType: t,
            extraProperties: [],
          };
        }
        case 'filter': {
          const base = walk(node.base);
          const props = [...base.objectType.properties, ...base.extraProperties];
          const clauses = node.conditions.map((cond) =>
            conditionSql(cond, props, parameters, bind),
          );
          if (clauses.length === 0) return base;
          const glue = node.combinator === 'and' ? ' AND ' : ' OR ';
          return {
            ...base,
            sql: `SELECT * FROM (${base.sql}) f WHERE ${clauses.join(glue)}`,
          };
        }
        case 'searchAround': {
          const base = walk(node.base);
          const link = linkOf(node.linkType);
          assertLinkFrom(link, base.objectType);
          const target = typeOf(link.toObjectType);
          const toKey = quoted(link.toKey, target.properties);
          const fromKey = quoted(link.fromKey, [
            ...base.objectType.properties,
            ...base.extraProperties,
          ]);
          return {
            sql: `SELECT * FROM ${viewOf(target)} s WHERE s.${toKey} IN (SELECT b.${fromKey} FROM (${base.sql}) b)`,
            objectType: target,
            extraProperties: [],
          };
        }
        case 'joinLinked': {
          const base = walk(node.base);
          const link = linkOf(node.linkType);
          assertLinkFrom(link, base.objectType);
          const target = typeOf(link.toObjectType);
          const toKey = quoted(link.toKey, target.properties);
          const fromKey = quoted(link.fromKey, [
            ...base.objectType.properties,
            ...base.extraProperties,
          ]);
          const selects: string[] = [];
          const extras: PropertyDef[] = [];
          for (const col of node.columns) {
            const prop = target.properties.find((p) => p.apiName === col);
            const alias = `${link.toObjectType}__${col}`;
            if (!IDENT.test(alias)) {
              throw ApiError.invalidBoard(`Geçersiz kolon adı: ${col}`);
            }
            selects.push(prop ? `jt."${col}" AS "${alias}"` : `NULL AS "${alias}"`);
            extras.push({
              apiName: alias,
              displayName: `${target.displayName} → ${prop?.displayName ?? col}`,
              type: prop?.type ?? 'string',
            });
          }
          return {
            sql: `SELECT b.*, ${selects.join(', ')}
                  FROM (${base.sql}) b
                  LEFT JOIN (SELECT DISTINCT ON (${toKey}) * FROM ${viewOf(target)}) jt
                    ON jt.${toKey} = b.${fromKey}`,
            objectType: base.objectType,
            extraProperties: [...base.extraProperties, ...extras],
          };
        }
      }
    };

    const compiled = walk(def);
    return { ...compiled, params };
  }
}

// --- yardımcılar ---------------------------------------------------------------

function assertLinkFrom(link: LinkTypeDef, from: ObjectTypeDef): void {
  if (link.fromObjectType !== from.apiName) {
    throw ApiError.invalidBoard(
      `İlişki ${link.apiName}, ${from.apiName} tipinden başlamıyor`,
    );
  }
}

/** Kolonu şemaya karşı doğrula ve güvenli biçimde tırnakla. */
function quoted(column: string, props: PropertyDef[]): string {
  const prop = props.find((p) => p.apiName === column);
  if (!prop || !IDENT.test(column)) {
    throw ApiError.invalidBoard(`Unknown column: ${column}`);
  }
  return `"${column}"`;
}

function propType(column: string, props: PropertyDef[]): PropertyDef['type'] {
  return props.find((p) => p.apiName === column)?.type ?? 'string';
}

function metricSql(metric: MercekMetric, props: PropertyDef[]): string {
  if (metric.fn === 'count') return 'count(*)::float8';
  const col = quoted(metric.property ?? '', props);
  const t = propType(metric.property ?? '', props);
  const num =
    t === 'timestamp' || t === 'date'
      ? `extract(epoch FROM (${col})::timestamptz)`
      : `(${col})::float8`;
  switch (metric.fn) {
    case 'countDistinct': return `count(DISTINCT ${col})::float8`;
    case 'sum': return `coalesce(sum(${num}), 0)`;
    case 'avg': return `coalesce(avg(${num}), 0)`;
    case 'min': return `coalesce(min(${num}), 0)`;
    case 'max': return `coalesce(max(${num}), 0)`;
  }
}

/** Tek koşulu SQL'e çevirir — in-memory matchCondition ile aynı semantik. */
export function conditionSql(
  cond: FilterCondition,
  props: PropertyDef[],
  requestParams: Params,
  bind: (v: unknown) => string,
): string {
  const col = quoted(cond.column, props);
  const t = propType(cond.column, props);

  const resolved = cond.values.map((v) => {
    if (v.kind === 'literal') return v.value;
    if (v.kind === 'relative') return relativeIso(v.unit, v.amount);
    if (!(v.name in requestParams)) throw ApiError.parameterMissing(v.name);
    return requestParams[v.name];
  });

  // Sayısal kolonlarda değer float8'e, zaman kolonlarında timestamptz'e bağlanır
  const lhs =
    t === 'integer' || t === 'double'
      ? `(${col})::float8`
      : t === 'timestamp' || t === 'date'
        ? `(${col})::timestamptz`
        : `(${col})::text`;
  const rhs = (v: unknown): string =>
    t === 'integer' || t === 'double'
      ? `(${bind(v)})::float8`
      : t === 'timestamp' || t === 'date'
        ? `(${bind(v)})::timestamptz`
        : `(${bind(v)})::text`;

  const likePattern = (v: unknown, pre: string, post: string): string => {
    const escaped = String(v ?? '').replace(/[\\%_]/g, (m) => `\\${m}`);
    return bind(`${pre}${escaped}${post}`);
  };
  const likeOp = cond.caseSensitive ? 'LIKE' : 'ILIKE';

  switch (cond.operator) {
    case 'isNull': return `${col} IS NULL`;
    case 'isNotNull': return `${col} IS NOT NULL`;
    case 'eq': return `${lhs} = ${rhs(resolved[0])}`;
    case 'neq': return `(${col} IS NULL OR ${lhs} <> ${rhs(resolved[0])})`;
    case 'lt': return `${lhs} < ${rhs(resolved[0])}`;
    case 'lte': return `${lhs} <= ${rhs(resolved[0])}`;
    case 'gt': return `${lhs} > ${rhs(resolved[0])}`;
    case 'gte': return `${lhs} >= ${rhs(resolved[0])}`;
    case 'between':
      return `(${lhs} >= ${rhs(resolved[0])} AND ${lhs} <= ${rhs(resolved[1])})`;
    case 'in': {
      if (resolved.length === 0) return 'FALSE';
      return `${lhs} IN (${resolved.map((v) => rhs(v)).join(', ')})`;
    }
    case 'contains':
      return `(${col})::text ${likeOp} ${likePattern(resolved[0], '%', '%')} ESCAPE '\\'`;
    case 'startsWith':
      return `(${col})::text ${likeOp} ${likePattern(resolved[0], '', '%')} ESCAPE '\\'`;
    case 'endsWith':
      return `(${col})::text ${likeOp} ${likePattern(resolved[0], '%', '')} ESCAPE '\\'`;
    case 'matchesRegex':
      return `(${col})::text ${cond.caseSensitive ? '~' : '~*'} ${bind(String(resolved[0]))}`;
  }
}
