import { randomUUID } from 'node:crypto';
import type {
  ObjectSetDef,
  OntologyResponse,
  MercekAnalysis,
  MercekCard,
  MercekLayoutItem,
} from '../contract/mercek';

/**
 * Asistanın "analiz kur" aracının derleyicisi: LLM'in verdiği sade tarif
 * (kümeler = ObjectSetDef'ler + görseller) Mercek'in kart DAG'ına açılır.
 * Recursive def'in her düğümü bir karta karşılık gelir — kullanıcı analizi
 * açtığında zinciri aynen görür ve elle düzenleyebilir (kara kutu değil).
 */

export interface BuildGorsel {
  tip: 'grafik' | 'metrik' | 'zaman';
  kume: number; // kumeler dizisindeki indeks
  baslik?: string;
  groupBy?: string;
  /** grafik: ikinci boyut — yığılmış segmentler */
  segmentBy?: string;
  metricFn: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'countDistinct';
  metricProperty?: string;
  grafikTuru?: 'bar' | 'pie';
  dateProperty?: string;
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

export interface BuildInput {
  isim: string;
  kumeler: Array<{ ad?: string; def: ObjectSetDef }>;
  gorseller?: BuildGorsel[];
  dashboard?: boolean;
}

const CHIPS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function buildAnalysis(
  input: BuildInput,
  ontology: OntologyResponse,
): MercekAnalysis {
  const typeByName = new Map(ontology.objectTypes.map((t) => [t.apiName, t]));
  const linkByName = new Map(ontology.linkTypes.map((l) => [l.apiName, l]));

  const cards: MercekCard[] = [];
  const layout: Record<string, MercekLayoutItem> = {};
  let chipIdx = 0;
  const nextChip = () => `$${CHIPS[chipIdx++ % CHIPS.length]}`;
  let cardSeq = 0;
  const nextId = () => `k${++cardSeq}`;

  // Recursive def → kart zinciri; son kartın id'si döner
  const defToCards = (def: ObjectSetDef): string => {
    switch (def.type) {
      case 'base': {
        const t = typeByName.get(def.objectType);
        const id = nextId();
        cards.push({
          id,
          chip: nextChip(),
          kind: 'objectSet',
          title: `${t?.icon ?? ''} ${t?.pluralName ?? def.objectType}`.trim(),
          objectType: def.objectType,
        });
        return id;
      }
      case 'fromPrimaryKeys': {
        const t = typeByName.get(def.objectType);
        const id = nextId();
        cards.push({
          id,
          chip: nextChip(),
          kind: 'drilldown',
          title: `${t?.pluralName ?? def.objectType} (seçili ${def.keys.length})`,
          objectType: def.objectType,
          keys: def.keys,
          sourceCardId: '', // asistan tarifinde kaynak kart yok
        });
        return id;
      }
      case 'filter': {
        const inputId = defToCards(def.base);
        const id = nextId();
        cards.push({
          id,
          chip: nextChip(),
          kind: 'filter',
          title: `Filtre — ${def.conditions.map((c) => c.column).join(', ') || 'tümü'}`,
          inputId,
          combinator: def.combinator,
          conditions: def.conditions,
        });
        return id;
      }
      case 'searchAround': {
        const inputId = defToCards(def.base);
        const link = linkByName.get(def.linkType);
        const target = link ? typeByName.get(link.toObjectType) : undefined;
        const id = nextId();
        cards.push({
          id,
          chip: nextChip(),
          kind: 'searchAround',
          title: `${target?.icon ?? ''} ${link?.displayName ?? def.linkType}`.trim(),
          inputId,
          linkType: def.linkType,
        });
        return id;
      }
      case 'joinLinked': {
        const inputId = defToCards(def.base);
        const link = linkByName.get(def.linkType);
        const target = link ? typeByName.get(link.toObjectType) : undefined;
        const id = nextId();
        cards.push({
          id,
          chip: nextChip(),
          kind: 'joinLinked',
          title: `+ ${target?.displayName ?? def.linkType} kolonları`,
          inputId,
          linkType: def.linkType,
          columns: def.columns,
        });
        return id;
      }
    }
  };

  // Kümeler sol sütuna (x=0), görseller sağ sütuna (x=6) akar
  let leftY = 0;
  let rightY = 0;
  const leafIds: string[] = [];
  for (const kume of input.kumeler) {
    const before = cards.length;
    const leaf = defToCards(kume.def);
    leafIds.push(leaf);
    if (kume.ad) {
      const leafCard = cards.find((c) => c.id === leaf);
      if (leafCard) leafCard.title = kume.ad;
    }
    // zincirin kartlarını alt alta yerleştir
    for (const c of cards.slice(before)) {
      layout[c.id] = { x: 0, y: leftY, w: 6, h: 7 };
      leftY += 7;
    }
  }

  const widgetCardIds: string[] = [];
  for (const g of input.gorseller ?? []) {
    const inputId = leafIds[g.kume] ?? leafIds[0];
    if (!inputId) continue;
    const id = nextId();
    const metric = {
      fn: g.metricFn,
      property: g.metricFn === 'count' ? undefined : g.metricProperty,
    };
    if (g.tip === 'grafik') {
      cards.push({
        id,
        chip: nextChip(),
        kind: 'chart',
        title: g.baslik ?? `Grafik — ${g.groupBy ?? ''}`,
        inputId,
        chartType: g.grafikTuru ?? 'bar',
        groupBy: g.groupBy ?? '',
        segmentBy: g.segmentBy,
        metric,
      });
    } else if (g.tip === 'metrik') {
      cards.push({
        id,
        chip: nextChip(),
        kind: 'metric',
        title: g.baslik ?? 'Metrik',
        inputId,
        metric,
      });
    } else {
      cards.push({
        id,
        chip: nextChip(),
        kind: 'timeseries',
        title: g.baslik ?? `Zaman serisi — ${g.dateProperty ?? ''}`,
        inputId,
        dateProperty: g.dateProperty ?? '',
        metric,
        granularity: g.granularity ?? 'day',
      });
    }
    layout[id] = { x: 6, y: rightY, w: 6, h: g.tip === 'metrik' ? 5 : 7 };
    rightY += layout[id].h;
    widgetCardIds.push(id);
  }

  const analysis: MercekAnalysis = {
    id: `asistan-${randomUUID().slice(0, 8)}`,
    name: input.isim,
    cards,
    layout,
  };

  if (input.dashboard) {
    const source = widgetCardIds.length > 0 ? widgetCardIds : leafIds;
    analysis.dashboard = {
      title: input.isim,
      widgets: source.map((cardId, i) => ({
        id: `w${i + 1}`,
        cardId,
        title: cards.find((c) => c.id === cardId)?.title,
      })),
    };
  }

  return analysis;
}
