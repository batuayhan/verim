/**
 * Validated categorical palette (dataviz reference instance, light mode).
 * Slot order is the CVD-safety mechanism — assign by series index in fixed
 * order, never cycle or reshuffle. Validated against #ffffff surface:
 * CVD worst adjacent ΔE 24.2 (pass); slots 2/3/7 are sub-3:1 contrast, so
 * bar charts carry direct value labels (relief rule).
 */
export const CATEGORICAL = [
  '#2a78d6', // blue
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
  '#e87ba4', // magenta
  '#eb6834', // orange
] as const;

export const CHART_INK = {
  muted: '#898781',
  gridline: '#e1e0d9',
  baseline: '#c3c2b7',
} as const;

export function seriesColor(index: number): string {
  // 9+ serisi olan chart config'i UI'da engellenir; yine de taşarsa
  // son slotu tekrar etmek yerine "Other" gri kullanılır.
  return CATEGORICAL[index] ?? '#898781';
}

export const compactNumber = new Intl.NumberFormat('tr-TR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const fullNumber = new Intl.NumberFormat('tr-TR', {
  maximumFractionDigits: 2,
});
