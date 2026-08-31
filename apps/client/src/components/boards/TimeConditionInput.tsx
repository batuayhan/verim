import {
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import type { FilterCondition, FilterValue } from '../../types/boards';

/**
 * Zaman (tarih/timestamp) koşulu için ortak girdi — hem Mercek filtre kartında
 * hem Harman filtre board'unda kullanılır. Bir zaman koşulu iki şekilde ifade
 * edilir:
 *   • Göreli   : "son N dakika/saat/gün" → {kind:'relative'} — sunucuda çalışma
 *                anında hesaplanır, sabit tarih yazılmaz, pencere kayar.
 *   • Belirli  : datetime seçici ile sabit an → {kind:'literal', ISO};
 *                sonra (gte) / önce (lte) / arasında (between).
 *
 * Novice-first: ham operatör terimleri yerine anlamlı seçenekler; yarım/geçersiz
 * tarih üretmemek için değerler ISO'ya çevrilerek yazılır.
 */

const ZAMAN_BIRIM: Array<{ v: 'minute' | 'hour' | 'day'; l: string }> = [
  { v: 'minute', l: 'dakika' },
  { v: 'hour', l: 'saat' },
  { v: 'day', l: 'gün' },
];

type Birim = 'minute' | 'hour' | 'day';

/**
 * Hazır göreli pencereler — kullanıcı sayı YAZMAZ, listeden seçer (Harita'daki
 * "son 5 dk / 15 dk / 1 saat" mantığıyla aynı). "Özel…" ile serbest miktar.
 */
const RELATIF_PRESETS: Array<{ amount: number; unit: Birim; label: string }> = [
  { amount: 5, unit: 'minute', label: 'son 5 dakika' },
  { amount: 15, unit: 'minute', label: 'son 15 dakika' },
  { amount: 30, unit: 'minute', label: 'son 30 dakika' },
  { amount: 1, unit: 'hour', label: 'son 1 saat' },
  { amount: 3, unit: 'hour', label: 'son 3 saat' },
  { amount: 6, unit: 'hour', label: 'son 6 saat' },
  { amount: 12, unit: 'hour', label: 'son 12 saat' },
  { amount: 24, unit: 'hour', label: 'son 24 saat' },
  { amount: 3, unit: 'day', label: 'son 3 gün' },
  { amount: 7, unit: 'day', label: 'son 7 gün' },
  { amount: 30, unit: 'day', label: 'son 30 gün' },
];

const presetKey = (amount: number, unit: Birim) => `${amount}:${unit}`;
const matchesPreset = (amount: number, unit: Birim) =>
  RELATIF_PRESETS.some((p) => p.amount === amount && p.unit === unit);

/** ISO → datetime-local kutusunun beklediği yerel "YYYY-MM-DDTHH:mm" metni */
function isoToLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** datetime-local yerel metni → ISO (UTC) */
function localToIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export function TimeConditionInput({
  cond,
  onChange,
}: {
  cond: FilterCondition;
  onChange: (p: Partial<FilterCondition>) => void;
}) {
  const rel = cond.values.find((v) => v.kind === 'relative') as
    | Extract<FilterValue, { kind: 'relative' }>
    | undefined;
  // Mod yalnızca değerlerden türetilemez: "belirli" seçilip henüz tarih
  // girilmemişken de değerler boştur ve bu "göreli"den ayırt edilemez. Bu
  // yüzden mod ayrı bir state; başlangıçta mevcut değerlerden tahmin edilir.
  const [mod, setModState] = useState<'goreli' | 'belirli'>(
    !rel && cond.values.some((v) => v.kind === 'literal') ? 'belirli' : 'goreli',
  );
  // "Özel…" açık mı: mevcut göreli değer hazır listede yoksa ya da kullanıcı
  // bilerek Özel'i seçtiyse serbest miktar+birim gösterilir.
  const [ozel, setOzel] = useState<boolean>(!!rel && !matchesPreset(rel.amount, rel.unit));

  const setRel = (amount: number, unit: Birim) =>
    onChange({ operator: 'gte', values: [{ kind: 'relative', amount, unit }] });

  // Zaman kolonu yeni seçildiğinde henüz değer yoktur; anlamlı bir varsayılana
  // ("son 1 saat") düşülür ki filtre boş/geçersiz kalmasın (novice-first).
  useEffect(() => {
    if (mod === 'goreli' && !ozel && !rel && cond.values.length === 0) {
      setRel(1, 'hour');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod, ozel, rel, cond.values.length]);

  const litIso = (i: number): string => {
    const v = cond.values[i];
    return v && v.kind === 'literal' && typeof v.value === 'string' ? v.value : '';
  };

  const setMod = (m: 'goreli' | 'belirli') => {
    if (m === mod) return;
    setModState(m);
    if (m === 'goreli') {
      onChange({ operator: 'gte', values: [{ kind: 'relative', unit: 'hour', amount: 1 }] });
    } else {
      onChange({ operator: 'gte', values: [] });
    }
  };

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
      <ToggleButtonGroup exclusive size="small" value={mod} onChange={(_, m) => m && setMod(m)}>
        <ToggleButton value="goreli" sx={{ textTransform: 'none', py: 0.25 }}>
          Göreli
        </ToggleButton>
        <ToggleButton value="belirli" sx={{ textTransform: 'none', py: 0.25 }}>
          Belirli tarih
        </ToggleButton>
      </ToggleButtonGroup>

      {mod === 'goreli' ? (
        <>
          {/* Hazır pencere seçimi — sayı yazmak yok, listeden seç */}
          <Select
            size="small"
            sx={{ minWidth: 150 }}
            value={ozel ? 'custom' : rel ? presetKey(rel.amount, rel.unit) : presetKey(1, 'hour')}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'custom') {
                setOzel(true);
                if (!rel) setRel(1, 'hour');
                return;
              }
              setOzel(false);
              const [amountStr, unit] = val.split(':');
              setRel(Number(amountStr), unit as Birim);
            }}
          >
            {RELATIF_PRESETS.map((p) => (
              <MenuItem key={p.label} value={presetKey(p.amount, p.unit)}>
                {p.label}
              </MenuItem>
            ))}
            <MenuItem value="custom">Özel…</MenuItem>
          </Select>
          {ozel && (
            <>
              <Typography variant="body2">son</Typography>
              <TextField
                size="small"
                type="number"
                sx={{ width: 84 }}
                value={rel?.amount ?? 1}
                onChange={(e) => setRel(Math.max(1, Number(e.target.value) || 1), rel?.unit ?? 'hour')}
              />
              <Select
                size="small"
                value={rel?.unit ?? 'hour'}
                onChange={(e) => setRel(rel?.amount ?? 1, e.target.value as Birim)}
              >
                {ZAMAN_BIRIM.map((b) => (
                  <MenuItem key={b.v} value={b.v}>{b.l}</MenuItem>
                ))}
              </Select>
            </>
          )}
        </>
      ) : (
        <>
          <Select
            size="small"
            value={
              cond.operator === 'between'
                ? 'between'
                : cond.operator === 'lte' || cond.operator === 'lt'
                  ? 'lte'
                  : 'gte'
            }
            onChange={(e) => {
              const op = e.target.value as 'gte' | 'lte' | 'between';
              const cur = cond.values.filter((v) => v.kind === 'literal');
              onChange({ operator: op, values: op === 'between' ? cur.slice(0, 2) : cur.slice(0, 1) });
            }}
          >
            <MenuItem value="gte">sonra</MenuItem>
            <MenuItem value="lte">önce</MenuItem>
            <MenuItem value="between">arasında</MenuItem>
          </Select>
          <TextField
            size="small"
            type="datetime-local"
            value={isoToLocal(litIso(0))}
            onChange={(e) => {
              const iso = localToIso(e.target.value);
              const rest = cond.operator === 'between' ? [cond.values[1]] : [];
              onChange({
                values: [
                  ...(iso ? [{ kind: 'literal' as const, value: iso }] : []),
                  ...rest.filter((v): v is FilterValue => !!v),
                ],
              });
            }}
          />
          {cond.operator === 'between' && (
            <>
              <Typography variant="body2">—</Typography>
              <TextField
                size="small"
                type="datetime-local"
                value={isoToLocal(litIso(1))}
                onChange={(e) => {
                  const iso = localToIso(e.target.value);
                  const lo = cond.values[0];
                  onChange({
                    values: [
                      ...(lo ? [lo] : []),
                      ...(iso ? [{ kind: 'literal' as const, value: iso }] : []),
                    ],
                  });
                }}
              />
            </>
          )}
        </>
      )}
    </Stack>
  );
}
