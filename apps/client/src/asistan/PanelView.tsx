import HubIcon from '@mui/icons-material/Hub';
import PlaceIcon from '@mui/icons-material/Place';
import PublicIcon from '@mui/icons-material/Public';
import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useNesneDetay } from '../nesne/NesneDetay';
import { resultTypeOf } from '../nesne/resultType';
import { useOntology } from '../mercek/api';
import type { ObjectSetDef } from '../types/mercek';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_INK, compactNumber, fullNumber, seriesColor } from '../core/vizPalette';
import { SmartTimeseries } from '../core/SmartTimeseries';
import { setHaritaSeti } from '../harita/haritaSet';
import { panelToMercek, type AssistantPanel } from './api';

/**
 * Asistan cevabının İÇİNDE render edilen canlı panel: sorgu sonuçları sohbeti
 * terk etmeden tablo/grafik olarak görünür; her panel tek tıkla İLGİLİ
 * UYGULAMADA da açılır (grafik/zaman → Mercek'te kalıcı analiz, konumlu
 * tablo → Harita). Asistan cevabı hiçbir zaman çıkmaz sokak değildir.
 */
export function PanelView({ panel, onAction }: { panel: AssistantPanel; onAction: () => void }) {
  const navigate = useNavigate();
  const { data: ontology } = useOntology();
  const [acilis, setAcilis] = useState(false);

  const mercekteAc = async () => {
    if (acilis) return;
    setAcilis(true);
    try {
      const gorseller =
        panel.tip === 'grafik'
          ? [
              {
                tip: 'grafik',
                kume: 0,
                baslik: panel.baslik,
                groupBy: panel.groupBy,
                ...(panel.segmentBy ? { segmentBy: panel.segmentBy } : {}),
                metricFn: panel.metric.fn,
                ...(panel.metric.property ? { metricProperty: panel.metric.property } : {}),
              },
            ]
          : panel.tip === 'zaman'
            ? [
                {
                  tip: 'zaman',
                  kume: 0,
                  baslik: panel.baslik,
                  dateProperty: panel.dateProperty,
                  granularity: panel.granularity,
                  metricFn: panel.metric.fn,
                  ...(panel.metric.property ? { metricProperty: panel.metric.property } : {}),
                },
              ]
            : panel.tip === 'metrik'
              ? [
                  {
                    tip: 'metrik',
                    kume: 0,
                    baslik: panel.baslik,
                    metricFn: panel.metric.fn,
                    ...(panel.metric.property ? { metricProperty: panel.metric.property } : {}),
                  },
                ]
              : undefined;
      const r = await panelToMercek({
        isim: panel.baslik,
        kumeler: [{ def: panel.def }],
        ...(gorseller ? { gorseller } : {}),
      });
      onAction();
      navigate(r.url);
    } finally {
      setAcilis(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ mt: 0.75, overflow: 'hidden' }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          px: 1.25,
          py: 0.5,
          alignItems: 'center',
          bgcolor: 'action.hover',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, flexGrow: 1 }} noWrap>
          {panel.baslik}
        </Typography>
        {panel.tip === 'tablo' && panel.konumlu && panel.rows.length > 0 && (
          <Button
            size="small"
            startIcon={<PublicIcon sx={{ fontSize: 14 }} />}
            onClick={() => {
              // Haritada TAM OLARAK bu listede görünen satırlar gösterilir
              // (panelin ham def'i değil — o binlerce nesne eşleyebilir; oysa
              // kullanıcı gördüğü N satırı bekler). Satırların pk'lerinden
              // fromPrimaryKeys kümesi kurulur.
              const tip = resultTypeOf(panel.def as ObjectSetDef, ontology) ?? 'iz';
              const pkKol =
                ontology?.objectTypes.find((t) => t.apiName === tip)?.primaryKey ?? 'iz_no';
              const keys = panel.rows
                .map((r) => String(r[pkKol] ?? ''))
                .filter(Boolean);
              setHaritaSeti({
                def: { type: 'fromPrimaryKeys', objectType: tip, keys },
                baslik: panel.baslik,
                objectType: tip,
              });
              onAction();
              navigate(`/harita?set=${Date.now()}`);
            }}
            sx={{ textTransform: 'none', fontSize: 11, py: 0 }}
          >
            Haritada göster
          </Button>
        )}
        <Button
          size="small"
          disabled={acilis}
          startIcon={<HubIcon sx={{ fontSize: 14 }} />}
          onClick={() => void mercekteAc()}
          sx={{ textTransform: 'none', fontSize: 11, py: 0 }}
        >
          Mercek'te aç
        </Button>
      </Stack>

      {panel.tip === 'tablo' && <TabloBody panel={panel} onAction={onAction} />}
      {panel.tip === 'grafik' && <GrafikBody panel={panel} />}
      {panel.tip === 'metrik' && (
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1 }}>
            {fullNumber.format(panel.value)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {panel.metric.fn}
            {panel.metric.property ? `(${panel.metric.property})` : ''}
          </Typography>
        </Box>
      )}
      {panel.tip === 'zaman' && <ZamanBody panel={panel} />}
    </Paper>
  );
}

function haritaUrl(row: Record<string, unknown>, etiket: string): string {
  const p = new URLSearchParams({
    lat: String(row.enlem),
    lon: String(row.boylam),
    zoom: '9',
  });
  if (etiket) p.set('etiket', etiket);
  return `/harita?${p.toString()}`;
}

function TabloBody({
  panel,
  onAction,
}: {
  panel: Extract<AssistantPanel, { tip: 'tablo' }>;
  onAction: () => void;
}) {
  const navigate = useNavigate();
  const { data: ontology } = useOntology();
  const detay = useNesneDetay();
  // Satır tıklaması ontolojik detayı açar (sohbetten sonsuz drill)
  const sonucTipi = useMemo(
    () => resultTypeOf(panel.def as ObjectSetDef, ontology),
    [panel.def, ontology],
  );
  const pkKolonu = ontology?.objectTypes.find((t) => t.apiName === sonucTipi)?.primaryKey;
  // Dar sohbet panelinde ilk 6 kolon yeter; tamamı Mercek'te açılınca görünür
  const cols = panel.columns.slice(0, 6);
  return (
    <TableContainer sx={{ maxHeight: 240 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {panel.konumlu && <TableCell sx={{ width: 34, p: 0.5 }} />}
            {cols.map((c) => (
              <TableCell key={c} sx={{ fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                {c}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {panel.rows.map((r, i) => (
            <TableRow
              key={i}
              hover
              onClick={
                sonucTipi && pkKolonu && r[pkKolonu] != null
                  ? () => detay.ac(sonucTipi, String(r[pkKolonu]))
                  : undefined
              }
              sx={sonucTipi && pkKolonu ? { cursor: 'pointer' } : undefined}
            >
              {panel.konumlu && (
                <TableCell sx={{ p: 0.25 }}>
                  <Tooltip title="Bu konumu haritada aç">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction();
                        navigate(haritaUrl(r, String(r[panel.columns[0]] ?? '')));
                      }}
                    >
                      <PlaceIcon sx={{ fontSize: 15 }} color="primary" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              )}
              {cols.map((c) => (
                <TableCell key={c} sx={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                  {formatCell(r[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {panel.totalCount > panel.rows.length && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1.25, py: 0.5, display: 'block' }}>
          {panel.rows.length} / {compactNumber.format(panel.totalCount)} satır gösteriliyor —
          tamamı için Mercek'te aç
        </Typography>
      )}
    </TableContainer>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') return fullNumber.format(v);
  return String(v);
}

function GrafikBody({ panel }: { panel: Extract<AssistantPanel, { tip: 'grafik' }> }) {
  // Segmentli sonuç → geniş format (ChartCardBody ile aynı dönüşüm)
  const { chartData, segmentKeys } = useMemo(() => {
    if (!panel.segmentBy) {
      return {
        chartData: panel.rows.map((r) => ({ group: r.group ?? '(boş)', value: r.value })),
        segmentKeys: [] as string[],
      };
    }
    const byGroup = new Map<string, Record<string, unknown>>();
    const segs = new Set<string>();
    for (const r of panel.rows) {
      const g = String(r.group ?? '(boş)');
      const s = String(r.segment ?? '(boş)');
      segs.add(s);
      const row = byGroup.get(g) ?? { group: g };
      row[s] = r.value;
      byGroup.set(g, row);
    }
    return { chartData: [...byGroup.values()], segmentKeys: [...segs].slice(0, 8) };
  }, [panel.rows, panel.segmentBy]);

  return (
    <Box sx={{ height: 190, px: 1, pt: 1 }}>
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 4, right: 8 }}>
          <CartesianGrid stroke={CHART_INK.gridline} vertical={false} />
          <XAxis
            dataKey="group"
            stroke={CHART_INK.baseline}
            tick={{ fill: CHART_INK.muted, fontSize: 10 }}
          />
          <YAxis
            stroke={CHART_INK.baseline}
            tick={{ fill: CHART_INK.muted, fontSize: 10 }}
            tickFormatter={(v: number) => compactNumber.format(v)}
            width={44}
          />
          <ChartTooltip formatter={(v) => fullNumber.format(Number(v))} />
          {segmentKeys.length === 0 ? (
            <Bar dataKey="value" fill={seriesColor(0)} radius={[3, 3, 0, 0]} maxBarSize={42} />
          ) : (
            segmentKeys.map((s, i) => (
              <Bar
                key={s}
                dataKey={s}
                stackId="s"
                fill={seriesColor(i)}
                maxBarSize={42}
                name={s}
              />
            ))
          )}
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

function ZamanBody({ panel }: { panel: Extract<AssistantPanel, { tip: 'zaman' }> }) {
  return (
    <Box sx={{ px: 1, pt: 1, pb: 0.5 }}>
      <SmartTimeseries points={panel.points} height={180} showControls={false} />
    </Box>
  );
}
