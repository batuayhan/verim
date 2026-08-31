import { getToken } from '../auth/auth';
import type { LinkTypeDef, ObjectTypeDef } from '../types/mercek';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface Uzanti {
  aciklama?: string;
  objectTypes: ObjectTypeDef[];
  linkTypes: LinkTypeDef[];
}
export interface OnizleSonuc {
  ext: Uzanti | null;
  rapor: AdmissionRapor;
  etkilenen: EtkilenenArtefakt[];
}

export interface Bulgu {
  kademe: number;
  kod: string;
  mesaj: string;
  konum?: string;
}
export interface KademeSonuc {
  kademe: number;
  ad: string;
  gecti: boolean;
  bulgular: Bulgu[];
}
export interface AdmissionRapor {
  gecti: boolean;
  kademeler: KademeSonuc[];
  durduranKademe?: number;
}
export interface EtkilenenArtefakt {
  silinen: string;
  artefakt: string;
  tur: string;
  id: string;
}
export interface YukleSonuc {
  surum?: number;
  rapor: AdmissionRapor;
  etkilenen: EtkilenenArtefakt[];
}

export type ExtDurum = 'taslak' | 'dogrulandi' | 'onayli' | 'aktif' | 'arsiv';
export interface UzantiSurum {
  surum: number;
  sha256: string;
  yukleyen: string;
  onaylayan?: string;
  durum: ExtDurum;
  zaman: string;
  not?: string;
  icerik: { aciklama?: string; objectTypes: unknown[]; linkTypes: unknown[] };
}
export interface DenetimKaydi {
  zaman: string;
  kim: string;
  eylem: string;
  surum?: number;
  sonuc: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    ...init,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const listeUzantilar = () =>
  req<{ surumler: UzantiSurum[]; aktif: number | null }>('/ontology/extensions');
export const denetimIzi = () => req<{ kayitlar: DenetimKaydi[] }>('/ontology/extensions/audit');

export const importTtl = (ttl: string) =>
  req<YukleSonuc>('/ontology/extensions/import', { method: 'POST', body: JSON.stringify({ ttl }) });
export const yukleJson = (json: unknown) =>
  req<YukleSonuc>('/ontology/extensions', { method: 'POST', body: JSON.stringify(json) });

/** Saklamadan önizle: TTL ya da JSON parse + kademe 1-4 raporu */
export const onizle = (girdi: { ttl: string } | { json: unknown }) =>
  req<OnizleSonuc>('/ontology/extensions/preview', { method: 'POST', body: JSON.stringify(girdi) });

export const onaylaSurum = (surum: number) =>
  req<{ ok: boolean; hata?: string }>(`/ontology/extensions/${surum}/approve`, { method: 'POST' });
export const aktiflestirSurum = (surum: number) =>
  req<{ ok: boolean; hata?: string; not?: string }>(`/ontology/extensions/${surum}/activate`, { method: 'POST' });
export const geriDon = () =>
  req<{ ok: boolean; surum?: number; hata?: string }>('/ontology/extensions/rollback', { method: 'POST' });
