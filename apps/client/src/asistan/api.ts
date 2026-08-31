import { getToken } from '../auth/auth';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface AssistantStep {
  tool: string;
  input: unknown;
  summary: string;
}
export type AssistantAction =
  | { type: 'mercek_ac'; analysisId: string; label: string }
  | { type: 'harman_ac'; analysisId: string; label: string }
  | { type: 'harita_goster'; params: Record<string, string>; label: string }
  | { type: 'alarmlar_ac'; label: string }
  | { type: 'dashboard_ac'; dashboardId: string; label: string }
  | { type: 'graf_ac'; objectType: string; pk: string; label: string };

/** Sohbet içi canlı panel — sunucudaki AssistantPanel ile birebir */
export type AssistantPanel =
  | {
      tip: 'tablo';
      baslik: string;
      def: unknown;
      columns: string[];
      rows: Array<Record<string, unknown>>;
      totalCount: number;
      konumlu: boolean;
    }
  | {
      tip: 'grafik';
      baslik: string;
      def: unknown;
      groupBy: string;
      segmentBy?: string;
      metric: { fn: string; property?: string };
      rows: Array<{ group: string | null; segment?: string | null; value: number }>;
    }
  | {
      tip: 'metrik';
      baslik: string;
      def: unknown;
      metric: { fn: string; property?: string };
      value: number;
    }
  | {
      tip: 'zaman';
      baslik: string;
      def: unknown;
      dateProperty: string;
      granularity: string;
      metric: { fn: string; property?: string };
      points: Array<{ t: string; value: number }>;
    };

export interface AssistantResult {
  answer: string;
  steps: AssistantStep[];
  actions: AssistantAction[];
  paneller?: AssistantPanel[];
}
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function headers() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface ManifestTool {
  name: string;
  title: string;
  category: 'sorgu' | 'mercek' | 'harman' | 'harita' | 'alarm' | 'dashboard' | 'graf';
  description: string;
  examples: string[];
}

export async function assistantManifest(): Promise<{ tools: ManifestTool[] }> {
  const res = await fetch(`${BASE_URL}/assistant/manifest`, { headers: headers() });
  if (!res.ok) return { tools: [] };
  return (await res.json()) as { tools: ManifestTool[] };
}

export async function assistantStatus(): Promise<{ available: boolean }> {
  const res = await fetch(`${BASE_URL}/assistant/status`, { headers: headers() });
  if (!res.ok) return { available: false };
  return (await res.json()) as { available: boolean };
}

/** Sohbetteki bir paneli kalıcı Mercek analizine çevirir → analiz id döner */
export async function panelToMercek(body: {
  isim: string;
  kumeler: Array<{ ad?: string; def: unknown }>;
  gorseller?: Array<Record<string, unknown>>;
}): Promise<{ analysisId: string; url: string }> {
  const res = await fetch(`${BASE_URL}/assistant/mercege-ac`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = ((await res.json()) as { message?: string }).message ?? msg;
    } catch {
      /* yut */
    }
    throw new Error(msg);
  }
  return (await res.json()) as { analysisId: string; url: string };
}

export async function assistantChat(
  messages: ChatMessage[],
  context?: { path?: string; planId?: string },
): Promise<AssistantResult> {
  const res = await fetch(`${BASE_URL}/assistant/chat`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ messages, now: new Date().toISOString(), context }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = ((await res.json()) as { message?: string }).message ?? msg;
    } catch {
      /* yut */
    }
    throw new Error(msg);
  }
  return (await res.json()) as AssistantResult;
}
