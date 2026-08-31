/**
 * Mercek çekirdek yardımcıları: kart → ObjectSetDef derlemesi, değişken
 * çipi üretimi, tip rozetleri ve bağımlılık yürüyüşleri.
 */

import type {
  ObjectSetDef,
  OntologyResponse,
  MercekAnalysis,
  MercekCard,
  MercekLayoutItem,
} from '../types/mercek';

/** Sıradaki boş değişken çipi: $A..$Z, sonra $A2, $B2... */
export function nextChip(cards: MercekCard[]): string {
  const used = new Set(cards.map((c) => c.chip));
  for (let round = 1; round < 10; round++) {
    for (let i = 0; i < 26; i++) {
      const chip = `$${String.fromCharCode(65 + i)}${round === 1 ? '' : round}`;
      if (!used.has(chip)) return chip;
    }
  }
  return `$X${cards.length}`;
}

export function findCard(analysis: MercekAnalysis, id: string): MercekCard | undefined {
  return analysis.cards.find((c) => c.id === id);
}

/** Kartın girdi kartı (varsa). */
export function inputOf(card: MercekCard): string | null {
  return 'inputId' in card ? card.inputId : null;
}

/**
 * Set üreten kartlar için ObjectSetDef derler. Chart/metric/timeseries
 * kartları kendi girdilerinin def'ini kullanır (aggregate server'da).
 * Zincir kırıksa (silinmiş girdi) null döner.
 */
export function buildDef(
  analysis: MercekAnalysis,
  cardId: string,
): ObjectSetDef | null {
  const card = findCard(analysis, cardId);
  if (!card) return null;

  switch (card.kind) {
    case 'objectSet':
      return { type: 'base', objectType: card.objectType };
    case 'drilldown':
      return {
        type: 'fromPrimaryKeys',
        objectType: card.objectType,
        keys: card.keys,
      };
    case 'filter': {
      const base = buildDef(analysis, card.inputId);
      if (!base) return null;
      // Yarım koşullar (özellik/değer seçilmemiş) sorguya gitmez —
      // kullanıcı formu doldururken kart hata yerine tam listeyi gösterir.
      const complete = card.conditions.filter(
        (c) =>
          c.column &&
          (c.values.length > 0 ||
            c.operator === 'isNull' ||
            c.operator === 'isNotNull'),
      );
      return {
        type: 'filter',
        base,
        combinator: card.combinator,
        conditions: complete,
      };
    }
    case 'searchAround': {
      const base = buildDef(analysis, card.inputId);
      if (!base) return null;
      return { type: 'searchAround', base, linkType: card.linkType };
    }
    case 'joinLinked': {
      const base = buildDef(analysis, card.inputId);
      if (!base) return null;
      return {
        type: 'joinLinked',
        base,
        linkType: card.linkType,
        columns: card.columns,
      };
    }
    case 'chart':
    case 'metric':
    case 'timeseries':
      return buildDef(analysis, card.inputId);
  }
}

/** Def'in sonuç nesne tipi (searchAround tip değiştirir). */
export function resultObjectType(
  analysis: MercekAnalysis,
  cardId: string,
  ontology: OntologyResponse,
): string | null {
  const card = findCard(analysis, cardId);
  if (!card) return null;
  switch (card.kind) {
    case 'objectSet':
    case 'drilldown':
      return card.objectType;
    case 'searchAround': {
      const link = ontology.linkTypes.find((l) => l.apiName === card.linkType);
      return link?.toObjectType ?? null;
    }
    case 'filter':
    case 'joinLinked': // tip aynı kalır, kolonlar eklenir
    case 'chart':
    case 'metric':
    case 'timeseries':
      return resultObjectType(analysis, card.inputId, ontology);
  }
}

/** Kart çıktı tipinin kullanıcıya görünen rozeti. */
export function outputBadge(card: MercekCard): string {
  switch (card.kind) {
    case 'objectSet':
    case 'filter':
    case 'searchAround':
    case 'joinLinked':
    case 'drilldown':
      return 'Nesne kümesi';
    case 'chart':
      return 'Grafik';
    case 'metric':
      return 'Sayı';
    case 'timeseries':
      return 'Zaman serisi';
  }
}

/** Set üreten kartlar zincirlenebilir; görsel kartlar uç noktadır. */
export function producesObjectSet(card: MercekCard): boolean {
  return ['objectSet', 'filter', 'searchAround', 'joinLinked', 'drilldown'].includes(
    card.kind,
  );
}

export function downstreamOf(analysis: MercekAnalysis, cardId: string): MercekCard[] {
  return analysis.cards.filter((c) => inputOf(c) === cardId);
}

/** Kart + tüm alt zinciri (silme için). */
export function withDescendants(analysis: MercekAnalysis, cardId: string): string[] {
  const ids = [cardId];
  for (const child of downstreamOf(analysis, cardId)) {
    ids.push(...withDescendants(analysis, child.id));
  }
  return ids;
}

const GRID_COLS = 12;

/**
 * Canvas'ta w×h boyutunda ilk boş yeri bulur — yeni kartlar hep en alta
 * yığılmak yerine mevcut boşlukları doldurur. Tercihen `near` kartının
 * hemen sağı/altı denenir (türetilen kart kaynağının yanına gelsin).
 */
export function findFreeSlot(
  layout: Record<string, MercekLayoutItem>,
  w: number,
  h: number,
  near?: MercekLayoutItem,
): MercekLayoutItem {
  const items = Object.values(layout);
  const collides = (x: number, y: number) =>
    items.some(
      (it) => x < it.x + it.w && x + w > it.x && y < it.y + it.h && y + h > it.y,
    );

  const candidates: Array<{ x: number; y: number }> = [];
  if (near) {
    candidates.push({ x: near.x + near.w, y: near.y }); // sağı
    candidates.push({ x: near.x, y: near.y + near.h }); // altı
  }
  for (const c of candidates) {
    if (c.x + w <= GRID_COLS && !collides(c.x, c.y)) return { ...c, w, h };
  }

  // soldan sağa, yukarıdan aşağıya ilk boşluk
  for (let y = 0; y < 500; y++) {
    for (let x = 0; x <= GRID_COLS - w; x++) {
      if (!collides(x, y)) return { x, y, w, h };
    }
  }
  return { x: 0, y: 500, w, h };
}
