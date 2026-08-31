import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getToken, handleUnauthorized } from '../auth/auth';
import type { ObjectSetDef } from '../types/mercek';

/**
 * Birleşik dashboard (pano) API'si — sunucudaki dashboard-schema.ts ile
 * birebir. Platformda TEK dashboard sistemi vardır: 'sistem' sanaldır
 * (koddan üretilir, yazılamaz), kullanıcı dashboard'ları CRUD'ludur.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface Yerlesim {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type GadgetMetric = {
  fn: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'countDistinct';
  property?: string;
};

interface GadgetBase {
  id: string;
  baslik?: string;
  yerlesim: Yerlesim;
}
interface Pencereli {
  pencereDk?: number;
  pencereKolon?: string;
}

export type Gadget =
  | (GadgetBase &
      Pencereli & {
        tip: 'stat';
        def: ObjectSetDef;
        metric: GadgetMetric;
        renk?: 'primary' | 'error' | 'warning' | 'success' | 'secondary';
        link?: string;
      })
  | (GadgetBase &
      Pencereli & {
        tip: 'grafik';
        def: ObjectSetDef;
        groupBy: string;
        segmentBy?: string;
        metric: GadgetMetric;
        grafikTuru?: 'bar' | 'pie';
      })
  | (GadgetBase &
      Pencereli & {
        tip: 'zaman';
        def: ObjectSetDef;
        dateProperty: string;
        granularity: 'hour' | 'day' | 'week' | 'month';
        metric: GadgetMetric;
      })
  | (GadgetBase & Pencereli & { tip: 'tablo'; def: ObjectSetDef; limit?: number })
  | (GadgetBase &
      Pencereli & {
        tip: 'liste';
        def: ObjectSetDef;
        groupBy: string;
        metric: GadgetMetric;
        limit?: number;
      })
  | (GadgetBase &
      Pencereli & {
        tip: 'pivot';
        def: ObjectSetDef;
        groupBy: string;
        segmentBy: string;
        metric: GadgetMetric;
      })
  | (GadgetBase &
      Pencereli & {
        tip: 'dagilim';
        def: ObjectSetDef;
        xColumn: string;
        yColumn: string;
        limit?: number;
      })
  | (GadgetBase & { tip: 'harita'; siniflandirmalar?: string[]; pencereDk?: number })
  | (GadgetBase & { tip: 'alarmlar'; limit?: number })
  | (GadgetBase & { tip: 'analizler'; limit?: number })
  | (GadgetBase & { tip: 'senkronizasyon'; limit?: number })
  | (GadgetBase & { tip: 'asistan' })
  | (GadgetBase & { tip: 'harman_board'; analysisId: string; pathId: string; boardId: string })
  | (GadgetBase & { tip: 'mercek_kart'; analysisId: string; cardId: string });

export type GadgetTip = Gadget['tip'];

/** Gadget'ın id + yerleşim olmadan hali — union ÜYELERİ ayrı ayrı Omit'lenir
    (düz Omit<Gadget,...> discriminant'a özel alanları kaybederdi). */
export type GadgetConfig = Gadget extends infer G
  ? G extends Gadget
    ? Omit<G, 'id' | 'yerlesim'>
    : never
  : never;

export interface DashboardDoc {
  id: string;
  name: string;
  gadgets: Gadget[];
}

export interface DashboardSummary {
  id: string;
  name: string;
  updatedAt: string;
  gadgetCount: number;
  sistem: boolean;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = ((await res.json()) as { message?: string }).message ?? msg;
    } catch {
      /* yut */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const fetchDashboards = () =>
  req<{ dashboards: DashboardSummary[] }>('/dashboards');
export const fetchDashboard = (id: string) =>
  req<DashboardDoc>(`/dashboards/${encodeURIComponent(id)}`);
export const saveDashboard = (doc: DashboardDoc) =>
  req<{ id: string; updatedAt: string }>(`/dashboards/${encodeURIComponent(doc.id)}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });
export const deleteDashboard = (id: string) =>
  req<void>(`/dashboards/${encodeURIComponent(id)}`, { method: 'DELETE' });

export function useDashboards() {
  return useQuery({ queryKey: ['dashboards'], queryFn: fetchDashboards });
}

export function useDashboard(id: string) {
  return useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => fetchDashboard(id),
    retry: false,
  });
}

export function useInvalidateDashboards() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['dashboards'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function newDashboardId(): string {
  return `pano-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
