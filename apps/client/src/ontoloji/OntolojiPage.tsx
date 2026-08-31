import AccountTreeIcon from '@mui/icons-material/AccountTree';
import DownloadIcon from '@mui/icons-material/Download';
import KeyIcon from '@mui/icons-material/Key';
import {
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMemo } from 'react';
import { Link as RouterLink } from 'react-router';
import { getToken } from '../auth/auth';
import { TopNav } from '../components/TopNav';
import { seriesColor } from '../core/vizPalette';
import { useOntology } from '../mercek/api';
import type { LinkTypeDef, ObjectTypeDef } from '../types/mercek';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const TIP_ETIKET: Record<string, string> = {
  string: 'metin',
  integer: 'tam sayı',
  double: 'ondalık',
  boolean: 'evet/hayır',
  date: 'tarih',
  timestamp: 'zaman',
};

/**
 * Ontoloji Gezgini (Sprint 1) — sistemin ORTAK DİLİNİ görselleştirir:
 * nesne tipleri (özellikleriyle), ilişkiler ve MIM kaynak izlenebilirliği.
 * Salt-okunur; veri `GET /ontology`'den. "OWL/Turtle indir" ile standart
 * dışa aktarım (birlikte çalışabilirlik). Ontoloji yönetimi (düzenleme) ayrı
 * bir yüzeydir — bkz. docs/SPRINT_ONTOLOJI_YONETIMI.md.
 */
export function OntolojiPage() {
  const { data: ontology, isLoading } = useOntology();

  const renkOf = useMemo(() => {
    const idx = new Map((ontology?.objectTypes ?? []).map((t, i) => [t.apiName, i]));
    return (apiName: string) => seriesColor(idx.get(apiName) ?? 0);
  }, [ontology]);

  const linklerOf = useMemo(() => {
    const m = new Map<string, LinkTypeDef[]>();
    for (const l of ontology?.linkTypes ?? []) {
      (m.get(l.fromObjectType) ?? m.set(l.fromObjectType, []).get(l.fromObjectType)!).push(l);
    }
    return m;
  }, [ontology]);

  const ttlIndir = () => {
    // Turtle text/turtle döner; token'lı basit indirme
    fetch(`${BASE_URL}/ontology.ttl`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.text())
      .then((ttl) => {
        const url = URL.createObjectURL(new Blob([ttl], { type: 'text/turtle' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'verim-ontoloji.ttl';
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <TopNav />
      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
          <AccountTreeIcon color="primary" />
          <Typography variant="h5" sx={{ flexGrow: 1 }}>
            Ontoloji — Sistemin Ortak Dili
          </Typography>
          <Tooltip title="Ontolojiyi W3C OWL/Turtle formatında indir (birlikte çalışabilirlik)">
            <Chip
              icon={<DownloadIcon sx={{ fontSize: 16 }} />}
              label="OWL/Turtle indir"
              onClick={ttlIndir}
              variant="outlined"
              clickable
            />
          </Tooltip>
          <Chip
            component={RouterLink}
            to="/ontoloji/yonetim"
            label="Yönetim →"
            color="primary"
            variant="outlined"
            clickable
          />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Mercek, Bağlantı, Arama, Asistan ve Alarmlar — hepsi bu tanımdan doğar.
          Her tip bir MIM (MIP 4) kaynağına dayanır (kaynak rozetleri).
          {ontology && ` ${ontology.objectTypes.length} nesne tipi · ${ontology.linkTypes.length} ilişki.`}
        </Typography>

        {isLoading || !ontology ? (
          <Stack sx={{ alignItems: 'center', mt: 6 }}>
            <CircularProgress />
          </Stack>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            }}
          >
            {ontology.objectTypes.map((t) => (
              <TipKarti
                key={t.apiName}
                tip={t}
                renk={renkOf(t.apiName)}
                linkler={linklerOf.get(t.apiName) ?? []}
                adOf={(api) =>
                  ontology.objectTypes.find((o) => o.apiName === api)?.displayName ?? api
                }
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function TipKarti({
  tip,
  renk,
  linkler,
  adOf,
}: {
  tip: ObjectTypeDef;
  renk: string;
  linkler: LinkTypeDef[];
  adOf: (api: string) => string;
}) {
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', px: 1.5, py: 1, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}
      >
        <Box sx={{ fontSize: 22 }}>{tip.icon ?? '•'}</Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>
            {tip.displayName}
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
              {tip.pluralName}
            </Typography>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            <code>{tip.apiName}</code> · dataset: <code>{tip.datasetId}</code>
          </Typography>
        </Box>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: renk }} />
      </Stack>

      {/* Özellikler */}
      <Table size="small">
        <TableBody>
          {tip.properties.map((p) => (
            <TableRow key={p.apiName}>
              <TableCell sx={{ py: 0.4, border: 0 }}>
                {p.apiName === tip.primaryKey && (
                  <Tooltip title="Birincil anahtar">
                    <KeyIcon sx={{ fontSize: 13, mr: 0.5, color: 'warning.main', verticalAlign: 'middle' }} />
                  </Tooltip>
                )}
                <Typography component="span" variant="body2">{p.displayName}</Typography>
              </TableCell>
              <TableCell align="right" sx={{ py: 0.4, border: 0 }}>
                <Chip
                  size="small"
                  label={TIP_ETIKET[p.type] ?? p.type}
                  sx={{ height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.75 } }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* İlişkiler (giden) */}
      {linkler.length > 0 && (
        <Box sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            İlişkiler
          </Typography>
          <Stack spacing={0.25} sx={{ mt: 0.5 }}>
            {linkler.map((l) => (
              <Typography key={l.apiName} variant="caption" sx={{ display: 'block' }}>
                → <b>{adOf(l.toObjectType)}</b> · {l.displayName}
                <Typography component="span" variant="caption" color="text.secondary">
                  {' '}({l.cardinality === 'one' ? 'tekil' : 'çoğul'}, {l.fromKey}={l.toKey})
                </Typography>
              </Typography>
            ))}
          </Stack>
        </Box>
      )}

    </Paper>
  );
}
