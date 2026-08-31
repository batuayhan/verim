import { Stack, Tooltip, Typography } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import type { ReactNode } from 'react';

/**
 * KOMUTA KONSOLU ortak dili — Sync Matrix, Harita ve Karar Destek aynı paleti
 * ve KPI rozet bileşenini buradan tüketir (UX×alan-uzmanı mutabakatı).
 */
export const KONSOL = {
  kanvas: '#0b1220',
  yuzey: '#141f35',
  bant: '#16233c',
  kenar: 'rgba(148,163,184,.2)',
  kenarSoluk: 'rgba(148,163,184,.14)',
  metin: '#e2e8f0',
  metinIkincil: '#7c8db0',
  vurgu: '#7dd3fc',
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
} as const;

/**
 * KOMUTA KONSOLU koyu teması — konsol paletine sabit (global tema ne olursa olsun).
 * İçindeki MUI bileşenleri (TextField/Select/Drawer içerikleri) her zaman koyu
 * kalır; harekât merkezi ışık disiplini + sayfalar arası tutarlılık.
 */
export const konsolTheme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: KONSOL.kanvas, paper: KONSOL.yuzey },
    primary: { main: KONSOL.vurgu },
    text: { primary: KONSOL.metin, secondary: KONSOL.metinIkincil },
    divider: KONSOL.kenar,
  },
});

/** Konsol koyu temasını bir alt ağaca uygular (paylaşılan çekmeceler için). */
export function KonsolTema({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={konsolTheme}>{children}</ThemeProvider>;
}

/** Durum çubuğu KPI rozeti — projektörden okunur; tıklanabilirse filtre/anahtar */
export function KpiRozet({
  etiket,
  deger,
  renk,
  aktif,
  onClick,
  ipucu,
}: {
  etiket: string;
  deger: string;
  renk?: string;
  aktif?: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  ipucu?: string;
}) {
  const ic = (
    <Stack
      direction="row"
      spacing={0.5}
      onClick={onClick}
      sx={{
        alignItems: 'baseline',
        px: 0.75,
        py: 0.1,
        borderRadius: 0.75,
        cursor: onClick ? 'pointer' : 'default',
        bgcolor: aktif ? 'rgba(125,211,252,.14)' : 'transparent',
        outline: aktif ? '1px solid rgba(125,211,252,.4)' : undefined,
        '&:hover': onClick ? { bgcolor: 'rgba(148,163,184,.12)' } : undefined,
      }}
    >
      <Typography sx={{ fontFamily: KONSOL.mono, fontWeight: 800, fontSize: 14, color: renk ?? KONSOL.metin }}>
        {deger}
      </Typography>
      <Typography sx={{ fontSize: 10, color: KONSOL.metinIkincil, letterSpacing: 0.5 }}>{etiket}</Typography>
    </Stack>
  );
  return ipucu ? <Tooltip title={ipucu}>{ic}</Tooltip> : ic;
}
