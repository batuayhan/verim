import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { resultTypeOf } from '../nesne/resultType';
import { useOntology } from '../mercek/api';
import type { ObjectSetDef } from '../types/mercek';

/**
 * PANO ÇAPRAZ FİLTRELEME (Palantir cross-filter karşılığı) — bir gadget'ta
 * bir değere tıkla (ör. grafikte "Hava" barı), def taşıyan TÜM diğer
 * gadget'lar o değere göre süzülür. Kaynak gadget'ın kendisi süzülmez
 * (seçim orada kalır); kolonu olmayan gadget'lar etkilenmez.
 */

export interface CaprazFiltre {
  kolon: string;
  deger: string;
  /** Filtreyi başlatan gadget — o gadget kendini süzmez */
  kaynakId: string;
  /** Okunaklı etiket (kaynak gadget başlığı vb.) */
  etiket?: string;
}

interface Ctx {
  filtre: CaprazFiltre | null;
  uygula: (f: CaprazFiltre) => void;
  temizle: () => void;
}

const CaprazCtx = createContext<Ctx>({ filtre: null, uygula: () => {}, temizle: () => {} });

export function CaprazFiltreProvider({ children }: { children: ReactNode }) {
  const [filtre, setFiltre] = useState<CaprazFiltre | null>(null);
  const value = useMemo<Ctx>(
    () => ({
      filtre,
      uygula: (f) =>
        // Aynı değere tekrar tıklama filtreyi kaldırır (toggle)
        setFiltre((prev) =>
          prev && prev.kolon === f.kolon && prev.deger === f.deger && prev.kaynakId === f.kaynakId
            ? null
            : f,
        ),
      temizle: () => setFiltre(null),
    }),
    [filtre],
  );
  return <CaprazCtx.Provider value={value}>{children}</CaprazCtx.Provider>;
}

export function useCaprazFiltre(): Ctx {
  return useContext(CaprazCtx);
}

/**
 * Bir gadget def'ine aktif çapraz filtreyi uygular — YALNIZ def'in sonuç
 * tipinde o kolon varsa ve gadget kaynak değilse. Uygulanamıyorsa def aynen
 * döner (o gadget etkilenmez).
 */
export function useCaprazDef(def: ObjectSetDef, gadgetId: string): ObjectSetDef {
  const { filtre } = useCaprazFiltre();
  const { data: ontology } = useOntology();
  return useMemo(() => {
    if (!filtre || filtre.kaynakId === gadgetId) return def;
    const tip = resultTypeOf(def, ontology);
    const kolonlar =
      ontology?.objectTypes.find((t) => t.apiName === tip)?.properties.map((p) => p.apiName) ?? [];
    if (!kolonlar.includes(filtre.kolon)) return def;
    return {
      type: 'filter',
      base: def,
      combinator: 'and',
      conditions: [
        {
          id: '__capraz',
          column: filtre.kolon,
          operator: 'eq',
          values: [{ kind: 'literal', value: filtre.deger }],
        },
      ],
    };
  }, [def, filtre, ontology, gadgetId]);
}
