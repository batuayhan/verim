import { z } from 'zod';
import { objectSetDefSchema } from '../ontology/ontology.controller';

/**
 * BİRLEŞİK DASHBOARD SÖZLEŞMESİ — platformda tek dashboard sistemi vardır;
 * her öğe bir GADGET'tır (Jira dashboard modeli). Gadget üyeleri TEK listede
 * tanımlanır ve iki union aynı listeden türer:
 *  - gadgetConfigSchema: id/yerleşim OLMADAN — asistan aracının girdisi
 *    (LLM yerleşim hesaplamaz, sunucu otomatik yerleştirir),
 *  - gadgetSchema: id + yerleşim İLE — dashboard dokümanında saklanan hali.
 * Yeni gadget tipi = üye listesine ekle; capabilities/catalog.ts'teki
 * GADGETS Record'u derleyici seviyesinde açıklama zorlar.
 */

export const gadgetMetricSchema = z.object({
  fn: z.enum(['count', 'sum', 'avg', 'min', 'max', 'countDistinct']),
  property: z.string().optional(),
});

/** "Son N dakika" canlı penceresi: def statik kalır, pencere çalışma
    zamanında pencereKolon >= (şimdi - pencereDk) koşuluna açılır */
const pencereFields = {
  pencereDk: z
    .number()
    .int()
    .positive()
    .max(7 * 24 * 60)
    .optional(),
  pencereKolon: z.string().optional(),
};

const SINIFLAR = ['Dost', 'Düşman', 'Şüpheli', 'Bilinmeyen'] as const;

/** Gadget üyeleri — id/yerleşimsiz çekirdek konfigürasyonlar */
const members = [
  z.object({
    tip: z.literal('stat'),
    baslik: z.string().max(120).optional(),
    def: objectSetDefSchema,
    metric: gadgetMetricSchema,
    renk: z.enum(['primary', 'error', 'warning', 'success', 'secondary']).optional(),
    /** Tıklanınca gidilecek uygulama yolu (örn. /harita?sinif=Düşman) */
    link: z.string().max(200).optional(),
    ...pencereFields,
  }),
  z.object({
    tip: z.literal('grafik'),
    baslik: z.string().max(120).optional(),
    def: objectSetDefSchema,
    groupBy: z.string().min(1),
    segmentBy: z.string().optional(),
    metric: gadgetMetricSchema,
    grafikTuru: z.enum(['bar', 'pie']).optional(),
    ...pencereFields,
  }),
  z.object({
    tip: z.literal('zaman'),
    baslik: z.string().max(120).optional(),
    def: objectSetDefSchema,
    dateProperty: z.string().min(1),
    granularity: z.enum(['hour', 'day', 'week', 'month']),
    metric: gadgetMetricSchema,
    ...pencereFields,
  }),
  z.object({
    tip: z.literal('tablo'),
    baslik: z.string().max(120).optional(),
    def: objectSetDefSchema,
    limit: z.number().int().min(1).max(100).optional(),
    ...pencereFields,
  }),
  z.object({
    tip: z.literal('liste'),
    baslik: z.string().max(120).optional(),
    def: objectSetDefSchema,
    groupBy: z.string().min(1),
    metric: gadgetMetricSchema,
    limit: z.number().int().min(1).max(20).optional(),
    ...pencereFields,
  }),
  z.object({
    tip: z.literal('pivot'),
    baslik: z.string().max(120).optional(),
    def: objectSetDefSchema,
    groupBy: z.string().min(1),
    segmentBy: z.string().min(1),
    metric: gadgetMetricSchema,
    ...pencereFields,
  }),
  z.object({
    tip: z.literal('dagilim'),
    baslik: z.string().max(120).optional(),
    def: objectSetDefSchema,
    xColumn: z.string().min(1),
    yColumn: z.string().min(1),
    limit: z.number().int().min(1).max(2000).optional(),
    ...pencereFields,
  }),
  z.object({
    tip: z.literal('harita'),
    baslik: z.string().max(120).optional(),
    siniflandirmalar: z.array(z.enum(SINIFLAR)).optional(),
    pencereDk: z.number().int().positive().max(24 * 60).optional(),
  }),
  z.object({
    tip: z.literal('alarmlar'),
    baslik: z.string().max(120).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  z.object({
    tip: z.literal('analizler'),
    baslik: z.string().max(120).optional(),
    limit: z.number().int().min(1).max(12).optional(),
  }),
  z.object({
    tip: z.literal('senkronizasyon'),
    baslik: z.string().max(120).optional(),
    limit: z.number().int().min(1).max(60).optional(),
  }),
  z.object({
    tip: z.literal('asistan'),
    baslik: z.string().max(120).optional(),
  }),
  z.object({
    tip: z.literal('harman_board'),
    baslik: z.string().max(120).optional(),
    analysisId: z.string().min(1),
    pathId: z.string().min(1),
    boardId: z.string().min(1),
  }),
  z.object({
    tip: z.literal('mercek_kart'),
    baslik: z.string().max(120).optional(),
    analysisId: z.string().min(1),
    cardId: z.string().min(1),
  }),
] as const;

export const yerlesimSchema = z.object({
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(40),
});

export type GadgetConfig = z.infer<(typeof members)[number]>;
export type GadgetTip = GadgetConfig['tip'];
export type GadgetDoc = GadgetConfig & { id: string; yerlesim: z.infer<typeof yerlesimSchema> };
export type DashboardDoc = { id: string; name: string; gadgets: GadgetDoc[] };

/** Asistan aracı / gadget formu girdisi — yerleşimsiz, KATI */
export const gadgetConfigSchema = z.discriminatedUnion(
  'tip',
  members.map((m) => m.strict()) as never,
) as unknown as z.ZodType<GadgetConfig>;

/** Dokümanda saklanan gadget — id + yerleşim ile, KATI */
export const gadgetSchema = z.discriminatedUnion(
  'tip',
  members.map((m) =>
    m.extend({ id: z.string().min(1).max(60), yerlesim: yerlesimSchema }).strict(),
  ) as never,
) as unknown as z.ZodType<GadgetDoc>;

export const dashboardSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(120),
    gadgets: z.array(gadgetSchema).max(40),
  })
  .strict();

/** Asistanın (ve formların) yerleşimsiz gadget'ları için otomatik yerleşim:
    stat küçük kart, geniş içerikler yarım satır, asistan tam satır */
export function autoLayout(configs: GadgetConfig[]): GadgetDoc[] {
  const sizeOf = (tip: GadgetTip): { w: number; h: number } => {
    switch (tip) {
      case 'stat':
        return { w: 3, h: 4 };
      case 'asistan':
        return { w: 12, h: 4 };
      case 'alarmlar':
      case 'analizler':
        return { w: 6, h: 8 };
      case 'senkronizasyon':
        return { w: 8, h: 9 };
      default:
        return { w: 6, h: 9 };
    }
  };
  let x = 0;
  let y = 0;
  let rowH = 0;
  return configs.map((c, i) => {
    const { w, h } = sizeOf(c.tip);
    if (x + w > 12) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    const g: GadgetDoc = { ...c, id: `g${i + 1}`, yerlesim: { x, y, w, h } };
    x += w;
    rowH = Math.max(rowH, h);
    return g;
  });
}
