import type { DashboardDoc } from './dashboard-schema';

/**
 * SANAL Sistem dashboard'u — store'da YAŞAMAZ, koddan üretilir; bu yüzden
 * bozulamaz ve "varsayılana dön" bedavadır (Jira'daki system dashboard
 * modeli). Kullanıcı düzenlemek isterse kopyalar (frontend "Kopyala ve
 * düzenle"). id 'sistem' PUT/DELETE'te reddedilir.
 */

export const SISTEM_DASHBOARD_ID = 'sistem';

const IZ = { type: 'base' as const, objectType: 'iz' };
const DUSMAN_IZ = {
  type: 'filter' as const,
  base: IZ,
  combinator: 'and' as const,
  conditions: [
    {
      id: 'c',
      column: 'siniflandirma',
      operator: 'eq' as const,
      values: [{ kind: 'literal' as const, value: 'Düşman' }],
    },
  ],
};
const GOZLEM = { type: 'base' as const, objectType: 'iz_gozlem' };

export function sistemDashboard(): DashboardDoc {
  return {
    id: SISTEM_DASHBOARD_ID,
    name: 'Sistem',
    gadgets: [
      {
        id: 'stat-toplam',
        tip: 'stat',
        baslik: 'Toplam iz',
        def: IZ,
        metric: { fn: 'count' },
        renk: 'primary',
        link: '/harita',
        yerlesim: { x: 0, y: 0, w: 3, h: 4 },
      },
      {
        id: 'stat-dusman',
        tip: 'stat',
        baslik: 'Düşman iz',
        def: DUSMAN_IZ,
        metric: { fn: 'count' },
        renk: 'error',
        link: '/harita?sinif=Düşman',
        yerlesim: { x: 3, y: 0, w: 3, h: 4 },
      },
      {
        id: 'stat-gozlem',
        tip: 'stat',
        baslik: 'Gözlem (son 15 dk)',
        def: GOZLEM,
        metric: { fn: 'count' },
        renk: 'success',
        link: '/harita?pencere=15',
        pencereDk: 15,
        pencereKolon: 'tespit_zamani',
        yerlesim: { x: 6, y: 0, w: 3, h: 4 },
      },
      {
        id: 'stat-hava',
        tip: 'stat',
        baslik: 'Hava izleri',
        def: {
          type: 'filter',
          base: IZ,
          combinator: 'and',
          conditions: [
            {
              id: 'c',
              column: 'domain',
              operator: 'eq',
              values: [{ kind: 'literal', value: 'Hava' }],
            },
          ],
        },
        metric: { fn: 'count' },
        renk: 'secondary',
        link: '/harita',
        yerlesim: { x: 9, y: 0, w: 3, h: 4 },
      },
      {
        id: 'asistan',
        tip: 'asistan',
        yerlesim: { x: 0, y: 4, w: 12, h: 4 },
      },
      {
        id: 'grafik-sinif',
        tip: 'grafik',
        baslik: 'Hava resmi — sınıflandırma × domain',
        def: IZ,
        groupBy: 'siniflandirma',
        segmentBy: 'domain',
        metric: { fn: 'count' },
        yerlesim: { x: 0, y: 8, w: 6, h: 9 },
      },
      {
        id: 'zaman-gozlem',
        tip: 'zaman',
        baslik: 'Gözlem trendi — son 24 saat',
        def: GOZLEM,
        dateProperty: 'tespit_zamani',
        granularity: 'hour',
        metric: { fn: 'count' },
        pencereDk: 24 * 60,
        pencereKolon: 'tespit_zamani',
        yerlesim: { x: 6, y: 8, w: 6, h: 9 },
      },
      {
        id: 'harita',
        tip: 'harita',
        baslik: 'Canlı harekât resmi',
        pencereDk: 15,
        yerlesim: { x: 0, y: 17, w: 6, h: 12 },
      },
      {
        id: 'alarmlar',
        tip: 'alarmlar',
        limit: 6,
        yerlesim: { x: 6, y: 17, w: 6, h: 6 },
      },
      {
        id: 'analizler',
        tip: 'analizler',
        limit: 6,
        yerlesim: { x: 6, y: 23, w: 6, h: 6 },
      },
    ],
  };
}
