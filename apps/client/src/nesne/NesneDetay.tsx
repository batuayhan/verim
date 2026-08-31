import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import HubIcon from '@mui/icons-material/Hub';
import PublicIcon from '@mui/icons-material/Public';
import {
  Box,
  Breadcrumbs,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Link as MuiLink,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { panelToMercek } from '../asistan/api';
import { useObjectSet, useObjectSetAggregate, useOntology } from '../mercek/api';
import type { LinkTypeDef, ObjectSetDef, OntologyResponse } from '../types/mercek';

/**
 * NESNE DETAYI — ontolojinin gezilebilir yüzü. Herhangi bir yerden
 * (harita popup'ı, tablo satırı, panel) bir nesne açılır; özellikleri,
 * İLİŞKİLİ nesneleri (ontoloji linklerinden searchAround) ve başka
 * tiplerin anahtarına denk gelen değerleri tıklanabilir gösterir.
 * Her tıklama yığına iter → detayın detayının detayı sonsuz gezilir;
 * breadcrumb ile geri dönülür. "Ontoloji tam olarak bu."
 */

/**
 * Gezinti yığınının iki adım türü vardır — ontolojide iki şey gezilir:
 *  - nesne: tekil bir varlık (iz IZ-0042, sensör SNS-0170...)
 *  - kume:  bir KAVRAM DEĞERİNİ paylaşan nesneler (domain=Hava olan izler,
 *    kademe=Tugay olan birlikler...). "Hava" bir nesne değil, kontrollü
 *    sözlükten bir koddur (MIM'de DimensionCode) — ontolojik karşılığı
 *    "bu değeri taşıyan küme"ye gitmektir.
 */
export type NesneRef =
  | { kind: 'nesne'; objectType: string; pk: string }
  | { kind: 'kume'; objectType: string; column: string; value: string };

interface NesneDetayState {
  ac: (objectType: string, pk: string) => void;
  acKume: (objectType: string, column: string, value: string) => void;
  kapat: () => void;
}

const Ctx = createContext<NesneDetayState | null>(null);

export function useNesneDetay(): NesneDetayState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNesneDetay, NesneDetayProvider içinde kullanılmalı');
  return v;
}

export function NesneDetayProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<NesneRef[]>([]);

  const push = useCallback((entry: NesneRef) => {
    setStack((prev) => {
      const top = prev[prev.length - 1];
      if (top && JSON.stringify(top) === JSON.stringify(entry)) return prev;
      return [...prev.slice(-19), entry];
    });
  }, []);
  const ac = useCallback(
    (objectType: string, pk: string) => push({ kind: 'nesne', objectType, pk }),
    [push],
  );
  const acKume = useCallback(
    (objectType: string, column: string, value: string) =>
      push({ kind: 'kume', objectType, column, value }),
    [push],
  );
  const kapat = useCallback(() => setStack([]), []);

  const value = useMemo(() => ({ ac, acKume, kapat }), [ac, acKume, kapat]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Drawer
        anchor="right"
        open={stack.length > 0}
        onClose={kapat}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 480 } } } }}
      >
        {stack.length > 0 && (
          <DetayIcerik
            stack={stack}
            onGeri={() => setStack((p) => p.slice(0, -1))}
            onSec={(i) => setStack((p) => p.slice(0, i + 1))}
            onAc={ac}
            onAcKume={acKume}
            onKapat={kapat}
          />
        )}
      </Drawer>
    </Ctx.Provider>
  );
}

function DetayIcerik({
  stack,
  onGeri,
  onSec,
  onAc,
  onAcKume,
  onKapat,
}: {
  stack: NesneRef[];
  onGeri: () => void;
  onSec: (index: number) => void;
  onAc: (objectType: string, pk: string) => void;
  onAcKume: (objectType: string, column: string, value: string) => void;
  onKapat: () => void;
}) {
  const { data: ontology } = useOntology();
  const aktif = stack[stack.length - 1];
  const tip = ontology?.objectTypes.find((t) => t.apiName === aktif.objectType);

  const kolonAdi = (column: string) =>
    tip?.properties.find((p) => p.apiName === column)?.displayName ?? column;

  const crumb = (s: NesneRef) =>
    s.kind === 'nesne' ? s.pk : `${s.column}=${s.value}`;

  const baslik =
    aktif.kind === 'nesne'
      ? `${tip?.displayName ?? aktif.objectType} · ${aktif.pk}`
      : `${tip?.pluralName ?? aktif.objectType} · ${kolonAdi(aktif.column)} = ${aktif.value}`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ px: 1.5, py: 1, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}
      >
        {stack.length > 1 && (
          <IconButton size="small" onClick={onGeri}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        )}
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }} noWrap>
          {tip?.icon} {baslik}
        </Typography>
        <IconButton size="small" onClick={onKapat}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      {stack.length > 1 && (
        <Breadcrumbs
          separator="›"
          sx={{ px: 1.5, py: 0.5, '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap', overflow: 'auto' } }}
        >
          {stack.map((s, i) =>
            i === stack.length - 1 ? (
              <Typography key={i} variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                {crumb(s)}
              </Typography>
            ) : (
              <MuiLink
                key={i}
                component="button"
                variant="caption"
                onClick={() => onSec(i)}
                sx={{ whiteSpace: 'nowrap' }}
              >
                {crumb(s)}
              </MuiLink>
            ),
          )}
        </Breadcrumbs>
      )}

      {aktif.kind === 'nesne' ? (
        <NesneGovde
          aktif={aktif}
          ontology={ontology}
          onAc={onAc}
          onAcKume={onAcKume}
          onKapat={onKapat}
        />
      ) : (
        <KumeGovde
          aktif={aktif}
          ontology={ontology}
          onAc={onAc}
          onAcKume={onAcKume}
          onKapat={onKapat}
        />
      )}
    </Box>
  );
}

function NesneGovde({
  aktif,
  ontology,
  onAc,
  onAcKume,
  onKapat,
}: {
  aktif: Extract<NesneRef, { kind: 'nesne' }>;
  ontology: OntologyResponse | undefined;
  onAc: (objectType: string, pk: string) => void;
  onAcKume: (objectType: string, column: string, value: string) => void;
  onKapat: () => void;
}) {
  const navigate = useNavigate();
  const tip = ontology?.objectTypes.find((t) => t.apiName === aktif.objectType);

  const def = useMemo<ObjectSetDef>(
    () => ({ type: 'fromPrimaryKeys', objectType: aktif.objectType, keys: [aktif.pk] }),
    [aktif],
  );
  const { data } = useObjectSet(def, {}, 1);
  const nesne = data?.objects[0];

  // Başka bir tipin birincil anahtarına denk gelen kolonlar tıklanabilir
  // (örn. iz.sensor_no → sensor detayı) — ontolojinin kendisi yol gösterir
  const pkTipHaritasi = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of ontology?.objectTypes ?? []) m.set(t.primaryKey, t.apiName);
    return m;
  }, [ontology]);

  const linkler = useMemo(
    () => (ontology?.linkTypes ?? []).filter((l) => l.fromObjectType === aktif.objectType),
    [ontology, aktif.objectType],
  );

  const konumlu =
    nesne && nesne.enlem !== null && nesne.enlem !== undefined && nesne.boylam != null;

  const mercekteAc = async () => {
    const r = await panelToMercek({
      isim: `${tip?.displayName ?? aktif.objectType} ${aktif.pk}`,
      kumeler: [{ def }],
    });
    onKapat();
    navigate(r.url);
  };

  return (
    <>
      {/* Diğer uygulamalarda aç — tek seçenek harita değil */}
      <Stack direction="row" spacing={1} sx={{ px: 1.5, py: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<HubIcon />}
          onClick={() => void mercekteAc()}
          sx={{ textTransform: 'none' }}
        >
          Mercek'te aç
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AccountTreeIcon />}
          onClick={() => {
            onKapat();
            navigate(`/graf?tip=${aktif.objectType}&pk=${encodeURIComponent(aktif.pk)}`);
          }}
          sx={{ textTransform: 'none' }}
        >
          Grafta aç
        </Button>
        {konumlu && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<PublicIcon />}
            onClick={() => {
              onKapat();
              navigate(
                `/harita?lat=${nesne!.enlem}&lon=${nesne!.boylam}&zoom=9&etiket=${encodeURIComponent(aktif.pk)}`,
              );
            }}
            sx={{ textTransform: 'none' }}
          >
            Haritada göster
          </Button>
        )}
      </Stack>
      <Divider />

      <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
        {!nesne && <Skeleton variant="rounded" height={220} sx={{ m: 1.5 }} />}
        {nesne && (
          <Table size="small">
            <TableBody>
              {(tip?.properties ?? data?.properties ?? []).map((p) => {
                const deger = nesne[p.apiName];
                const hedefTip =
                  p.apiName !== tip?.primaryKey ? pkTipHaritasi.get(p.apiName) : undefined;
                const nesneyeGider =
                  hedefTip && hedefTip !== aktif.objectType && deger != null && deger !== '';
                // Kavram/kod değerleri de ontolojiktir: tıkla → aynı değeri
                // paylaşan nesneler kümesi (domain=Hava → tüm hava izleri).
                // Zaman ve koordinat kolonlarında küme anlamlı değil.
                const kumeyeGider =
                  !nesneyeGider &&
                  p.apiName !== tip?.primaryKey &&
                  p.type !== 'date' &&
                  p.type !== 'timestamp' &&
                  p.apiName !== 'enlem' &&
                  p.apiName !== 'boylam' &&
                  deger != null &&
                  deger !== '';
                return (
                  <TableRow key={p.apiName}>
                    <TableCell sx={{ color: 'text.secondary', width: 150, fontSize: 12 }}>
                      {p.displayName}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>
                      {nesneyeGider ? (
                        <Chip
                          size="small"
                          label={String(deger)}
                          color="primary"
                          variant="outlined"
                          onClick={() => onAc(hedefTip, String(deger))}
                          sx={{ cursor: 'pointer', fontSize: 12 }}
                        />
                      ) : kumeyeGider ? (
                        <Tooltip
                          title={`${kolonBasligi(tip, p.apiName)} değeri "${formatDeger(deger)}" olan tüm ${tip?.pluralName ?? 'nesneler'}`}
                          placement="left"
                        >
                          <Chip
                            size="small"
                            label={formatDeger(deger)}
                            variant="outlined"
                            onClick={() => onAcKume(aktif.objectType, p.apiName, String(deger))}
                            sx={{ cursor: 'pointer', fontSize: 12 }}
                          />
                        </Tooltip>
                      ) : (
                        formatDeger(deger)
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* İlişkiler — ontoloji linklerinin canlı gezintisi */}
        {linkler.map((l) => (
          <LinkBolumu key={l.apiName} link={l} def={def} ontology={ontology} onAc={onAc} />
        ))}
      </Box>
    </>
  );
}

/** Bir KAVRAMIN (kod değerinin) görünümü — MIM'de HAVA da ontolojiktir
    (DimensionCode.AIR): bireyden (Birlik) farkı, durumunun değil onu
    taşıyan kümenin ve KARDEŞ değerlerinin (Kara, Deniz) tanımlayıcı
    olmasıdır. Satıra tıkla → nesne detayı; kardeş çipe tıkla → yanal geçiş. */
function KumeGovde({
  aktif,
  ontology,
  onAc,
  onAcKume,
  onKapat,
}: {
  aktif: Extract<NesneRef, { kind: 'kume' }>;
  ontology: OntologyResponse | undefined;
  onAc: (objectType: string, pk: string) => void;
  onAcKume: (objectType: string, column: string, value: string) => void;
  onKapat: () => void;
}) {
  const navigate = useNavigate();
  const tip = ontology?.objectTypes.find((t) => t.apiName === aktif.objectType);

  const def = useMemo<ObjectSetDef>(
    () => ({
      type: 'filter',
      base: { type: 'base', objectType: aktif.objectType },
      combinator: 'and',
      conditions: [
        {
          id: 'deger',
          column: aktif.column,
          operator: 'eq',
          values: [{ kind: 'literal', value: aktif.value }],
        },
      ],
    }),
    [aktif],
  );
  const { data } = useObjectSet(def, {}, 25);

  // Kardeş kavramlar: aynı kod listesinin diğer değerleri ve büyüklükleri
  // (Hava'dayken Kara/Deniz'e yanal geçiş — kavramın "ailesi" görünür)
  const { data: kardesler } = useObjectSetAggregate({
    def: { type: 'base', objectType: aktif.objectType },
    groupBy: aktif.column,
    metric: { fn: 'count' },
    limit: 12,
  });

  const ozetKolonlar = (tip?.properties ?? [])
    .filter((p) => p.apiName !== tip?.primaryKey && p.apiName !== aktif.column)
    .slice(0, 2);

  const mercekteAc = async () => {
    const r = await panelToMercek({
      isim: `${tip?.pluralName ?? aktif.objectType}: ${aktif.column} = ${aktif.value}`,
      kumeler: [{ def }],
    });
    onKapat();
    navigate(r.url);
  };

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ px: 1.5, py: 1, alignItems: 'center' }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<HubIcon />}
          onClick={() => void mercekteAc()}
          sx={{ textTransform: 'none' }}
        >
          Mercek'te aç
        </Button>
        {data && (
          <Typography variant="caption" color="text.secondary">
            {data.totalCount.toLocaleString('tr-TR')} {tip?.pluralName ?? 'nesne'}
          </Typography>
        )}
      </Stack>

      {kardesler && kardesler.rows.length > 1 && (
        <Stack
          direction="row"
          spacing={0.5}
          useFlexGap
          sx={{ px: 1.5, pb: 1, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
            Kardeş değerler:
          </Typography>
          {kardesler.rows.map((r) => {
            const v = String(r.group ?? '');
            const seciliMi = v === aktif.value;
            return (
              <Chip
                key={v}
                size="small"
                label={`${v} (${Number(r.value).toLocaleString('tr-TR')})`}
                color={seciliMi ? 'primary' : 'default'}
                variant={seciliMi ? 'filled' : 'outlined'}
                onClick={
                  seciliMi ? undefined : () => onAcKume(aktif.objectType, aktif.column, v)
                }
                sx={{ cursor: seciliMi ? 'default' : 'pointer', fontSize: 11 }}
              />
            );
          })}
        </Stack>
      )}
      <Divider />

      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 1.5, py: 1 }}>
        {!data && <Skeleton variant="rounded" height={220} />}
        <Stack spacing={0.5}>
          {data?.objects.map((o, i) => {
            const pk = String(o[tip?.primaryKey ?? ''] ?? '');
            return (
              <Stack
                key={i}
                direction="row"
                spacing={1}
                onClick={() => pk && onAc(aktif.objectType, pk)}
                sx={{
                  alignItems: 'center',
                  px: 1,
                  py: 0.5,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Chip size="small" label={pk || '?'} color="primary" variant="outlined" />
                {ozetKolonlar.map((p) => (
                  <Typography key={p.apiName} variant="caption" color="text.secondary" noWrap>
                    {p.displayName}: {formatDeger(o[p.apiName])}
                  </Typography>
                ))}
              </Stack>
            );
          })}
          {data && data.totalCount > data.objects.length && (
            <Typography variant="caption" color="text.disabled">
              +{(data.totalCount - data.objects.length).toLocaleString('tr-TR')} daha — tümü
              için Mercek'te aç
            </Typography>
          )}
        </Stack>
      </Box>
    </>
  );
}

function kolonBasligi(
  tip: { properties: Array<{ apiName: string; displayName: string }> } | undefined,
  apiName: string,
): string {
  return tip?.properties.find((p) => p.apiName === apiName)?.displayName ?? apiName;
}

function LinkBolumu({
  link,
  def,
  ontology,
  onAc,
}: {
  link: LinkTypeDef;
  def: ObjectSetDef;
  ontology: OntologyResponse | undefined;
  onAc: (objectType: string, pk: string) => void;
}) {
  const iliskiliDef = useMemo<ObjectSetDef>(
    () => ({ type: 'searchAround', base: def, linkType: link.apiName }),
    [def, link.apiName],
  );
  const { data } = useObjectSet(iliskiliDef, {}, 8);
  const hedef = ontology?.objectTypes.find((t) => t.apiName === link.toObjectType);
  if (!data || data.totalCount === 0) return null;

  // Anahtar + ilk iki bilgilendirici kolon (pk hariç) gösterilir
  const ozetKolonlar = (hedef?.properties ?? [])
    .filter((p) => p.apiName !== hedef?.primaryKey)
    .slice(0, 2);

  return (
    <Box sx={{ px: 1.5, pt: 1.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
        {link.displayName} · {data.totalCount} {hedef?.pluralName ?? link.toObjectType}
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        {data.objects.map((o, i) => {
          const pk = String(o[hedef?.primaryKey ?? ''] ?? '');
          return (
            <Stack
              key={i}
              direction="row"
              spacing={1}
              onClick={() => pk && onAc(link.toObjectType, pk)}
              sx={{
                alignItems: 'center',
                px: 1,
                py: 0.5,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Chip size="small" label={pk || '?'} color="primary" variant="outlined" />
              {ozetKolonlar.map((p) => (
                <Typography key={p.apiName} variant="caption" color="text.secondary" noWrap>
                  {p.displayName}: {formatDeger(o[p.apiName])}
                </Typography>
              ))}
            </Stack>
          );
        })}
        {data.totalCount > data.objects.length && (
          <Typography variant="caption" color="text.disabled">
            +{data.totalCount - data.objects.length} daha — tümü için Mercek'te aç
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function formatDeger(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('tr-TR');
  return String(v);
}
