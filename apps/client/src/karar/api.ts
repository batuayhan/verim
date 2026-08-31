import { getToken, handleUnauthorized } from '../auth/auth';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface Tehdit {
  iz_no: string;
  siniflandirma: string;
  domain: string;
  tehdit_skoru: number;
  tehdit_onceligi: string;
  yaklasiyor: boolean;
  enlem: number;
  boylam: number;
}

export interface Secenek {
  angajmanTipi: string;
  varlik: string | null;
  varlikPk: string | null;
  varlikTipi: string | null;
  mesafeKm: number | null;
  kesismeDk: number | null;
  basariYuzde: number;
  risk: 'Düşük' | 'Orta' | 'Yüksek';
  roeUygun: boolean;
  gerekce: string[];
}
export interface CoaSonuc {
  hedef: string;
  roeDurumu: 'serbest' | 'kısıtlı' | 'yasak';
  roeIhlalleri: string[];
  secenekler: Secenek[];
  oneri: Secenek | null;
}

export interface DurumOzeti {
  ozet: string;
  toplam_iz: number;
  dagilim: {
    dusman: number;
    supheli: number;
    kritik_tehdit: number;
    yuksek_tehdit: number;
    yaklasan: number;
  };
  en_yuksek_tehditler: Array<Record<string, unknown>>;
  oncelikli_istihbarat: Array<Record<string, unknown>>;
}

// --- Senkronizasyon Matrisi (dost varlık × zaman penceresi) ---
export interface SenkSatir {
  id: string;
  baslik: string;
  altbaslik?: string;
  grup: string; // domain
  pk?: string;
  tip?: string;
}
export interface SenkSutun {
  id: string;
  baslik: string;
  aciklama?: string;
}
export interface SenkGorev {
  izNo: string;
  oncelik: string;
  skor: number;
  angajmanTipi: string;
  roeDurumu: string;
  basariYuzde: number;
}
export interface SenkHucre {
  satirId: string;
  sutunId: string;
  gorevler: SenkGorev[];
}
export interface SenkMatris {
  satirlar: SenkSatir[];
  sutunlar: SenkSutun[];
  hucreler: SenkHucre[];
  ozet: {
    gorevlendirilen_varlik: number;
    bosta_varlik: number;
    kapsanan_tehdit: number;
    planlanan_angajman: number;
    atanamayan_tehdit: number;
  };
}

export const getSenkronizasyon = (limit = 24) =>
  req<SenkMatris>(`/reasoning/senkronizasyon?limit=${limit}`);

export const getTehditler = (limit = 25) => req<Tehdit[]>(`/reasoning/tehditler?limit=${limit}`);
export const getDurum = (domain?: string) =>
  req<DurumOzeti>(`/reasoning/durum${domain ? `?domain=${encodeURIComponent(domain)}` : ''}`);
export const getCoa = (izNo: string) =>
  req<CoaSonuc | { hata: string }>('/reasoning/coa', {
    method: 'POST',
    body: JSON.stringify({ izNo }),
  });
