import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendIcon from '@mui/icons-material/Send';
import HubIcon from '@mui/icons-material/Hub';
import PublicIcon from '@mui/icons-material/Public';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
  useTheme,
  alpha,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { fetchEvents } from '../alarmlar/api';
import { getSenkronizasyon } from '../karar/api';
import { SenkronizasyonMatrisi, SenkOzetSerit } from '../components/SenkronizasyonMatrisi';
import { useNesneDetay } from '../nesne/NesneDetay';
import { fetchAnalyses, fetchAnalysis } from '../api/client';
import { panelToMercek } from '../asistan/api';
import { useDatasetSchema } from '../api/hooks';
import { useAsistan } from '../asistan/AsistanContext';
import { BoardBody } from '../components/BoardCard';
import type { PathContext } from '../components/PathEditor';
import { CHART_INK, compactNumber, fullNumber, seriesColor } from '../core/vizPalette';
import { SmartTimeseries } from '../core/SmartTimeseries';
import { propagatePath } from '../core/schemaPropagation';
import {
  fetchMercekAnalysis,
  useObjectSet,
  useObjectSetAggregate,
  useObjectSetTimeseries,
} from '../mercek/api';
import { fetchMercekAnalyses } from '../mercek/api';
import { ObjectSetTableBody } from '../mercek/cards/ObjectSetTableBody';
import { MercekWidgetBody } from '../mercek/MercekWidgetBody';
import type { MercekAnalysis } from '../types/mercek';
import type { Gadget } from './api';
import { MiniHarita } from './MiniHarita';
import { useCaprazDef, useCaprazFiltre } from './caprazFiltre';
import { useWindowStart, withPencere } from './pencere';

/**
 * Gadget gövdeleri — birleşik dashboard'un yapı taşları. Sorgu gadget'ları
 * canlı modda kendiliğinden tazelenir; harman_board/mercek_kart mevcut
 * analizlerin CANLI projeksiyonudur (kopya değil — kaynak analiz değişince
 * gadget da değişir).
 */

export function GadgetBody({ gadget }: { gadget: Gadget }) {
  switch (gadget.tip) {
    case 'stat':
      return <StatGadget gadget={gadget} />;
    case 'grafik':
      return <GrafikGadget gadget={gadget} />;
    case 'zaman':
      return <ZamanGadget gadget={gadget} />;
    case 'tablo':
      return <TabloGadget gadget={gadget} />;
    case 'liste':
      return <ListeGadget gadget={gadget} />;
    case 'pivot':
      return <PivotGadget gadget={gadget} />;
    case 'dagilim':
      return <DagilimGadget gadget={gadget} />;
    case 'harita':
      return (
        <MiniHarita
          siniflandirmalar={gadget.siniflandirmalar}
          pencereDk={gadget.pencereDk ?? 15}
        />
      );
    case 'alarmlar':
      return <AlarmlarGadget limit={gadget.limit ?? 6} />;
    case 'analizler':
      return <AnalizlerGadget limit={gadget.limit ?? 6} />;
    case 'senkronizasyon':
      return <SenkronizasyonGadget limit={gadget.limit ?? 24} />;
    case 'asistan':
      return <AsistanGadget />;
    case 'harman_board':
      return <HarmanBoardGadget gadget={gadget} />;
    case 'mercek_kart':
      return <MercekKartGadget gadget={gadget} />;
  }
}

/** Gadget başlığı (baslik verilmemişse tipe göre makul varsayılan) */
export function gadgetTitle(g: Gadget): string {
  if (g.baslik) return g.baslik;
  switch (g.tip) {
    case 'stat':
      return 'Sayı';
    case 'grafik':
      return `Grafik · ${g.groupBy}${g.segmentBy ? ` × ${g.segmentBy}` : ''}`;
    case 'zaman':
      return `Zaman serisi · ${g.dateProperty} (${g.granularity})`;
    case 'tablo':
      return 'Tablo';
    case 'liste':
      return `Sıralı liste · ${g.groupBy}`;
    case 'pivot':
      return `Özet · ${g.groupBy} × ${g.segmentBy}`;
    case 'dagilim':
      return `Dağılım · ${g.xColumn} × ${g.yColumn}`;
    case 'harita':
      return 'Canlı harita';
    case 'alarmlar':
      return 'Son alarmlar';
    case 'analizler':
      return 'Son analizler';
    case 'senkronizasyon':
      return 'Senkronizasyon matrisi';
    case 'asistan':
      return 'Asistan';
    case 'harman_board':
      return 'Harman board';
    case 'mercek_kart':
      return 'Mercek kartı';
  }
}

/**
 * Def taşıyan gadget'ı tek tıkla kalıcı Mercek analizine çevirir — dashboard
 * kutucuğu çıkmaz sokak değildir; "ilgili uygulamada aç" her yerde var.
 * null dönerse bu gadget tipi Mercek'e açılamaz (harita/alarm/asistan...).
 */
export async function gadgetToMercek(g: Gadget): Promise<string | null> {
  if (!('def' in g)) return null;
  const isim = gadgetTitle(g);
  const gorseller =
    g.tip === 'stat'
      ? [
          {
            tip: 'metrik',
            kume: 0,
            metricFn: g.metric.fn,
            ...(g.metric.property ? { metricProperty: g.metric.property } : {}),
          },
        ]
      : g.tip === 'grafik'
        ? [
            {
              tip: 'grafik',
              kume: 0,
              groupBy: g.groupBy,
              ...(g.segmentBy ? { segmentBy: g.segmentBy } : {}),
              metricFn: g.metric.fn,
              ...(g.metric.property ? { metricProperty: g.metric.property } : {}),
              ...(g.grafikTuru ? { grafikTuru: g.grafikTuru } : {}),
            },
          ]
        : g.tip === 'zaman'
          ? [
              {
                tip: 'zaman',
                kume: 0,
                dateProperty: g.dateProperty,
                granularity: g.granularity,
                metricFn: g.metric.fn,
                ...(g.metric.property ? { metricProperty: g.metric.property } : {}),
              },
            ]
          : undefined;
  const r = await panelToMercek({
    isim,
    kumeler: [{ def: g.def }],
    ...(gorseller ? { gorseller } : {}),
  });
  return r.url;
}

// --- Sorgu gadget'ları -----------------------------------------------------

function usePencereliDef(
  g: Extract<Gadget, { def: unknown; pencereDk?: number }> & { id: string },
) {
  const windowStart = useWindowStart(g.pencereDk);
  const pencereli = useMemo(
    () => withPencere(g.def, windowStart, g.pencereKolon),
    [g.def, windowStart, g.pencereKolon],
  );
  // Çapraz filtre: başka bir gadget'ta seçim yapıldıysa buraya da uygulanır
  return useCaprazDef(pencereli, g.id);
}

function StatGadget({ gadget }: { gadget: Extract<Gadget, { tip: 'stat' }> }) {
  const navigate = useNavigate();
  const def = usePencereliDef(gadget);
  const { data, error } = useObjectSetAggregate({ def, metric: gadget.metric });
  // Tek seçenek harita değil: tıklama menü açar — Haritada / Mercek'te
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  if (error) return <Alert severity="error">{String(error)}</Alert>;
  return (
    <>
      <Stack
        onClick={(e) => setMenu(e.currentTarget)}
        sx={{ height: '100%', justifyContent: 'center', px: 1, cursor: 'pointer' }}
      >
        {data ? (
          <Typography
            variant="h3"
            sx={{ fontWeight: 700, lineHeight: 1, color: `${gadget.renk ?? 'primary'}.main` }}
          >
            {compactNumber.format(data.rows[0]?.value ?? 0)}
          </Typography>
        ) : (
          <Skeleton width={110} height={52} />
        )}
        <Typography variant="caption" color="text.secondary">
          {gadget.metric.fn}
          {gadget.metric.property ? `(${gadget.metric.property})` : ''}
          {gadget.pencereDk ? ` · son ${gadget.pencereDk} dk` : ''}
        </Typography>
      </Stack>
      <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
        {gadget.link && (
          <MenuItem
            onClick={() => {
              setMenu(null);
              navigate(gadget.link!);
            }}
          >
            <ListItemIcon>
              <PublicIcon fontSize="small" />
            </ListItemIcon>
            Haritada aç
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setMenu(null);
            void gadgetToMercek(gadget).then((url) => url && navigate(url));
          }}
        >
          <ListItemIcon>
            <HubIcon fontSize="small" />
          </ListItemIcon>
          Mercek'te aç
        </MenuItem>
      </Menu>
    </>
  );
}

function GrafikGadget({ gadget }: { gadget: Extract<Gadget, { tip: 'grafik' }> }) {
  const dilimAyrac = useTheme().palette.background.paper;
  const def = usePencereliDef(gadget);
  const capraz = useCaprazFiltre();
  const sec = (grup: unknown) =>
    grup != null &&
    capraz.uygula({
      kolon: gadget.groupBy,
      deger: String(grup),
      kaynakId: gadget.id,
      etiket: gadget.baslik,
    });
  const { data, error } = useObjectSetAggregate({
    def,
    groupBy: gadget.groupBy,
    segmentBy: gadget.segmentBy,
    metric: gadget.metric,
    limit: 30,
  });

  const { chartData, segmentKeys } = useMemo(() => {
    if (!data) return { chartData: [], segmentKeys: [] as string[] };
    if (!gadget.segmentBy) {
      return {
        chartData: data.rows.map((r) => ({ group: r.group ?? '(boş)', value: r.value })),
        segmentKeys: [],
      };
    }
    const byGroup = new Map<string, Record<string, unknown>>();
    const segs = new Set<string>();
    for (const r of data.rows) {
      const g = String(r.group ?? '(boş)');
      const s = String(r.segment ?? '(boş)');
      segs.add(s);
      const row = byGroup.get(g) ?? { group: g };
      row[s] = r.value;
      byGroup.set(g, row);
    }
    return { chartData: [...byGroup.values()], segmentKeys: [...segs].slice(0, 8) };
  }, [data, gadget.segmentBy]);

  if (error) return <Alert severity="error">{String(error)}</Alert>;
  if (!data) return <Skeleton variant="rounded" height="100%" />;

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={120}>
      {gadget.grafikTuru === 'pie' ? (
        <PieChart>
          <ChartTooltip formatter={(v) => fullNumber.format(Number(v))} />
          <Legend layout="vertical" align="right" verticalAlign="middle" />
          <Pie
            data={chartData.slice(0, 8)}
            dataKey="value"
            nameKey="group"
            outerRadius="85%"
            labelLine={false}
            isAnimationActive={false}
          >
            {chartData.slice(0, 8).map((_, i) => (
              <Cell key={i} fill={seriesColor(i)} stroke={dilimAyrac} strokeWidth={2} />
            ))}
          </Pie>
        </PieChart>
      ) : (
        <BarChart data={chartData} margin={{ top: 8, right: 8 }}>
          <CartesianGrid stroke={CHART_INK.gridline} vertical={false} />
          <XAxis
            dataKey="group"
            stroke={CHART_INK.baseline}
            tick={{ fill: CHART_INK.muted, fontSize: 11 }}
          />
          <YAxis
            stroke={CHART_INK.baseline}
            tick={{ fill: CHART_INK.muted, fontSize: 11 }}
            tickFormatter={(v: number) => compactNumber.format(v)}
            width={44}
          />
          <ChartTooltip formatter={(v) => fullNumber.format(Number(v))} />
          {segmentKeys.length > 0 && <Legend />}
          {segmentKeys.length > 0 ? (
            segmentKeys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                stackId="s"
                fill={seriesColor(i)}
                isAnimationActive={false}
                cursor="pointer"
                onClick={(d: { payload?: { group?: unknown } }) => sec(d.payload?.group)}
              />
            ))
          ) : (
            <Bar
              dataKey="value"
              fill={seriesColor(0)}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
              cursor="pointer"
              onClick={(d: { payload?: { group?: unknown } }) => sec(d.payload?.group)}
            />
          )}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

function ZamanGadget({ gadget }: { gadget: Extract<Gadget, { tip: 'zaman' }> }) {
  const def = usePencereliDef(gadget);
  const { data, error } = useObjectSetTimeseries({
    def,
    dateProperty: gadget.dateProperty,
    metric: gadget.metric,
    granularity: gadget.granularity,
  });
  if (error) return <Alert severity="error">{String(error)}</Alert>;
  if (!data) return <Skeleton variant="rounded" height="100%" />;
  return <SmartTimeseries points={data.points} height={220} />;
}

function TabloGadget({ gadget }: { gadget: Extract<Gadget, { tip: 'tablo' }> }) {
  const def = usePencereliDef(gadget);
  return <ObjectSetTableBody def={def} />;
}

function ListeGadget({ gadget }: { gadget: Extract<Gadget, { tip: 'liste' }> }) {
  const def = usePencereliDef(gadget);
  const capraz = useCaprazFiltre();
  const { data, error } = useObjectSetAggregate({
    def,
    groupBy: gadget.groupBy,
    metric: gadget.metric,
    limit: gadget.limit ?? 10,
  });
  if (error) return <Alert severity="error">{String(error)}</Alert>;
  if (!data) return <Skeleton variant="rounded" height="100%" />;
  const rows = [...data.rows].sort((a, b) => b.value - a.value).slice(0, gadget.limit ?? 10);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Stack spacing={0.5} sx={{ height: '100%', overflowY: 'auto', pr: 0.5 }}>
      {rows.map((r, i) => (
        <Box
          key={i}
          onClick={() =>
            r.group != null &&
            capraz.uygula({
              kolon: gadget.groupBy,
              deger: String(r.group),
              kaynakId: gadget.id,
              etiket: gadget.baslik,
            })
          }
          sx={{ position: 'relative', px: 1, py: 0.5, cursor: 'pointer', borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              width: `${(r.value / max) * 100}%`,
              bgcolor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.28 : 0.14),
              borderRadius: 1,
            }}
          />
          <Stack direction="row" sx={{ position: 'relative', justifyContent: 'space-between' }}>
            <Typography variant="caption" noWrap sx={{ fontWeight: 500 }}>
              {i + 1}. {String(r.group ?? '(boş)')}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {compactNumber.format(r.value)}
            </Typography>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function PivotGadget({ gadget }: { gadget: Extract<Gadget, { tip: 'pivot' }> }) {
  const pivotBas = useTheme().palette.background.paper; // yapışkan başlık = kart zemini
  const def = usePencereliDef(gadget);
  const capraz = useCaprazFiltre();
  const { data, error } = useObjectSetAggregate({
    def,
    groupBy: gadget.groupBy,
    segmentBy: gadget.segmentBy,
    metric: gadget.metric,
    limit: 200,
  });
  const { satirlar, sutunlar, hucre } = useMemo(() => {
    const satir = new Set<string>();
    const sutun = new Set<string>();
    const m = new Map<string, number>();
    for (const r of data?.rows ?? []) {
      const g = String(r.group ?? '(boş)');
      const s = String(r.segment ?? '(boş)');
      satir.add(g);
      sutun.add(s);
      m.set(`${g}||${s}`, r.value);
    }
    return {
      satirlar: [...satir].slice(0, 30),
      sutunlar: [...sutun].slice(0, 12),
      hucre: m,
    };
  }, [data]);
  if (error) return <Alert severity="error">{String(error)}</Alert>;
  if (!data) return <Skeleton variant="rounded" height="100%" />;
  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '3px 6px', position: 'sticky', top: 0, background: pivotBas }}>
              {gadget.groupBy} \ {gadget.segmentBy}
            </th>
            {sutunlar.map((s) => (
              <th key={s} style={{ textAlign: 'right', padding: '3px 6px', position: 'sticky', top: 0, background: pivotBas, whiteSpace: 'nowrap' }}>
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {satirlar.map((g) => (
            <tr key={g}>
              <td
                onClick={() =>
                  capraz.uygula({ kolon: gadget.groupBy, deger: g, kaynakId: gadget.id, etiket: gadget.baslik })
                }
                style={{ padding: '3px 6px', fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer' }}
              >
                {g}
              </td>
              {sutunlar.map((s) => {
                const v = hucre.get(`${g}||${s}`);
                return (
                  <td key={s} style={{ textAlign: 'right', padding: '3px 6px', color: v ? '#111' : '#ccc' }}>
                    {v ? compactNumber.format(v) : '·'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}

function DagilimGadget({ gadget }: { gadget: Extract<Gadget, { tip: 'dagilim' }> }) {
  const def = usePencereliDef(gadget);
  const { data, error } = useObjectSet(def, {}, gadget.limit ?? 500);
  const points = useMemo(
    () =>
      (data?.objects ?? [])
        .map((o) => ({ x: Number(o[gadget.xColumn]), y: Number(o[gadget.yColumn]) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    [data, gadget.xColumn, gadget.yColumn],
  );
  if (error) return <Alert severity="error">{String(error)}</Alert>;
  if (!data) return <Skeleton variant="rounded" height="100%" />;
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={120}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={CHART_INK.gridline} />
        <XAxis
          type="number"
          dataKey="x"
          name={gadget.xColumn}
          stroke={CHART_INK.baseline}
          tick={{ fill: CHART_INK.muted, fontSize: 10 }}
          tickFormatter={(v: number) => compactNumber.format(v)}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={gadget.yColumn}
          stroke={CHART_INK.baseline}
          tick={{ fill: CHART_INK.muted, fontSize: 10 }}
          tickFormatter={(v: number) => compactNumber.format(v)}
          width={40}
        />
        <ZAxis range={[24, 24]} />
        <ChartTooltip
          cursor={{ strokeDasharray: '3 3' }}
          formatter={(v: unknown) => fullNumber.format(Number(v))}
        />
        <Scatter data={points} fill={seriesColor(0)} fillOpacity={0.5} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// --- Platform gadget'ları ----------------------------------------------------

function AlarmlarGadget({ limit }: { limit: number }) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['alerts', 'events', 'pano', limit],
    queryFn: () => fetchEvents(limit),
    refetchInterval: 10_000,
  });
  if (!data) return <Skeleton variant="rounded" height="100%" />;
  if (data.events.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
        Alarm yok. Asistana "…olursa haber ver" diyerek kural kurabilirsin.
      </Typography>
    );
  }
  return (
    <List dense disablePadding sx={{ overflowY: 'auto', height: '100%' }}>
      {data.events.map((e) => (
        <ListItemButton key={e.id} onClick={() => navigate('/alarmlar')} sx={{ px: 1 }}>
          <ListItemText
            primary={e.message}
            secondary={new Date(e.firedAt).toLocaleString('tr-TR')}
            slotProps={{
              primary: { variant: 'body2', sx: { fontWeight: e.acknowledged ? 400 : 600 } },
              secondary: { variant: 'caption' },
            }}
          />
        </ListItemButton>
      ))}
    </List>
  );
}

function SenkronizasyonGadget({ limit }: { limit: number }) {
  const detay = useNesneDetay();
  const { data } = useQuery({
    queryKey: ['senkronizasyon', 'pano', limit],
    queryFn: () => getSenkronizasyon(limit),
    refetchInterval: 10_000,
  });
  if (!data) return <Skeleton variant="rounded" height="100%" />;
  return (
    <Stack sx={{ height: '100%' }}>
      <Box sx={{ px: 1, pb: 0.5 }}>
        <SenkOzetSerit ozet={data.ozet} />
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <SenkronizasyonMatrisi
          matris={data}
          kompakt
          maxYukseklik="100%"
          onIz={(izNo) => detay.ac('iz', izNo)}
          onSatir={(s) => s.pk && detay.ac('platform', s.pk)}
        />
      </Box>
    </Stack>
  );
}

function AnalizlerGadget({ limit }: { limit: number }) {
  const navigate = useNavigate();
  const { data: harman } = useQuery({ queryKey: ['analyses'], queryFn: fetchAnalyses });
  const { data: mercek } = useQuery({
    queryKey: ['mercek-analyses'],
    queryFn: fetchMercekAnalyses,
  });
  const items = useMemo(() => {
    const h = (harman?.analyses ?? []).map((a) => ({ ...a, app: 'harman' as const }));
    const m = (mercek?.analyses ?? []).map((a) => ({ ...a, app: 'mercek' as const }));
    return [...h, ...m].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
  }, [harman, mercek, limit]);

  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
        Henüz analiz yok — asistana "analiz kur" demen yeterli.
      </Typography>
    );
  }
  return (
    <List dense disablePadding sx={{ overflowY: 'auto', height: '100%' }}>
      {items.map((a) => (
        <ListItemButton
          key={`${a.app}-${a.id}`}
          onClick={() => navigate(`/${a.app}/${a.id}`)}
          sx={{ px: 1 }}
        >
          <Chip
            size="small"
            label={a.app === 'harman' ? 'Harman' : 'Mercek'}
            color={a.app === 'harman' ? 'primary' : 'secondary'}
            variant="outlined"
            sx={{ mr: 1, minWidth: 72 }}
          />
          <ListItemText
            primary={a.name}
            secondary={new Date(a.updatedAt).toLocaleString('tr-TR')}
            slotProps={{ primary: { variant: 'body2' }, secondary: { variant: 'caption' } }}
          />
        </ListItemButton>
      ))}
    </List>
  );
}

function AsistanGadget() {
  const { send, setOpen, available, busy } = useAsistan();
  const location = useLocation();
  const [text, setText] = useState('');

  const gonder = (t: string) => {
    if (!t.trim() || busy) return;
    setText('');
    setOpen(true);
    void send(t, location.pathname);
  };

  const ornekler = [
    'Kaç tane düşman iz var?',
    'Son gözlemlerin saatlik trendini çıkar',
    'İzleme paneli dashboard\'u kur',
  ];

  return (
    <Stack sx={{ height: '100%', justifyContent: 'center', px: 0.5 }} spacing={1}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <AutoAwesomeIcon color="primary" />
        <TextField
          fullWidth
          size="small"
          placeholder="Asistana sor: sorgula, haritada göster, dashboard kur… (⌘K)"
          value={text}
          disabled={available === false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              gonder(text);
            }
          }}
          sx={{ bgcolor: 'background.paper' }}
        />
        <IconButton
          color="primary"
          disabled={!text.trim() || busy || available === false}
          onClick={() => gonder(text)}
        >
          <SendIcon />
        </IconButton>
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', pl: 4.5 }}>
        {ornekler.map((o) => (
          <Chip
            key={o}
            size="small"
            label={o}
            onClick={() => gonder(o)}
            disabled={available === false || busy}
            sx={{ cursor: 'pointer' }}
          />
        ))}
      </Stack>
    </Stack>
  );
}

// --- Uygulama projeksiyon gadget'ları ------------------------------------------

function HarmanBoardGadget({ gadget }: { gadget: Extract<Gadget, { tip: 'harman_board' }> }) {
  const { data: doc, error } = useQuery({
    queryKey: ['analysis', gadget.analysisId],
    queryFn: () => fetchAnalysis(gadget.analysisId),
    retry: false,
  });
  const path = doc?.paths.find((p) => p.id === gadget.pathId);
  const board = path?.boards.find((b) => b.id === gadget.boardId);
  const datasetId = path?.source.kind === 'dataset' ? path.source.datasetId : undefined;
  const { data: schemaData } = useDatasetSchema(datasetId);

  const schemas = useMemo(
    () => (schemaData && path ? propagatePath(schemaData.schema, path.boards) : undefined),
    [schemaData, path],
  );

  if (error) return <Alert severity="warning">Kaynak analiz bulunamadı — gadget'ı kaldırabilirsiniz.</Alert>;
  if (!doc) return <Skeleton variant="rounded" height="100%" />;
  if (!path || !board) {
    return <Alert severity="warning">Kaynak board silinmiş — gadget'ı kaldırabilirsiniz.</Alert>;
  }
  if (!datasetId || !schemaData || !schemas) return <Skeleton variant="rounded" height="100%" />;

  const index = path.boards.findIndex((b) => b.id === board.id);
  const parameters = Object.fromEntries(doc.parameters.map((p) => [p.name, p.value]));
  const ctx: PathContext = { path, datasetId, datasetVersion: schemaData.version, parameters };

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <BoardBody ctx={ctx} board={board} index={index} inputSchema={schemas[index]} />
      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
        <Button
          size="small"
          component={Link}
          to={`/harman/${gadget.analysisId}`}
          endIcon={<ArrowForwardIcon />}
          sx={{ textTransform: 'none' }}
        >
          Harman'da aç
        </Button>
      </Stack>
    </Box>
  );
}

function MercekKartGadget({ gadget }: { gadget: Extract<Gadget, { tip: 'mercek_kart' }> }) {
  const { data: doc, error } = useQuery({
    queryKey: ['mercek-analysis', gadget.analysisId],
    queryFn: () => fetchMercekAnalysis(gadget.analysisId),
    retry: false,
  });
  if (error) return <Alert severity="warning">Kaynak analiz bulunamadı — gadget'ı kaldırabilirsiniz.</Alert>;
  if (!doc) return <Skeleton variant="rounded" height="100%" />;
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <MercekWidgetBody analysis={doc as MercekAnalysis} cardId={gadget.cardId} />
      </Box>
      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
        <Button
          size="small"
          component={Link}
          to={`/mercek/${gadget.analysisId}`}
          endIcon={<ArrowForwardIcon />}
          sx={{ textTransform: 'none' }}
        >
          Mercek'te aç
        </Button>
      </Stack>
    </Box>
  );
}
