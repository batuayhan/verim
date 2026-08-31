import { getToken, handleUnauthorized } from '../auth/auth';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface GrafKomsu {
  pk: string;
  label: string;
}
export interface GrafGrup {
  linkType: string;
  linkLabel: string;
  toObjectType: string;
  toDisplayName: string;
  icon?: string;
  total: number;
  nodes: GrafKomsu[];
}
export interface GrafKomsular {
  focus: {
    objectType: string;
    pk: string;
    label: string;
    icon?: string;
    displayName: string;
  } | null;
  groups: GrafGrup[];
}

function headers() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Bir nesnenin tüm giden ilişkileri boyunca komşuları (bağlantı analizi) */
export async function fetchNeighbors(
  objectType: string,
  pk: string,
  limit = 12,
): Promise<GrafKomsular> {
  const res = await fetch(`${BASE_URL}/graph/neighbors`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ objectType, pk, limit }),
  });
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as GrafKomsular;
}

export interface GrafKenar {
  source: string;
  target: string;
  label: string;
}

/** Verilen düğüm kümesi içindeki TÜM kenarlar — canvas otomatik bağlanır */
export async function fetchEdges(
  nodes: Array<{ objectType: string; pk: string }>,
): Promise<GrafKenar[]> {
  if (nodes.length === 0) return [];
  const res = await fetch(`${BASE_URL}/graph/edges`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ nodes: nodes.slice(0, 80) }),
  });
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { edges: GrafKenar[] }).edges;
}
