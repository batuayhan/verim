/**
 * Mercek parametre bağlamı — kart gövdeleri sorgu atarken parametre
 * değerlerini buradan alır (prop drilling yerine context; dashboard
 * görünümü override'lı kendi provider'ını kurar).
 */

import { createContext, useContext } from 'react';

export interface MercekParams {
  /** Sorgulara giden ad → değer haritası */
  values: Record<string, string | number | boolean | null>;
  /** $ önerileri için parametre adları */
  names: string[];
}

const MercekParamsContext = createContext<MercekParams>({ values: {}, names: [] });

export const MercekParamsProvider = MercekParamsContext.Provider;

export function useMercekParams(): MercekParams {
  return useContext(MercekParamsContext);
}
