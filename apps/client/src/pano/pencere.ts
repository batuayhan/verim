import { useEffect, useMemo, useState } from 'react';
import type { ObjectSetDef } from '../types/mercek';

/**
 * "Son N dakika" canlı penceresi: gadget def'i statik saklanır; pencere
 * çalışma zamanında pencereKolon >= (şimdi - pencereDk) filtresine açılır.
 * Başlangıç dakikaya yuvarlanır ki sorgu anahtarı her render'da değişmesin
 * (içerik zaten canlı modda tazelenir).
 */

export function useWindowStart(minutes: number | undefined): string | null {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!minutes) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [minutes]);
  return useMemo(() => {
    void tick;
    if (!minutes) return null;
    return new Date(Math.floor((Date.now() - minutes * 60_000) / 60_000) * 60_000).toISOString();
  }, [minutes, tick]);
}

export function withPencere(
  def: ObjectSetDef,
  windowStart: string | null,
  pencereKolon: string | undefined,
): ObjectSetDef {
  if (!windowStart || !pencereKolon) return def;
  return {
    type: 'filter',
    base: def,
    combinator: 'and',
    conditions: [
      {
        id: '__pencere',
        column: pencereKolon,
        operator: 'gte',
        values: [{ kind: 'literal', value: windowStart }],
      },
    ],
  };
}
