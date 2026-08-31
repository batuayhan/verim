import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Canlı mod — açıkken tüm veri sorguları periyodik tazelenir (Maven-tarzı
 * gerçek zamanlı resim). Sorgu hook'ları (mercek/api.ts, api/hooks.ts)
 * refetchInterval'i bu context'ten okur; sayfalara tek tek kablo çekilmez.
 */

// Poll aralığı — az-kaynaklı sunucuda "sorgu fırtınası"nı kırar. 3sn'de 3 uç ×
// (veri+count) sunucuyu boğuyordu; 12sn canlılık algısını korurken yükü ~4× düşürür.
// Harita (COP) doğası gereği daha sık ama yine de 3sn'den yumuşak.
const DEFAULT_INTERVAL_MS = 12000;
const HARITA_INTERVAL_MS = 6000;

interface LiveMode {
  live: boolean;
  setLive: (v: boolean) => void;
  /** TanStack Query refetchInterval değeri: kapalıyken false */
  refetchInterval: number | false;
}

const LiveModeContext = createContext<LiveMode>({
  live: false,
  setLive: () => undefined,
  refetchInterval: false,
});

export function LiveModeProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState(
    () => localStorage.getItem('verim_live') === '1',
  );
  const value = useMemo<LiveMode>(
    () => ({
      live,
      setLive: (v) => {
        localStorage.setItem('verim_live', v ? '1' : '0');
        setLive(v);
      },
      refetchInterval: live ? DEFAULT_INTERVAL_MS : false,
    }),
    [live],
  );
  return <LiveModeContext.Provider value={value}>{children}</LiveModeContext.Provider>;
}

export function useLiveMode(): LiveMode {
  return useContext(LiveModeContext);
}

/**
 * Alt ağacı her zaman canlı moda zorlar — Harita (COP) gibi doğası gereği
 * gerçek zamanlı sayfalar için. Üst bardaki anahtardan bağımsızdır.
 */
export function ForceLive({ children }: { children: ReactNode }) {
  const value = useMemo<LiveMode>(
    () => ({ live: true, setLive: () => undefined, refetchInterval: HARITA_INTERVAL_MS }),
    [],
  );
  return <LiveModeContext.Provider value={value}>{children}</LiveModeContext.Provider>;
}
