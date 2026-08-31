
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getToken } from '../auth/auth';
import { useNesneDetay } from '../nesne/NesneDetay';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface SearchHit {
  objectType: string;
  displayName: string;
  pk: string;
  label: string;
  icon?: string;
  ozet: string;
}

/**
 * Global nesne araması (Palantir arama çubuğu karşılığı) — TopNav'da her
 * yerden erişilir. Sunucuda OpenSearch'e (yoksa bellek-içi) gider; sonuç
 * seçilince ontolojik NESNE DETAY çekmecesi açılır (oradan sonsuz drill).
 */
export function GlobalSearch() {
  const detay = useNesneDetay();
  const [input, setInput] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const q = input.trim();
  useEffect(() => {
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(q)}&limit=20`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const j = (await res.json()) as { hits: SearchHit[] };
        if (id === seq.current) setHits(j.hits ?? []);
      } catch {
        if (id === seq.current) setHits([]);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const options = useMemo(() => hits, [hits]);

  return (
    <Autocomplete
      size="small"
      sx={{ width: 260 }}
      options={options}
      filterOptions={(x) => x}
      loading={loading}
      inputValue={input}
      onInputChange={(_, v) => setInput(v)}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.label)}
      isOptionEqualToValue={(a, b) => a.objectType === b.objectType && a.pk === b.pk}
      noOptionsText={q.length < 2 ? 'En az 2 harf yazın' : 'Sonuç yok'}
      onChange={(_, v) => {
        if (v && typeof v !== 'string') {
          detay.ac(v.objectType, v.pk);
          setInput('');
          setHits([]);
        }
      }}
      renderOption={(props, o) => (
        <Box component="li" {...props} key={`${o.objectType}:${o.pk}`}>
          <Box sx={{ mr: 1 }}>{o.icon ?? '•'}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap>{o.label}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {o.ozet}
            </Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField {...params} placeholder="🔎 Nesne ara…" variant="outlined" />
      )}
    />
  );
}
