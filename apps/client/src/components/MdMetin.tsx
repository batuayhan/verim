import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { kodZeminSx } from '../theme/tokens';

/**
 * Güvenli mini Markdown görüntüleyici — LLM cevapları için. Dış bağımlılık yok
 * ve ham HTML enjeksiyonu YOK: metin doğrudan React elemanlarına ayrıştırılır
 * (XSS yüzeyi yok). Destek: #/##/### başlık, **kalın**, *italik*, `kod`,
 * ``` blok, - ve 1. listeler, | tablo |, paragraf. Bilinmeyen sözdizimi düz
 * metin olarak kalır.
 */

function satirIci(metin: string): ReactNode[] {
  // **kalın** · *italik* · `kod` — soldan sağa tek geçiş
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let son = 0;
  let k = 0;
  for (const m of metin.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > son) out.push(metin.slice(son, idx));
    const t = m[0];
    if (t.startsWith('**'))
      out.push(<Box key={k++} component="span" sx={{ fontWeight: 700 }}>{t.slice(2, -2)}</Box>);
    else if (t.startsWith('`'))
      out.push(
        <Box key={k++} component="code" sx={[kodZeminSx, { fontFamily: 'monospace', px: 0.5, borderRadius: 0.5, fontSize: '0.9em' }]}>
          {t.slice(1, -1)}
        </Box>,
      );
    else out.push(<Box key={k++} component="em">{t.slice(1, -1)}</Box>);
    son = idx + t.length;
  }
  if (son < metin.length) out.push(metin.slice(son));
  return out;
}

export function MdMetin({ metin }: { metin: string }) {
  const satirlar = metin.split('\n');
  const bloklar: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < satirlar.length) {
    const s = satirlar[i];

    // ``` kod bloğu
    if (s.trimStart().startsWith('```')) {
      const kod: string[] = [];
      i++;
      while (i < satirlar.length && !satirlar[i].trimStart().startsWith('```')) kod.push(satirlar[i++]);
      i++; // kapanış
      bloklar.push(
        <Box key={key++} component="pre" sx={[kodZeminSx, { m: 0, my: 0.5, p: 1, borderRadius: 1, overflow: 'auto', fontSize: 12, fontFamily: 'monospace' }]}>
          {kod.join('\n')}
        </Box>,
      );
      continue;
    }

    // | tablo |
    if (s.trim().startsWith('|') && s.trim().endsWith('|')) {
      const tsat: string[] = [];
      while (i < satirlar.length && satirlar[i].trim().startsWith('|')) tsat.push(satirlar[i++].trim());
      const hucreler = (r: string) => r.slice(1, -1).split('|').map((c) => c.trim());
      const govde = tsat.filter((r) => !/^\|[\s:|-]+\|$/.test(r)); // ayraç satırını at
      if (govde.length) {
        const [baslik, ...kalan] = govde;
        bloklar.push(
          <Box key={key++} sx={{ overflowX: 'auto', my: 0.5 }}>
            <Table size="small" sx={{ '& td, & th': { py: 0.25, px: 1, fontSize: 12 } }}>
              <TableHead>
                <TableRow>{hucreler(baslik).map((c, j) => <TableCell key={j} sx={{ fontWeight: 700 }}>{satirIci(c)}</TableCell>)}</TableRow>
              </TableHead>
              <TableBody>
                {kalan.map((r, ri) => (
                  <TableRow key={ri}>{hucreler(r).map((c, j) => <TableCell key={j}>{satirIci(c)}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>,
        );
      }
      continue;
    }

    // - liste / 1. liste
    const liMi = (x: string) => /^\s*([-*•]|\d+[.)])\s+/.test(x);
    if (liMi(s)) {
      const ogeler: string[] = [];
      while (i < satirlar.length && liMi(satirlar[i]))
        ogeler.push(satirlar[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
      bloklar.push(
        <Box key={key++} component="ul" sx={{ my: 0.25, pl: 2.5 }}>
          {ogeler.map((o, j) => (
            <Typography key={j} component="li" variant="body2" sx={{ my: 0.1 }}>
              {satirIci(o)}
            </Typography>
          ))}
        </Box>,
      );
      continue;
    }

    // # başlık
    const h = s.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      bloklar.push(
        <Typography key={key++} variant={h[1].length === 1 ? 'subtitle1' : 'subtitle2'} sx={{ fontWeight: 700, mt: 0.5 }}>
          {satirIci(h[2])}
        </Typography>,
      );
      i++;
      continue;
    }

    // boş satır → atla; düz paragraf
    if (s.trim() === '') {
      i++;
      continue;
    }
    bloklar.push(
      <Typography key={key++} variant="body2" sx={{ my: 0.25 }}>
        {satirIci(s)}
      </Typography>,
    );
    i++;
  }

  return <Box>{bloklar}</Box>;
}
