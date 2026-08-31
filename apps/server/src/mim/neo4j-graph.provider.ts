import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import neo4j, { type Driver } from 'neo4j-driver';
import {
  labelOf,
  nid,
  type GraphEdge,
  type GraphNeighborGroup,
  type GraphNeighbors,
  type GraphNodeRef,
  type GraphProvider,
} from '../ontology/graph-provider';
import {
  OBJECT_SET_ENGINE,
  type IObjectSetEngine,
} from '../ontology/object-set-engine';
import { ONTOLOGY_PROVIDER, type OntologyProvider } from '../ontology/ontology-provider';

/**
 * GRAPH_PROVIDER'ın GERÇEK graf veritabanı (Neo4j) implementasyonu.
 * Varlık ağı (birlik/platform/sensör/görev/personel) Neo4j'de tutulur ve
 * Cypher ile sorgulanır — bellek-içi değil, docker compose'daki gerçek
 * graf servisi. İz/gözlem telemetri linkleri graf DB'de değildir; onlar
 * zaman-serisi deposundan (motor / SqlObjectSetEngine) çözülür.
 */
const ENTITY = new Set(['birlik', 'platform', 'sensor', 'gorev', 'personel']);

@Injectable()
export class Neo4jGraphProvider implements GraphProvider, OnModuleDestroy {
  private readonly driver: Driver = neo4j.driver(
    process.env.NEO4J_URL ?? 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER ?? 'neo4j',
      process.env.NEO4J_PASSWORD ?? 'verim-graph',
    ),
  );

  constructor(
    @Inject(ONTOLOGY_PROVIDER) private readonly ontology: OntologyProvider,
    @Inject(OBJECT_SET_ENGINE) private readonly engine: IObjectSetEngine,
  ) {}

  async onModuleDestroy() {
    await this.driver.close();
  }

  private isEntity = (t: string) => ENTITY.has(t);

  async neighbors(objectType: string, pk: string, limit: number): Promise<GraphNeighbors> {
    const ontology = await this.ontology.getOntology();
    const tip = ontology.objectTypes.find((t) => t.apiName === objectType);
    if (!tip) return { focus: null, groups: [] };

    // Odak etiketi + tüm giden komşular tek Cypher sorgusuyla (entity linkler)
    const session = this.driver.session();
    const groups: GraphNeighborGroup[] = [];
    let focusLabel = pk;
    try {
      if (this.isEntity(objectType)) {
        const res = await session.run(
          `MATCH (a:Entity {id: $id})
           OPTIONAL MATCH (a)-[r:LINK]->(b:Entity)
           RETURN a.label AS focusLabel, r.tip AS linkType, r.label AS linkLabel,
                  b.tip AS toType, b.pk AS toPk, b.label AS toLabel`,
          { id: nid(objectType, pk) },
        );
        type Grp = { linkLabel: string; toType: string; nodes: Array<{ pk: string; label: string }> };
        const byLink = new Map<string, Grp>();
        for (const rec of res.records) {
          focusLabel = rec.get('focusLabel') ?? focusLabel;
          const lt = rec.get('linkType');
          if (!lt) continue;
          const g: Grp =
            byLink.get(lt) ?? { linkLabel: rec.get('linkLabel'), toType: rec.get('toType'), nodes: [] };
          g.nodes.push({ pk: rec.get('toPk'), label: rec.get('toLabel') });
          byLink.set(lt, g);
        }
        for (const link of ontology.linkTypes.filter((l) => l.fromObjectType === objectType)) {
          const g = byLink.get(link.apiName);
          if (!g) continue;
          const hedef = ontology.objectTypes.find((t) => t.apiName === link.toObjectType)!;
          groups.push({
            linkType: link.apiName,
            linkLabel: link.displayName,
            toObjectType: link.toObjectType,
            toDisplayName: hedef.pluralName,
            icon: hedef.icon,
            total: g.nodes.length,
            nodes: g.nodes.slice(0, limit),
          });
        }
      }
    } finally {
      await session.close();
    }

    // İz/gözlem içeren giden linkler graf DB'de yok → motorla çöz
    const izLinks = ontology.linkTypes.filter(
      (l) => l.fromObjectType === objectType && (!this.isEntity(l.fromObjectType) || !this.isEntity(l.toObjectType)),
    );
    if (izLinks.length > 0) {
      const base = { type: 'fromPrimaryKeys' as const, objectType, keys: [pk] };
      if (!this.isEntity(objectType)) {
        const fr = await this.engine.load({ def: base, parameters: {}, limit: 1 });
        if (fr.objects[0]) focusLabel = labelOf(tip, fr.objects[0]);
      }
      for (const link of izLinks) {
        const hedef = ontology.objectTypes.find((t) => t.apiName === link.toObjectType);
        if (!hedef) continue;
        const r = await this.engine.load({
          def: { type: 'searchAround', base, linkType: link.apiName },
          parameters: {},
          limit,
        });
        if (r.totalCount === 0) continue;
        groups.push({
          linkType: link.apiName,
          linkLabel: link.displayName,
          toObjectType: link.toObjectType,
          toDisplayName: hedef.pluralName,
          icon: hedef.icon,
          total: r.totalCount,
          nodes: r.objects.map((o) => ({ pk: String(o[hedef.primaryKey] ?? ''), label: labelOf(hedef, o) })),
        });
      }
    }

    return {
      focus: { objectType, pk, label: focusLabel, icon: tip.icon, displayName: tip.displayName },
      groups,
    };
  }

  async edgesAmong(nodes: GraphNodeRef[]): Promise<GraphEdge[]> {
    const ids = nodes.map((n) => nid(n.objectType, n.pk));
    const inSet = new Set(ids);
    const seen = new Set<string>();
    const edges: GraphEdge[] = [];

    // Varlık kenarları: tek Cypher — iki ucu da kümede olan LINK'ler
    const session = this.driver.session();
    try {
      const res = await session.run(
        `MATCH (a:Entity)-[r:LINK]->(b:Entity)
         WHERE a.id IN $ids AND b.id IN $ids
         RETURN a.id AS source, b.id AS target, r.label AS label`,
        { ids },
      );
      for (const rec of res.records) {
        const s = rec.get('source'), t = rec.get('target');
        const key = [s, t].sort().join('~~');
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ source: s, target: t, label: rec.get('label') });
      }
    } finally {
      await session.close();
    }

    // İz/gözlem içeren kenarlar: yalnız kümede iz/gözlem düğümü varsa motorla
    const izVar = nodes.some((n) => !this.isEntity(n.objectType));
    if (izVar) {
      const ontology = await this.ontology.getOntology();
      const rows = new Map<string, Record<string, unknown>>();
      const byType = new Map<string, string[]>();
      for (const n of nodes) (byType.get(n.objectType) ?? byType.set(n.objectType, []).get(n.objectType)!).push(n.pk);
      for (const [objectType, pks] of byType) {
        const tip = ontology.objectTypes.find((t) => t.apiName === objectType);
        if (!tip) continue;
        const r = await this.engine.load({
          def: { type: 'fromPrimaryKeys', objectType, keys: pks },
          parameters: {},
          limit: pks.length,
        });
        for (const o of r.objects) rows.set(nid(objectType, String(o[tip.primaryKey] ?? '')), o);
      }
      for (const link of ontology.linkTypes) {
        if (this.isEntity(link.fromObjectType) && this.isEntity(link.toObjectType)) continue;
        const kaynakPks = byType.get(link.fromObjectType);
        const hedefPks = byType.get(link.toObjectType);
        if (!kaynakPks || !hedefPks) continue;
        const idx = new Map<string, string[]>();
        for (const pk of hedefPks) {
          const kv = String(rows.get(nid(link.toObjectType, pk))?.[link.toKey] ?? '');
          if (kv) (idx.get(kv) ?? idx.set(kv, []).get(kv)!).push(nid(link.toObjectType, pk));
        }
        for (const pk of kaynakPks) {
          const sid = nid(link.fromObjectType, pk);
          const kv = String(rows.get(sid)?.[link.fromKey] ?? '');
          if (!kv) continue;
          for (const tid of idx.get(kv) ?? []) {
            if (sid === tid || !inSet.has(tid)) continue;
            const key = [sid, tid].sort().join('~~');
            if (seen.has(key)) continue;
            seen.add(key);
            edges.push({ source: sid, target: tid, label: link.displayName });
          }
        }
      }
    }
    return edges;
  }
}
