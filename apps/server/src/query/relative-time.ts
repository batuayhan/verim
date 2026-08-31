/**
 * GÖRELİ ZAMAN çözümü — "son N dakika/saat/gün" filtreleri sabit zaman
 * damgası GÖMMEZ; çalışma anında (şimdi − N) olarak hesaplanır. Böylece
 * kaydedilen bir analiz ya da canlı harita her tazelemede gerçekten "son 1
 * saat"i gösterir. Hem in-memory hem SQL motoru aynı çözücüyü kullanır.
 */

export type RelativeUnit = 'minute' | 'hour' | 'day';

const UNIT_MS: Record<RelativeUnit, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
};

/** Şimdi − amount·unit → ISO datetime (UTC) */
export function relativeIso(unit: RelativeUnit, amount: number): string {
  return new Date(Date.now() - amount * (UNIT_MS[unit] ?? UNIT_MS.hour)).toISOString();
}
