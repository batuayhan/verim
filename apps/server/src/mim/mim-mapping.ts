/**
 * Verim dataset'leri ↔ MIP staging view'ları eşlemesi.
 * Kolon tanımları dummy üreticiyle birebir aynıdır (apiName'ler frontend
 * contract'ının parçası). Gerçek MIP replikasına geçişte view adları /
 * views.sql değişir, bu dosya ve frontend sabit kalır.
 */

import type { ColumnSchema } from '../contract/schema';

export interface MimDatasetMapping {
  id: string;
  label: string;
  view: string;
  /** Deterministik sıralama ve fromPrimaryKeys için */
  pk: string;
  columns: ColumnSchema[];
}

const col = (
  name: string,
  type: ColumnSchema['type'],
  nullable = false,
): ColumnSchema => ({ name, type, nullable });

export const MIM_DATASETS: MimDatasetMapping[] = [
  {
    id: 'birlikler', label: 'Birlikler', view: 'v_birlik', pk: 'birlik_no',
    columns: [
      col('birlik_no', 'string'), col('ad', 'string'), col('domain', 'string'),
      col('kademe', 'string'), col('bolge', 'string'), col('durum', 'string'),
      col('personel', 'integer'), col('hazirlik_orani', 'integer'),
      col('komutan_no', 'string', true), col('us_adi', 'string'),
    ],
  },
  {
    id: 'platformlar', label: 'Platformlar', view: 'v_platform', pk: 'platform_no',
    columns: [
      col('platform_no', 'string'), col('cagri_adi', 'string'), col('tip', 'string'),
      col('domain', 'string'), col('birlik_no', 'string'), col('durum', 'string'),
      col('yakit_orani', 'integer'), col('surat_knot', 'integer'),
      col('enlem', 'double'), col('boylam', 'double'),
      col('kuyruk_no', 'string'), col('uretici', 'string'),
    ],
  },
  {
    id: 'gorevler', label: 'Görevler', view: 'v_gorev', pk: 'gorev_no',
    columns: [
      col('gorev_no', 'string'), col('tip', 'string'), col('durum', 'string'),
      col('oncelik', 'integer'), col('baslangic', 'timestamp'),
      col('sure_saat', 'integer'), col('birlik_no', 'string'),
      col('domain', 'string'), col('basari_puani', 'integer', true),
      col('hedef_bolge', 'string'), col('komutan_no', 'string', true),
    ],
  },
  {
    id: 'sensorler', label: 'Sensörler', view: 'v_sensor', pk: 'sensor_no',
    columns: [
      col('sensor_no', 'string'), col('tip', 'string'), col('platform_no', 'string'),
      col('menzil_km', 'integer'), col('durum', 'string'),
      col('uretici', 'string'), col('frekans_bandi', 'string'),
    ],
  },
  {
    id: 'personel', label: 'Personel', view: 'v_personel', pk: 'personel_no',
    columns: [
      col('personel_no', 'string'), col('ad_soyad', 'string'), col('rutbe', 'string'),
      col('rutbe_seviye', 'integer'), col('rol', 'string'), col('uzmanlik', 'string'),
      col('birlik_no', 'string'), col('platform_no', 'string', true), col('durum', 'string'),
      col('guvenlik_belgesi', 'string'), col('tecrube_yili', 'integer'),
      col('ucus_saati', 'integer'),
    ],
  },
  {
    id: 'istihbarat', label: 'İstihbarat Raporları', view: 'v_istihbarat', pk: 'rapor_no',
    columns: [
      col('rapor_no', 'string'), col('tur', 'string'), col('baslik', 'string'),
      col('ozet', 'string'), col('kaynak', 'string'),
      col('kaynak_guvenilirligi', 'string'), col('bilgi_dogrulugu', 'integer'),
      col('oncelik', 'string'), col('tehdit_tipi', 'string', true),
      col('guven_yuzde', 'integer', true), col('ilgili_iz_no', 'string', true),
      col('enlem', 'double', true), col('boylam', 'double', true),
      col('rapor_zamani', 'timestamp'),
    ],
  },
  {
    id: 'iz_gecmisi', label: 'İz Gözlem Geçmişi', view: 'v_iz_gecmis', pk: 'gozlem_no',
    columns: [
      col('gozlem_no', 'string'), col('iz_no', 'string'),
      col('tespit_zamani', 'timestamp'), col('sensor_no', 'string'),
      col('domain', 'string'), col('tehdit_seviyesi', 'integer'),
      col('enlem', 'double', true), col('boylam', 'double', true),
      col('surat_knot', 'integer', true), col('irtifa_ft', 'integer', true),
      col('rota_derece', 'integer', true),
    ],
  },
  {
    id: 'izler', label: 'İzler (Track)', view: 'v_iz', pk: 'iz_no',
    columns: [
      col('iz_no', 'string'), col('siniflandirma', 'string'), col('domain', 'string'),
      col('tespit_zamani', 'timestamp'), col('sensor_no', 'string'),
      col('surat_knot', 'integer'), col('irtifa_ft', 'integer'),
      col('rota_derece', 'integer'), col('enlem', 'double'), col('boylam', 'double'),
      col('tehdit_seviyesi', 'integer'),
      // akıl yürütme writeback (v_iz LEFT JOIN object_item_threat) — skorlanana dek null
      col('tehdit_skoru', 'integer', true), col('tehdit_onceligi', 'string', true),
      col('yaklasiyor', 'boolean', true),
    ],
  },
];

export const mimDatasetById = new Map(MIM_DATASETS.map((d) => [d.id, d]));
