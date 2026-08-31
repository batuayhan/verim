import { Inject, Injectable } from '@nestjs/common';
import type { OntologyResponse } from '../contract/mercek';
import { DATASET_PROVIDER, type DatasetProvider } from '../datasets/dataset-provider';
import { ONTOLOGY_PROVIDER, type OntologyProvider } from './ontology-provider';

/**
 * GRAPH_PROVIDER portu — bağlantı analizi (komşuluk + kenarlar) için
 * İNDEKSLİ bir soyutlama. Object set motoru "sorgu anında" ilişki çözerken,
 * bu port ilişkileri önceden indekslenmiş bir kenar (adjacency) deposundan
 * okur: graf sorguları tarama değil, indeks-araması olur (Palantir link
 * store yaklaşımı).
 *
 *  - DummyGraphProvider: bellek-içi adjacency (açılışta datasetlerden kurulur)
 *  - MimGraphProvider: materyalize link_edge tablosu (indeksli) + iz telemetri
 *    linkleri için motor (mim/graph.provider.ts)
 */

export interface GraphNeighborNode {
  pk: string;
  label: string;
}
export interface GraphNeighborGroup {
  linkType: string;
  linkLabel: string;
  toObjectType: string;
  toDisplayName: string;
  icon?: string;
  total: number;
  nodes: GraphNeighborNode[];
}
export interface GraphNeighbors {
  focus: {
    objectType: string;
    pk: string;
    label: string;
    icon?: string;
    displayName: string;
  } | null;
  groups: GraphNeighborGroup[];
}
export interface GraphEdge {
  source: string; // "type::pk"
  target: string;
  label: string;
}
export interface GraphNodeRef {
  objectType: string;
  pk: string;
}

export interface GraphProvider {
  neighbors(objectType: string, pk: string, limit: number): Promise<GraphNeighbors>;
  edgesAmong(nodes: GraphNodeRef[]): Promise<GraphEdge[]>;
}

export const GRAPH_PROVIDER = Symbol('GRAPH_PROVIDER');

// --- ortak yardımcılar --------------------------------------------------------

export const LABEL_KEYS = ['ad', 'ad_soyad', 'cagri_adi', 'isim', 'name'];
export function labelOf(
  tip: OntologyResponse['objectTypes'][number],
  obj: Record<string, unknown>,
): string {
  for (const k of LABEL_KEYS) {
    if (obj[k] != null && obj[k] !== '') return String(obj[k]);
  }
  return String(obj[tip.primaryKey] ?? '?');
}
export const nid = (t: string, pk: string) => `${t}::${pk}`;

// --- Dummy: bellek-içi indeksli adjacency ------------------------------------

interface AdjEntry {
  linkType: string;
  toType: string;
  toPk: string;
  toLabel: string;
}

@Injectable()
export class DummyGraphProvider implements GraphProvider {
  constructor(
    @Inject(ONTOLOGY_PROVIDER) private readonly ontology: OntologyProvider,
    @Inject(DATASET_PROVIDER) private readonly datasets: DatasetProvider,
  ) {}

  private index: {
    adj: Map<string, AdjEntry[]>; // nid → giden komşular
    label: Map<string, string>; // nid → etiket
  } | null = null;

  /** İndeks bir kez kurulur (dummy veri statiktir) */
  private async build() {
    if (this.index) return this.index;
    const ontology = await this.ontology.getOntology();
    const tipByName = new Map(ontology.objectTypes.map((t) => [t.apiName, t]));

    // Tip → satırlar (pk'ye göre)
    const rowsByType = new Map<string, Map<string, Record<string, unknown>>>();
    for (const t of ontology.objectTypes) {
      const ds = await this.datasets.get(t.datasetId);
      const m = new Map<string, Record<string, unknown>>();
      for (const r of ds?.rows ?? []) m.set(String(r[t.primaryKey] ?? ''), r);
      rowsByType.set(t.apiName, m);
    }

    const adj = new Map<string, AdjEntry[]>();
    const label = new Map<string, string>();
    for (const [tName, rows] of rowsByType) {
      const tip = tipByName.get(tName)!;
      for (const [pk, row] of rows) label.set(nid(tName, pk), labelOf(tip, row));
    }

    // Her ilişki için anahtar-join ile adjacency kur
    for (const link of ontology.linkTypes) {
      const kaynakRows = rowsByType.get(link.fromObjectType);
      const hedefRows = rowsByType.get(link.toObjectType);
      const hedefTip = tipByName.get(link.toObjectType);
      if (!kaynakRows || !hedefRows || !hedefTip) continue;
      // Hedefleri toKey değerine göre indeksle
      const hedefIndex = new Map<string, string[]>();
      for (const [pk, row] of hedefRows) {
        const kv = String(row[link.toKey] ?? '');
        if (kv) (hedefIndex.get(kv) ?? hedefIndex.set(kv, []).get(kv)!).push(pk);
      }
      for (const [pk, row] of kaynakRows) {
        const kv = String(row[link.fromKey] ?? '');
        if (!kv) continue;
        const hedefler = hedefIndex.get(kv);
        if (!hedefler) continue;
        const sid = nid(link.fromObjectType, pk);
        const liste = adj.get(sid) ?? adj.set(sid, []).get(sid)!;
        for (const tpk of hedefler) {
          if (link.fromObjectType === link.toObjectType && tpk === pk) continue;
          liste.push({
            linkType: link.apiName,
            toType: link.toObjectType,
            toPk: tpk,
            toLabel: label.get(nid(link.toObjectType, tpk)) ?? tpk,
          });
        }
      }
    }
    this.index = { adj, label };
    return this.index;
  }

  async neighbors(objectType: string, pk: string, limit: number): Promise<GraphNeighbors> {
    const ontology = await this.ontology.getOntology();
    const tip = ontology.objectTypes.find((t) => t.apiName === objectType);
    if (!tip) return { focus: null, groups: [] };
    const { adj, label } = await this.build();
    const sid = nid(objectType, pk);
    const komsular = adj.get(sid) ?? [];
    // Link tipine göre grupla
    const byLink = new Map<string, AdjEntry[]>();
    for (const e of komsular) (byLink.get(e.linkType) ?? byLink.set(e.linkType, []).get(e.linkType)!).push(e);
    const groups: GraphNeighborGroup[] = [];
    for (const link of ontology.linkTypes.filter((l) => l.fromObjectType === objectType)) {
      const es = byLink.get(link.apiName);
      if (!es || es.length === 0) continue;
      const hedef = ontology.objectTypes.find((t) => t.apiName === link.toObjectType)!;
      groups.push({
        linkType: link.apiName,
        linkLabel: link.displayName,
        toObjectType: link.toObjectType,
        toDisplayName: hedef.pluralName,
        icon: hedef.icon,
        total: es.length,
        nodes: es.slice(0, limit).map((e) => ({ pk: e.toPk, label: e.toLabel })),
      });
    }
    return {
      focus: label.has(sid)
        ? { objectType, pk, label: label.get(sid)!, icon: tip.icon, displayName: tip.displayName }
        : null,
      groups,
    };
  }

  async edgesAmong(nodes: GraphNodeRef[]): Promise<GraphEdge[]> {
    const { adj } = await this.build();
    const inSet = new Set(nodes.map((n) => nid(n.objectType, n.pk)));
    const seen = new Set<string>();
    const edges: GraphEdge[] = [];
    for (const n of nodes) {
      const sid = nid(n.objectType, n.pk);
      for (const e of adj.get(sid) ?? []) {
        const tid = nid(e.toType, e.toPk);
        if (!inSet.has(tid)) continue;
        const key = [sid, tid].sort().join('~~');
        if (seen.has(key)) continue;
        seen.add(key);
        const link = (await this.ontology.getOntology()).linkTypes.find(
          (l) => l.apiName === e.linkType,
        );
        edges.push({ source: sid, target: tid, label: link?.displayName ?? e.linkType });
      }
    }
    return edges;
  }
}
