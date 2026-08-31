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

export type GorevTur =
  | 'kilometre_tasi'
  | 'hareket'
  | 'gorev'
  | 'angajman'
  | 'elektronik_harp'
  | 'kesif'
  | 'lojistik';
export type GorevDurum = 'planli' | 'onayli' | 'icrada' | 'tamam' | 'gecikme' | 'iptal';

export interface PlanGorev {
  id: string;
  ad: string;
  domain: string;
  varlikId?: string;
  varlikAd?: string;
  tur: GorevTur;
  baslangicDk: number;
  sureDk: number;
  durum: GorevDurum;
  gerekce?: string;
  kaynak?: string;
  hedefIz?: string;
  // TAKTİK görev kartı (ATO/OPORD karşılıkları) — hepsi opsiyonel
  gorevNo?: string; // görev numarası (SEAD-301)
  cagriAdi?: string; // çağrı adı (callsign)
  oncelik?: number; // P1 (en yüksek) .. P5
  istenenEtki?: IstenenEtki; // desired effect
  konum?: Konum; // görev icra noktası (CAP istasyonu / bölge merkezi)
  bolgeYaricapKm?: number; // görev bölgesi çemberi (killbox/ROZ benzeri)
  hedefKonum?: Konum; // sabit hedef koordinatı (DMPI benzeri)
  kontrolMakami?: string; // C2 ajansı (AWACS/CRC/JTAC…)
  frekans?: string; // muhabere kanalı
  muhimmat?: string; // silah/faydalı yük
}
export interface Konum {
  enlem: number;
  boylam: number;
}
export type IstenenEtki = 'imha' | 'etkisizlestirme' | 'baskilama' | 'tespit' | 'koruma' | 'aldatma';
export const ISTENEN_ETKI_AD: Record<IstenenEtki, string> = {
  imha: 'İmha',
  etkisizlestirme: 'Etkisizleştirme',
  baskilama: 'Baskılama (SEAD)',
  tespit: 'Tespit/Keşif',
  koruma: 'Koruma/Refakat',
  aldatma: 'Aldatma',
};
export interface Bagimlilik {
  oncekiId: string;
  sonrakiId: string;
  tur: 'FS' | 'SS';
  gecikmeDk: number;
}
export interface HarekatPlani {
  id: string;
  ad: string;
  tur: 'canli' | 'senaryo';
  temelPlanId?: string;
  hEsRefISO?: string;
  gorevler: PlanGorev[];
  bagimliliklar: Bagimlilik[];
  bazGorevler?: PlanGorev[]; // senaryonun dallanma anındaki dondurulmuş kopyası
  bazBagimliliklar?: Bagimlilik[];
  satirSirasi?: string[]; // operatörün satır sıralaması (sürükle-bırak)
}
export interface GorevHesap {
  esBaslangic: number;
  esBitis: number;
  gsBaslangic: number;
  gsBitis: number;
  bolluk: number;
  kritik: boolean;
}
export interface IhlalKaydi {
  oncekiId: string;
  sonrakiId: string;
  mesaj: string;
  gerekenBaslangicDk: number;
}
export interface CpmSonuc {
  hesaplar: Record<string, GorevHesap>;
  kritikYol: string[];
  kritikSayisi: number;
  projeSuresiDk: number;
  ihlaller: IhlalKaydi[];
  dongu: boolean;
}
export interface Cakisma {
  varlikId: string;
  varlikAd?: string;
  aId: string;
  aAd: string;
  bId: string;
  bAd: string;
  mesaj: string;
}
export interface SenkronPaket {
  plan: HarekatPlani;
  cpm: CpmSonuc;
  bitisDk: number;
  cakismalar?: Cakisma[];
  gecmis?: { geri: number; ileri: number }; // undo/redo yığın boyları
  kaydirilanlar?: Array<{ id: string; eski: number; yeni: number }>;
  emir?: { hedef: string; mesaj: string } | null;
  yeniGorev?: PlanGorev;
}
export interface Varlik {
  pk: string;
  ad: string;
  tip: string;
  domain: string;
}
export interface PlanFarki {
  degisiklikler: Array<{
    id: string;
    ad: string;
    tur: 'eklendi' | 'silindi' | 'kaydirildi' | 'sure_degisti';
    eskiBaslangicDk?: number;
    yeniBaslangicDk?: number;
    eskiSureDk?: number;
    yeniSureDk?: number;
  }>;
  eskiSureDk: number;
  yeniSureDk: number;
  kritikYolDegisti: boolean;
}
export interface PlanOzet {
  id: string;
  name: string;
  updatedAt: string;
  count: number;
}

const hata = (o: unknown): o is { hata: string } =>
  !!o && typeof o === 'object' && 'hata' in o;

export const getPlan = () => req<SenkronPaket>('/senkron/plan');
export const getPlanById = (id: string) => req<SenkronPaket>(`/senkron/plan/${encodeURIComponent(id)}`);
export const getPlanlar = () => req<PlanOzet[]>('/senkron/planlar');
export const kaydirGorev = (id: string, gorevId: string, baslangicDk: number) =>
  req<SenkronPaket>(`/senkron/plan/${encodeURIComponent(id)}/kaydir`, {
    method: 'POST',
    body: JSON.stringify({ gorevId, baslangicDk }),
  });
export const gorevDurum = (id: string, gorevId: string, durum: GorevDurum) =>
  req<SenkronPaket>(
    `/senkron/plan/${encodeURIComponent(id)}/gorev/${encodeURIComponent(gorevId)}/durum`,
    { method: 'POST', body: JSON.stringify({ durum }) },
  );
export const senaryoTuret = (ad?: string) =>
  req<SenkronPaket>('/senkron/senaryo', { method: 'POST', body: JSON.stringify({ ad }) });
export const getFark = (id: string) => req<PlanFarki>(`/senkron/plan/${encodeURIComponent(id)}/fark`);
export const sensorToShooter = (izNo: string, planId?: string) =>
  req<SenkronPaket | { hata: string }>('/senkron/sensor-to-shooter', {
    method: 'POST',
    body: JSON.stringify({ izNo, planId }),
  });
export const planSil = (id: string) =>
  req<{ silindi?: boolean; hata?: string }>(`/senkron/plan/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

// --- Düzenleme (CRUD + toplu + terfi) ---
export const getVarliklar = () => req<Varlik[]>('/senkron/varliklar');

// Plan geo (Kairos↔Gaia): görev noktaları + atıcı→hedef rotaları (GeoJSON)
export interface SenkronGeoProps {
  gorevId: string;
  ad: string;
  tur: GorevTur;
  durum: GorevDurum;
  baslangicDk: number;
  sureDk: number;
  varlikId: string | null;
  varlikAd: string | null;
  rol: 'gorev' | 'hedef' | 'rota';
  hedefIz?: string;
}
export interface SenkronGeo {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry:
      | { type: 'Point'; coordinates: [number, number] }
      | { type: 'LineString'; coordinates: [number, number][] };
    properties: SenkronGeoProps;
  }>;
}
export const getPlanGeo = (id = 'canli') =>
  req<SenkronGeo | { hata: string }>(`/senkron/plan/${encodeURIComponent(id)}/geo`);

const pid = (id: string) => encodeURIComponent(id);
export const gorevEkle = (id: string, g: Partial<PlanGorev>) =>
  req<SenkronPaket | { hata: string }>(`/senkron/plan/${pid(id)}/gorev`, {
    method: 'POST',
    body: JSON.stringify(g),
  });
// Taktik kart alanları null gönderilebilir ("null = alanı sil" sözleşmesi)
export type GorevYama = { [K in keyof PlanGorev]?: PlanGorev[K] | null };
export const gorevGuncelle = (id: string, gorevId: string, yama: GorevYama) =>
  req<SenkronPaket | { hata: string }>(`/senkron/plan/${pid(id)}/gorev/${pid(gorevId)}`, {
    method: 'PATCH',
    body: JSON.stringify(yama),
  });
export const gorevSil = (id: string, gorevId: string) =>
  req<SenkronPaket | { hata: string }>(`/senkron/plan/${pid(id)}/gorev/${pid(gorevId)}`, {
    method: 'DELETE',
  });
export const bagimlilikEkle = (
  id: string,
  dep: { oncekiId: string; sonrakiId: string; tur?: 'FS' | 'SS'; gecikmeDk?: number },
) =>
  req<SenkronPaket | { hata: string }>(`/senkron/plan/${pid(id)}/bagimlilik`, {
    method: 'POST',
    body: JSON.stringify(dep),
  });
export const bagimlilikSil = (id: string, oncekiId: string, sonrakiId: string) =>
  req<SenkronPaket | { hata: string }>(`/senkron/plan/${pid(id)}/bagimlilik/sil`, {
    method: 'POST',
    body: JSON.stringify({ oncekiId, sonrakiId }),
  });
export const topluKaydir = (id: string, deltaDk: number, domain?: string) =>
  req<SenkronPaket | { hata: string }>(`/senkron/plan/${pid(id)}/toplu-kaydir`, {
    method: 'POST',
    body: JSON.stringify({ deltaDk, domain }),
  });
export const planTerfi = (id: string) =>
  req<SenkronPaket | { hata: string }>(`/senkron/plan/${pid(id)}/terfi`, { method: 'POST' });
export const hSaatiAyarla = (id: string, iso: string) =>
  req<SenkronPaket | { hata: string }>(`/senkron/plan/${pid(id)}/h-saati`, {
    method: 'POST',
    body: JSON.stringify({ iso }),
  });
export const geriAl = (id: string) =>
  req<SenkronPaket | { hata: string }>(`/senkron/plan/${pid(id)}/geri`, { method: 'POST' });
export const ileriAl = (id: string) =>
  req<SenkronPaket | { hata: string }>(`/senkron/plan/${pid(id)}/ileri`, { method: 'POST' });
export const satirSirala = (id: string, sira: string[]) =>
  req<SenkronPaket | { hata: string }>(`/senkron/plan/${pid(id)}/satir-sirasi`, {
    method: 'POST',
    body: JSON.stringify({ sira }),
  });

export { hata as isHata };
