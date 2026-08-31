import type { ObjectSetDef } from '../types/mercek';

/**
 * Asistan/analiz → Harita devri: bir nesne KÜMESİNİ (ObjectSetDef) haritada
 * göstermek için sessionStorage üzerinden taşınır. Böylece "Haritada göster"
 * tek noktaya değil, seçili listenin TAMAMINA götürür; harita o an yalnız o
 * kümeyi çizer (canlı COP yerine).
 */
export interface HaritaSeti {
  def: ObjectSetDef;
  baslik: string;
  objectType: string;
}

const KEY = 'verim-harita-set';

export function setHaritaSeti(s: HaritaSeti): void {
  sessionStorage.setItem(KEY, JSON.stringify(s));
}

export function readHaritaSeti(): HaritaSeti | null {
  try {
    const r = sessionStorage.getItem(KEY);
    return r ? (JSON.parse(r) as HaritaSeti) : null;
  } catch {
    return null;
  }
}
