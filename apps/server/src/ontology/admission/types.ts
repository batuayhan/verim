/**
 * Kabul hattı (admission pipeline) ortak tipleri — Sprint 3.
 *
 * "Derlenmez" → "yüklenmez": koddaki derleyici+drift güvencesinin çalışma-zamanı
 * karşılığı. Bir aday uzantı sisteme AKTİFLEŞMEDEN önce 5 kademeden geçer
 * (Sprint 3: 1-3 mekanik doğrulama; Sprint 4: 4 etki analizi + 5 yönetişim).
 * Her bulgu insan-okur (mesaj) + makine-okur (kod/konum).
 */

export type KademeNo = 1 | 2 | 3 | 4 | 5;

export const KADEME_AD: Record<KademeNo, string> = {
  1: 'Sözdizimi',
  2: 'Bağlama bütünlüğü',
  3: 'Davranış smoke',
  4: 'Etki analizi',
  5: 'Yönetişim',
};

export interface Bulgu {
  kademe: KademeNo;
  kod: string; // makine-okur (ör. VIEW_YOK, KOLON_YOK, SMOKE_HATA)
  mesaj: string; // insan-okur (Türkçe)
  konum?: string; // ör. "tip:tesis" / "link:birlik-tesis" / "tip:tesis.ad"
}

export interface KademeSonuc {
  kademe: KademeNo;
  ad: string;
  gecti: boolean;
  bulgular: Bulgu[];
}

export interface AdmissionRapor {
  gecti: boolean;
  kademeler: KademeSonuc[];
  /** İlk BAŞARISIZ kademe (varsa) — sonraki kademeler koşulmadı */
  durduranKademe?: KademeNo;
}

export function sonuc(kademe: KademeNo, bulgular: Bulgu[]): KademeSonuc {
  return { kademe, ad: KADEME_AD[kademe], gecti: bulgular.length === 0, bulgular };
}
