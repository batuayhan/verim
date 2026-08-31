import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { TopNav } from '../components/TopNav';
import { useNesneDetay } from '../nesne/NesneDetay';
import { useObjectSet, useOntology } from '../mercek/api';
import type { ObjectSetDef } from '../types/mercek';
import { BaglantiGrafi } from './BaglantiGrafi';

/**
 * Bağlantı Analizi sayfası (/graf) — ontolojiyi gezilebilir ağ olarak keşfet.
 * ?tip=&pk= ile bir nesneye odaklı açılır (harita/detay/asistan buradan
 * yönlendirir); parametresiz açılırsa üstteki seçiciden başlanır.
 */
export function GrafPage() {
  const [params, setParams] = useSearchParams();
  const { data: ontology } = useOntology();
  const detay = useNesneDetay();

  const urlTip = params.get('tip') ?? '';
  const urlPk = params.get('pk') ?? '';
  const [tip, setTip] = useState(urlTip || 'birlik');

  useEffect(() => {
    if (urlTip) setTip(urlTip);
  }, [urlTip]);

  const focus = urlTip && urlPk ? { objectType: urlTip, pk: urlPk } : null;

  // Seçiciyi beslemek için o tipten ilk 25 nesne
  const listDef = useMemo<ObjectSetDef>(() => ({ type: 'base', objectType: tip }), [tip]);
  const { data: liste } = useObjectSet(listDef, {}, 25);
  const tipDef = ontology?.objectTypes.find((t) => t.apiName === tip);
  const pkKol = tipDef?.primaryKey ?? '';

  const sec = (t: string, pk: string) => setParams({ tip: t, pk });

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <TopNav />
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ px: 2, py: 1, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography variant="subtitle2" sx={{ mr: 1 }}>
          Bağlantı Analizi
        </Typography>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Nesne tipi</InputLabel>
          <Select
            label="Nesne tipi"
            value={tip}
            onChange={(e) => setTip(e.target.value)}
          >
            {(ontology?.objectTypes ?? []).map((t) => (
              <MenuItem key={t.apiName} value={t.apiName}>
                {t.icon} {t.displayName}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel>Başlangıç nesnesi</InputLabel>
          <Select
            label="Başlangıç nesnesi"
            value={focus?.objectType === tip ? focus.pk : ''}
            onChange={(e) => sec(tip, e.target.value)}
          >
            {(liste?.objects ?? []).map((o) => {
              const pk = String(o[pkKol] ?? '');
              const ad = (o.ad ?? o.ad_soyad ?? o.cagri_adi ?? pk) as string;
              return (
                <MenuItem key={pk} value={pk}>
                  {pk} — {ad}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
        <Typography variant="caption" color="text.secondary">
          Düğüme tıkla → komşularını aç · sürükle → sabitle
        </Typography>
      </Stack>

      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <BaglantiGrafi focus={focus} onDetay={(t, pk) => detay.ac(t, pk)} />
      </Box>
    </Box>
  );
}
