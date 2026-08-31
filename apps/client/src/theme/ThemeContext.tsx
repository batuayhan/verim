import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';

/**
 * Global tema anahtarı (aydınlık/karanlık) — AppBar'dan yönetilir, localStorage'da
 * kalıcıdır. İçerik sayfaları (Ana Sayfa/Harman/Mercek/Datasetler/Ontoloji) temayı
 * izler; KOMUTA KONSOLU sayfaları (Sync Matrix/Harita/Karar Destek) HER temada koyu
 * kalır (harekât merkezi ışık disiplini — KONSOL sabitleri sx ile gömülüdür).
 */

type Mod = 'light' | 'dark';
interface TemaCtx {
  mod: Mod;
  toggle: () => void;
}
const Ctx = createContext<TemaCtx>({ mod: 'light', toggle: () => {} });

export const useTema = () => useContext(Ctx);

const DEPO = 'verim-tema';

export function TemaProvider({ children }: { children: ReactNode }) {
  const [mod, setMod] = useState<Mod>(() => (localStorage.getItem(DEPO) === 'dark' ? 'dark' : 'light'));

  const toggle = () =>
    setMod((m) => {
      const y = m === 'light' ? 'dark' : 'light';
      localStorage.setItem(DEPO, y);
      return y;
    });

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: mod,
          // Her iki modda da açık zemin/yüzey tanımlı — sayfalar 'background.default'
          // kullandığında tema izlenir (aydınlıkta yumuşak gri, karanlıkta lacivert).
          ...(mod === 'dark'
            ? {
                background: { default: '#0b1220', paper: '#141f35' },
                primary: { main: '#7dd3fc' },
              }
            : {
                background: { default: '#f4f6f8', paper: '#ffffff' },
              }),
        },
      }),
    [mod],
  );

  return (
    <Ctx.Provider value={{ mod, toggle }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </Ctx.Provider>
  );
}
