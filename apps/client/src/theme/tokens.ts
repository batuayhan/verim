import type { Theme } from '@mui/material/styles';

/**
 * Yeniden kullanılabilir, TEMA-DUYARLI sx parçaları. Aydınlık/karanlık modun
 * ikisinde de okunur; sabit açık renk yerine bunları kullan.
 */

/** "$parametre" token vurgusu (Filtre/İfade/Parametre panelleri) — okunur amber. */
export const parametreTokenSx = (theme: Theme) =>
  theme.palette.mode === 'dark'
    ? { bgcolor: 'rgba(250, 204, 21, 0.16)', color: '#fde68a' }
    : { bgcolor: '#fff3cd', color: '#7c5e10' };

/** Satır-içi kod / kod bloğu zemini (MdMetin, teknik metinler). */
export const kodZeminSx = (theme: Theme) => ({
  bgcolor: theme.palette.mode === 'dark' ? 'rgba(148, 163, 184, 0.14)' : 'grey.100',
});
