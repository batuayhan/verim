import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { useDatasets, useDatasetSchema } from '../api/hooks';
import { useOntology } from '../mercek/api';
import type { LinkTypeDef, ObjectTypeDef } from '../types/mercek';
import type { Uzanti } from './yonetimApi';

const EMOJILER = ['🏭', '🛰️', '📡', '🎯', '🚚', '🏥', '⚓', '🛢️', '🗼', '🧭', '📦', '🔧'];

/**
 * Kürasyon kurucusu — dosya yazmadan, ARAYÜZDEN yeni tip/ilişki kur.
 * Novice-first: dataset ve kolonlar select'ten gelir (gerçek şema → bağlama
 * hatası üretmek imkânsız). Ürettiği uzantı AYNI kabul hattından geçer.
 */
export function KurasyonBuilder({ onUzanti }: { onUzanti: (u: Uzanti) => void }) {
  const { data: datasetler } = useDatasets();
  const { data: ontology } = useOntology();
  const [tipler, setTipler] = useState<ObjectTypeDef[]>([]);
  const [linkler, setLinkler] = useState<LinkTypeDef[]>([]);
  const [aciklama, setAciklama] = useState('');

  const tumTipler = useMemo(
    () => [...(ontology?.objectTypes ?? []), ...tipler],
    [ontology, tipler],
  );

  const guncelle = (yeniTipler: ObjectTypeDef[], yeniLinkler: LinkTypeDef[], acik: string) => {
    setTipler(yeniTipler);
    setLinkler(yeniLinkler);
    setAciklama(acik);
    onUzanti({ aciklama: acik || undefined, objectTypes: yeniTipler, linkTypes: yeniLinkler });
  };

  return (
    <Stack spacing={2}>
      <TextField
        size="small"
        label="Uzantı açıklaması (isteğe bağlı)"
        value={aciklama}
        onChange={(e) => guncelle(tipler, linkler, e.target.value)}
        fullWidth
      />

      {/* Kurulan tipler */}
      {tipler.length > 0 && (
        <Stack spacing={1}>
          {tipler.map((t, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ fontSize: 20 }}>{t.icon}</Box>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.displayName} <Typography component="span" variant="caption" color="text.secondary">{t.apiName}</Typography></Typography>
                <Typography variant="caption" color="text.secondary">
                  {t.datasetId} · anahtar {t.primaryKey} · {t.properties.length} özellik
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => guncelle(tipler.filter((_, j) => j !== i), linkler, aciklama)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Paper>
          ))}
        </Stack>
      )}

      <TipEkleForm
        datasetler={(datasetler?.datasets ?? []).map((d) => ({ id: d.id, label: d.label }))}
        onEkle={(t) => guncelle([...tipler, t], linkler, aciklama)}
        mevcutApiNames={tumTipler.map((t) => t.apiName)}
      />

      {/* Kurulan linkler */}
      {linkler.length > 0 && (
        <Stack spacing={0.5}>
          {linkler.map((l, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 0.75, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ flexGrow: 1 }}>
                <b>{l.fromObjectType}</b> → <b>{l.toObjectType}</b> · {l.displayName} ({l.cardinality === 'one' ? 'tekil' : 'çoğul'}, {l.fromKey}={l.toKey})
              </Typography>
              <IconButton size="small" onClick={() => guncelle(tipler, linkler.filter((_, j) => j !== i), aciklama)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Paper>
          ))}
        </Stack>
      )}

      {tumTipler.length >= 2 && (
        <LinkEkleForm
          tipler={tumTipler}
          onEkle={(l) => guncelle(tipler, [...linkler, l], aciklama)}
          mevcutApiNames={[...(ontology?.linkTypes ?? []), ...linkler].map((l) => l.apiName)}
        />
      )}
    </Stack>
  );
}

function TipEkleForm({
  datasetler,
  onEkle,
  mevcutApiNames,
}: {
  datasetler: { id: string; label: string }[];
  onEkle: (t: ObjectTypeDef) => void;
  mevcutApiNames: string[];
}) {
  const [datasetId, setDatasetId] = useState('');
  const [apiName, setApiName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pluralName, setPluralName] = useState('');
  const [icon, setIcon] = useState('🏭');
  const [primaryKey, setPrimaryKey] = useState('');
  const [secili, setSecili] = useState<string[]>([]);
  const { data: sema } = useDatasetSchema(datasetId || undefined);
  const kolonlar = sema?.schema.columns ?? [];

  const cakisma = mevcutApiNames.includes(apiName);
  const gecerli = datasetId && /^[a-z][a-z0-9_]*$/.test(apiName) && !cakisma && displayName && primaryKey && secili.length > 0;

  const ekle = () => {
    if (!gecerli) return;
    onEkle({
      apiName, displayName, pluralName: pluralName || displayName,
      icon, primaryKey, datasetId,
      properties: secili.map((k) => {
        const kol = kolonlar.find((c) => c.name === k)!;
        return { apiName: kol.name, displayName: kol.name, type: kol.type };
      }),
    });
    // sıfırla
    setApiName(''); setDisplayName(''); setPluralName(''); setPrimaryKey(''); setSecili([]);
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Yeni nesne tipi</Typography>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <TextField size="small" label="Kaynak dataset" select value={datasetId}
            onChange={(e) => { setDatasetId(e.target.value); setPrimaryKey(''); setSecili([]); }} sx={{ minWidth: 180 }}>
            {datasetler.map((d) => <MenuItem key={d.id} value={d.id}>{d.label}</MenuItem>)}
          </TextField>
          <Select size="small" value={icon} onChange={(e) => setIcon(e.target.value)} sx={{ width: 72 }}>
            {EMOJILER.map((e) => <MenuItem key={e} value={e}>{e}</MenuItem>)}
          </Select>
          <TextField size="small" label="apiName (küçük harf)" value={apiName}
            onChange={(e) => setApiName(e.target.value)} error={cakisma}
            helperText={cakisma ? 'bu ad zaten var' : undefined} sx={{ minWidth: 150 }} />
          <TextField size="small" label="Görünen ad" value={displayName} onChange={(e) => setDisplayName(e.target.value)} sx={{ minWidth: 140 }} />
          <TextField size="small" label="Çoğul ad" value={pluralName} onChange={(e) => setPluralName(e.target.value)} sx={{ minWidth: 140 }} />
        </Stack>
        {datasetId && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField size="small" label="Birincil anahtar" select value={primaryKey}
              onChange={(e) => setPrimaryKey(e.target.value)} sx={{ minWidth: 170 }}>
              {kolonlar.map((c) => <MenuItem key={c.name} value={c.name}>{c.name} ({c.type})</MenuItem>)}
            </TextField>
            <Select size="small" multiple displayEmpty value={secili}
              onChange={(e) => setSecili(e.target.value as string[])}
              renderValue={(v) => (v.length ? `${v.length} özellik` : 'Özellikleri seç')}
              sx={{ minWidth: 200 }}>
              {kolonlar.map((c) => <MenuItem key={c.name} value={c.name}>{c.name} · {c.type}</MenuItem>)}
            </Select>
          </Stack>
        )}
        <Box>
          <Button size="small" variant="contained" startIcon={<AddIcon />} disabled={!gecerli} onClick={ekle}>
            Tip ekle
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}

function LinkEkleForm({
  tipler,
  onEkle,
  mevcutApiNames,
}: {
  tipler: ObjectTypeDef[];
  onEkle: (l: LinkTypeDef) => void;
  mevcutApiNames: string[];
}) {
  const [apiName, setApiName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cardinality, setCardinality] = useState<'one' | 'many'>('many');
  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');

  const fromKols = tipler.find((t) => t.apiName === from)?.properties ?? [];
  const toKols = tipler.find((t) => t.apiName === to)?.properties ?? [];
  const cakisma = mevcutApiNames.includes(apiName);
  const gecerli = /^[a-z][a-z0-9_-]*$/.test(apiName) && !cakisma && displayName && from && to && fromKey && toKey;

  const ekle = () => {
    if (!gecerli) return;
    onEkle({ apiName, displayName, fromObjectType: from, toObjectType: to, cardinality, fromKey, toKey });
    setApiName(''); setDisplayName(''); setFrom(''); setTo(''); setFromKey(''); setToKey('');
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Yeni ilişki (link)</Typography>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <TextField size="small" label="apiName" value={apiName} onChange={(e) => setApiName(e.target.value)}
            error={cakisma} helperText={cakisma ? 'var' : undefined} sx={{ minWidth: 140 }} />
          <TextField size="small" label="Görünen ad" value={displayName} onChange={(e) => setDisplayName(e.target.value)} sx={{ minWidth: 160 }} />
          <TextField size="small" label="Kardinalite" select value={cardinality} onChange={(e) => setCardinality(e.target.value as 'one' | 'many')} sx={{ width: 110 }}>
            <MenuItem value="one">tekil</MenuItem>
            <MenuItem value="many">çoğul</MenuItem>
          </TextField>
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" label="Kaynak tip" select value={from} onChange={(e) => { setFrom(e.target.value); setFromKey(''); }} sx={{ minWidth: 150 }}>
            {tipler.map((t) => <MenuItem key={t.apiName} value={t.apiName}>{t.displayName}</MenuItem>)}
          </TextField>
          {from && (
            <TextField size="small" label="anahtar" select value={fromKey} onChange={(e) => setFromKey(e.target.value)} sx={{ minWidth: 130 }}>
              {fromKols.map((p) => <MenuItem key={p.apiName} value={p.apiName}>{p.apiName}</MenuItem>)}
            </TextField>
          )}
          <Typography variant="body2">→</Typography>
          <TextField size="small" label="Hedef tip" select value={to} onChange={(e) => { setTo(e.target.value); setToKey(''); }} sx={{ minWidth: 150 }}>
            {tipler.map((t) => <MenuItem key={t.apiName} value={t.apiName}>{t.displayName}</MenuItem>)}
          </TextField>
          {to && (
            <TextField size="small" label="anahtar" select value={toKey} onChange={(e) => setToKey(e.target.value)} sx={{ minWidth: 130 }}>
              {toKols.map((p) => <MenuItem key={p.apiName} value={p.apiName}>{p.apiName}</MenuItem>)}
            </TextField>
          )}
        </Stack>
        <Box>
          <Button size="small" variant="contained" startIcon={<AddIcon />} disabled={!gecerli} onClick={ekle}>
            İlişki ekle
          </Button>
          {from && to && (
            <Chip size="small" sx={{ ml: 1 }} label={`değer-bazlı: ${from}.${fromKey || '?'} = ${to}.${toKey || '?'}`} />
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
