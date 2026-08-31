import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import TuneIcon from '@mui/icons-material/Tune';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material';
import { nanoid } from '@reduxjs/toolkit';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useBoardResult } from '../../api/hooks';
import { CHART_INK, compactNumber, fullNumber, seriesColor } from '../../core/vizPalette';
import { buildVizQueryPlan, pivotSegmentedRows } from '../../core/vizQuery';
import { updateBoard } from '../../store/analysisSlice';
import { useAppDispatch } from '../../store/hooks';
import type {
  AggregationFn,
  ChartBoardConfig,
  ChartType,
  SeriesConfig,
} from '../../types/boards';
import { isNumeric, isTemporal } from '../../types/schema';
import {
  AGGREGATION_LABELS,
  allowedAggregations,
  columnsForAggregation,
} from '../../core/aggregations';
import type { BoardViewProps } from '../BoardCard';

const CHART_FNS: AggregationFn[] = ['count', 'countDistinct', 'sum', 'avg', 'min', 'max'];

const CHART_TYPES: Array<{ value: ChartType; label: string }> = [
  { value: 'bar', label: 'Bar' },
  { value: 'horizontalBar', label: 'H-Bar' },
  { value: 'line', label: 'Line' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'pie', label: 'Pie' },
];

function autoAlias(fn: AggregationFn, column?: string): string {
  return fn === 'count' ? 'Satır sayısı' : `${AGGREGATION_LABELS[fn]}(${column ?? '?'})`;
}

export function ChartBoardView({
  ctx,
  board,
  index,
  inputSchema,
}: BoardViewProps & { board: ChartBoardConfig }) {
  const dilimAyrac = useTheme().palette.background.paper;
  const dispatch = useAppDispatch();
  const [configOpen, setConfigOpen] = useState(!board.xAxis.column);
  const [tab, setTab] = useState<'data' | 'format'>('data');
  const [draft, setDraft] = useState<ChartBoardConfig>(board);

  const active = configOpen ? draft : board;
  const plan = useMemo(
    () => buildVizQueryPlan(ctx.path.boards.slice(0, index), active, inputSchema),
    [ctx.path.boards, index, active, inputSchema],
  );

  const { data, isFetching, error } = useBoardResult({
    datasetId: ctx.datasetId,
    datasetVersion: ctx.datasetVersion,
    boards: plan?.boards ?? [],
    targetBoardIndex: plan?.targetBoardIndex ?? 0,
    parameters: ctx.parameters,
    limit: 2000,
    enabled: Boolean(plan),
  });

  const { chartData, seriesKeys } = useMemo(() => {
    if (!data || !plan) return { chartData: [], seriesKeys: [] as string[] };
    if (plan.segmented) {
      const { data: wide, segmentKeys } = pivotSegmentedRows(data.rows, plan.xKey);
      const sorted = sortRows(wide, active.chartType, plan.xKey, segmentKeys[0]);
      return { chartData: sorted.slice(0, 50), seriesKeys: segmentKeys };
    }
    const rows = data.rows.map((r) => ({ ...r }));
    const sorted = sortRows(rows, active.chartType, plan.xKey, plan.seriesKeys[0]);
    return { chartData: sorted.slice(0, 50), seriesKeys: plan.seriesKeys };
  }, [data, plan, active.chartType]);

  const save = () => {
    dispatch(updateBoard({ pathId: ctx.path.id, board: draft }));
    setConfigOpen(false);
  };

  const xCol = inputSchema.columns.find((c) => c.name === draft.xAxis.column);
  const segmented = Boolean(active.series[0]?.segmentBy);

  return (
    <Stack direction="row" spacing={2}>
      {/* Chart alanı */}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {isFetching && <LinearProgress sx={{ mb: 1 }} />}
        {error && <Alert severity="error">{String(error)}</Alert>}
        {!plan && (
          <Alert severity="info">Sağdaki panelden X ekseni ve seri seç — chart otomatik dolacak.</Alert>
        )}
        {plan && data && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={340}>
            {renderChart(active, chartData, plan.xKey, seriesKeys, segmented, dilimAyrac)}
          </ResponsiveContainer>
        )}
        {plan && data && chartData.length === 0 && (
          <Alert severity="warning">Sonuç boş — üstteki filtreleri kontrol et.</Alert>
        )}
      </Box>

      {/* Config paneli */}
      {configOpen ? (
        <Paper variant="outlined" sx={{ width: 320, flexShrink: 0, p: 1.5 }}>
          <Tabs value={tab} onChange={(_, v: 'data' | 'format') => setTab(v)} sx={{ minHeight: 36, mb: 1.5 }}>
            <Tab label="Data" value="data" sx={{ minHeight: 36, textTransform: 'none' }} />
            <Tab label="Format" value="format" sx={{ minHeight: 36, textTransform: 'none' }} />
          </Tabs>

          {tab === 'data' && (
            <Stack spacing={1.5}>
              <Typography variant="overline" color="text.secondary">Chart type</Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={draft.chartType}
                onChange={(_, v: ChartType | null) => v && setDraft({ ...draft, chartType: v })}
              >
                {CHART_TYPES.map((t) => (
                  <ToggleButton key={t.value} value={t.value} sx={{ textTransform: 'none', px: 1 }}>
                    {t.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              <Typography variant="overline" color="text.secondary">X-Axis</Typography>
              <Select
                size="small"
                displayEmpty
                value={draft.xAxis.column}
                onChange={(e) =>
                  setDraft({ ...draft, xAxis: { column: e.target.value, bucketing: { kind: 'exact' } } })
                }
              >
                <MenuItem value="" disabled>Kolon seç</MenuItem>
                {inputSchema.columns.map((c) => (
                  <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
                ))}
              </Select>
              {xCol && isTemporal(xCol) && (
                <Select
                  size="small"
                  value={draft.xAxis.bucketing.kind === 'date' ? draft.xAxis.bucketing.unit : 'exact'}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      xAxis: {
                        ...draft.xAxis,
                        bucketing:
                          e.target.value === 'exact'
                            ? { kind: 'exact' }
                            : { kind: 'date', unit: e.target.value as 'year' | 'month' | 'day' | 'hour' },
                      },
                    })
                  }
                >
                  <MenuItem value="exact">Exact value</MenuItem>
                  <MenuItem value="year">Yıl</MenuItem>
                  <MenuItem value="month">Ay</MenuItem>
                  <MenuItem value="day">Gün</MenuItem>
                  <MenuItem value="hour">Saat</MenuItem>
                </Select>
              )}
              {xCol && isNumeric(xCol) && (
                <TextField
                  size="small"
                  type="number"
                  label="Bucket boyutu (boş = exact)"
                  value={draft.xAxis.bucketing.kind === 'numeric' ? draft.xAxis.bucketing.size : ''}
                  onChange={(e) => {
                    const size = Number(e.target.value);
                    setDraft({
                      ...draft,
                      xAxis: {
                        ...draft.xAxis,
                        bucketing: size > 0 ? { kind: 'numeric', size } : { kind: 'exact' },
                      },
                    });
                  }}
                />
              )}

              <Typography variant="overline" color="text.secondary">Y-Axis</Typography>
              {draft.series.map((s, i) => (
                <Paper key={s.id} variant="outlined" sx={{ p: 1 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: seriesColor(i), flexShrink: 0 }} />
                      <Typography variant="caption" sx={{ fontWeight: 600,  flexGrow: 1 }}>
                        Series {i + 1}
                      </Typography>
                      <IconButton
                        size="small"
                        disabled={draft.series.length === 1}
                        onClick={() => setDraft({ ...draft, series: draft.series.filter((_, j) => j !== i) })}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <Select
                        size="small"
                        fullWidth
                        value={s.aggregate.fn}
                        onChange={(e) => {
                          const fn = e.target.value as AggregationFn;
                          const valid = columnsForAggregation(fn, inputSchema.columns);
                          const column = fn === 'count' ? undefined : valid[0]?.name;
                          patchSeries(i, {
                            aggregate: { fn, column, alias: autoAlias(fn, column) },
                          });
                        }}
                      >
                        {allowedAggregations(inputSchema.columns, CHART_FNS).map((fn) => (
                          <MenuItem key={fn} value={fn}>{AGGREGATION_LABELS[fn]}</MenuItem>
                        ))}
                      </Select>
                      {s.aggregate.fn !== 'count' && (
                        <Select
                          size="small"
                          fullWidth
                          displayEmpty
                          value={s.aggregate.column ?? ''}
                          onChange={(e) =>
                            patchSeries(i, {
                              aggregate: {
                                ...s.aggregate,
                                column: e.target.value,
                                alias: autoAlias(s.aggregate.fn, e.target.value),
                              },
                            })
                          }
                        >
                          <MenuItem value="" disabled>Kolon</MenuItem>
                          {columnsForAggregation(s.aggregate.fn, inputSchema.columns).map((c) => (
                            <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
                          ))}
                        </Select>
                      )}
                    </Stack>
                    {i === 0 && draft.series.length === 1 && (
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography variant="caption" color="text.secondary">Segment by</Typography>
                        <Select
                          size="small"
                          fullWidth
                          displayEmpty
                          value={s.segmentBy ?? ''}
                          onChange={(e) =>
                            patchSeries(i, { segmentBy: e.target.value || undefined })
                          }
                        >
                          <MenuItem value="">(yok)</MenuItem>
                          {inputSchema.columns
                            .filter((c) => c.name !== draft.xAxis.column)
                            .map((c) => (
                              <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
                            ))}
                        </Select>
                        {s.segmentBy && (
                          <Button size="small" onClick={() => patchSeries(i, { segmentBy: undefined })}>
                            Clear
                          </Button>
                        )}
                      </Stack>
                    )}
                  </Stack>
                </Paper>
              ))}
              <Button
                size="small"
                startIcon={<AddIcon />}
                disabled={
                  draft.series.length >= 8 ||
                  draft.chartType === 'pie' ||
                  Boolean(draft.series[0]?.segmentBy)
                }
                onClick={() =>
                  setDraft({
                    ...draft,
                    series: [...draft.series, { id: nanoid(), aggregate: { alias: 'Satır sayısı', fn: 'count' } }],
                  })
                }
              >
                Add series
              </Button>
              {draft.series[0]?.segmentBy && (
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={draft.format?.segmentMode ?? 'stacked'}
                  onChange={(_, v: 'stacked' | 'grouped' | null) =>
                    v &&
                    setDraft({
                      ...draft,
                      format: { showLegend: true, legendPosition: 'right', ...draft.format, segmentMode: v },
                    })
                  }
                >
                  <ToggleButton value="stacked" sx={{ textTransform: 'none' }}>Stacked</ToggleButton>
                  <ToggleButton value="grouped" sx={{ textTransform: 'none' }}>Grouped</ToggleButton>
                </ToggleButtonGroup>
              )}
            </Stack>
          )}

          {tab === 'format' && (
            <Stack spacing={1.5}>
              <Typography variant="overline" color="text.secondary">Eksen başlıkları</Typography>
              <TextField
                size="small"
                label="X ekseni başlığı"
                value={draft.format?.xTitle ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    format: { showLegend: true, legendPosition: 'right', ...draft.format, xTitle: e.target.value },
                  })
                }
              />
              <TextField
                size="small"
                label="Y ekseni başlığı"
                value={draft.format?.yTitle ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    format: { showLegend: true, legendPosition: 'right', ...draft.format, yTitle: e.target.value },
                  })
                }
              />
              <Divider />
              <Typography variant="overline" color="text.secondary">Legend</Typography>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={draft.format?.showLegend ?? true}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        format: { legendPosition: 'right', ...draft.format, showLegend: e.target.checked },
                      })
                    }
                  />
                }
                label="Show legend"
              />
              <Select
                size="small"
                value={draft.format?.legendPosition ?? 'right'}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    format: {
                      showLegend: true,
                      ...draft.format,
                      legendPosition: e.target.value as 'right' | 'bottom' | 'left' | 'top',
                    },
                  })
                }
              >
                <MenuItem value="right">Right</MenuItem>
                <MenuItem value="bottom">Bottom</MenuItem>
                <MenuItem value="top">Top</MenuItem>
                <MenuItem value="left">Left</MenuItem>
              </Select>
            </Stack>
          )}

          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 2 }}>
            <Button size="small" onClick={() => { setDraft(board); setConfigOpen(false); }}>
              İptal
            </Button>
            <Button size="small" variant="contained" fullWidth onClick={save} disabled={!draft.xAxis.column}>
              Done
            </Button>
          </Stack>
        </Paper>
      ) : (
        <IconButton
          size="small"
          sx={{ alignSelf: 'flex-start' }}
          onClick={() => { setDraft(board); setConfigOpen(true); }}
        >
          <TuneIcon fontSize="small" />
        </IconButton>
      )}
    </Stack>
  );

  function patchSeries(i: number, patch: Partial<SeriesConfig>) {
    setDraft((d) => ({
      ...d,
      series: d.series.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    }));
  }
}

function sortRows(
  rows: Array<Record<string, unknown>>,
  chartType: ChartType,
  xKey: string,
  firstSeriesKey: string | undefined,
): Array<Record<string, unknown>> {
  if (chartType === 'line' || chartType === 'scatter') {
    return [...rows].sort((a, b) => String(a[xKey]).localeCompare(String(b[xKey]), 'tr', { numeric: true }));
  }
  if (!firstSeriesKey) return rows;
  return [...rows].sort((a, b) => Number(b[firstSeriesKey] ?? 0) - Number(a[firstSeriesKey] ?? 0));
}

function renderChart(
  config: ChartBoardConfig,
  data: Array<Record<string, unknown>>,
  xKey: string,
  seriesKeys: string[],
  segmented: boolean,
  dilimAyrac: string,
) {
  const fmt = (value: unknown) => fullNumber.format(Number(value));
  const showLegend = (config.format?.showLegend ?? true) && seriesKeys.length > 1;
  const legendProps = legendFor(config.format?.legendPosition ?? 'right');
  const horizontal = config.chartType === 'horizontalBar';
  const stackId =
    segmented && (config.format?.segmentMode ?? 'stacked') === 'stacked' ? 'seg' : undefined;

  if (config.chartType === 'pie') {
    const key = seriesKeys[0];
    return (
      <PieChart>
        <Tooltip formatter={fmt} />
        <Legend layout="vertical" align="right" verticalAlign="middle" />
        <Pie
          data={data.slice(0, 8)}
          dataKey={key}
          nameKey={xKey}
          outerRadius="85%"
          labelLine={false}
          label={(entry) => {
            const props = entry as unknown as { percent?: number };
            const pct = (props.percent ?? 0) * 100;
            return pct >= 5 ? `%${pct.toFixed(0)}` : '';
          }}
          isAnimationActive={false}
        >
          {data.slice(0, 8).map((_, i) => (
            <Cell key={i} fill={seriesColor(i)} stroke={dilimAyrac} strokeWidth={2} />
          ))}
        </Pie>
      </PieChart>
    );
  }

  if (config.chartType === 'line') {
    return (
      <LineChart data={data} margin={{ top: 8, right: 16 }}>
        <CartesianGrid stroke={CHART_INK.gridline} vertical={false} />
        <XAxis dataKey={xKey} {...axisProps()} label={xLabel(config)} />
        <YAxis {...axisProps()} tickFormatter={(v: number) => compactNumber.format(v)} label={yLabel(config)} />
        <Tooltip formatter={fmt} />
        {showLegend && <Legend {...legendProps} />}
        {seriesKeys.map((k, i) => (
          <Line key={k} dataKey={k} stroke={seriesColor(i)} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        ))}
      </LineChart>
    );
  }

  if (config.chartType === 'scatter') {
    return (
      <ScatterChart margin={{ top: 8, right: 16 }}>
        <CartesianGrid stroke={CHART_INK.gridline} />
        <XAxis dataKey={xKey} {...axisProps()} allowDuplicatedCategory={false} label={xLabel(config)} />
        <YAxis {...axisProps()} tickFormatter={(v: number) => compactNumber.format(v)} label={yLabel(config)} />
        <Tooltip formatter={fmt} />
        {showLegend && <Legend {...legendProps} />}
        {seriesKeys.map((k, i) => (
          <Scatter key={k} name={k} data={data} dataKey={k} fill={seriesColor(i)} isAnimationActive={false} />
        ))}
      </ScatterChart>
    );
  }

  // bar / horizontalBar
  return (
    <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 20, right: horizontal ? 60 : 16 }}>
      <CartesianGrid stroke={CHART_INK.gridline} vertical={horizontal} horizontal={!horizontal} />
      {horizontal ? (
        <>
          <XAxis type="number" {...axisProps()} tickFormatter={(v: number) => compactNumber.format(v)} label={yLabel(config)} />
          <YAxis type="category" dataKey={xKey} width={140} {...axisProps()} />
        </>
      ) : (
        <>
          <XAxis dataKey={xKey} {...axisProps()} label={xLabel(config)} />
          <YAxis {...axisProps()} tickFormatter={(v: number) => compactNumber.format(v)} label={yLabel(config)} />
        </>
      )}
      <Tooltip formatter={fmt} />
      {showLegend && <Legend {...legendProps} />}
      {seriesKeys.map((k, i) => (
        <Bar
          key={k}
          dataKey={k}
          stackId={stackId}
          fill={seriesColor(i)}
          radius={
            stackId && i < seriesKeys.length - 1
              ? undefined
              : horizontal
                ? [0, 4, 4, 0]
                : [4, 4, 0, 0]
          }
          isAnimationActive={false}
        >
          {seriesKeys.length === 1 && data.length <= 20 && (
            <LabelList
              dataKey={k}
              position={horizontal ? 'right' : 'top'}
              formatter={(v: unknown) => compactNumber.format(Number(v))}
              style={{ fill: '#52514e', fontSize: 11 }}
            />
          )}
        </Bar>
      ))}
    </BarChart>
  );
}

function axisProps() {
  return {
    stroke: CHART_INK.baseline,
    tick: { fill: CHART_INK.muted, fontSize: 12 },
  };
}

function legendFor(position: 'right' | 'bottom' | 'left' | 'top') {
  switch (position) {
    case 'right':
      return { layout: 'vertical', align: 'right', verticalAlign: 'middle' } as const;
    case 'left':
      return { layout: 'vertical', align: 'left', verticalAlign: 'middle' } as const;
    case 'top':
      return { layout: 'horizontal', align: 'center', verticalAlign: 'top' } as const;
    case 'bottom':
      return { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' } as const;
  }
}

function xLabel(config: ChartBoardConfig) {
  return config.format?.xTitle
    ? { value: config.format.xTitle, position: 'insideBottom' as const, offset: -4, fill: '#52514e', fontSize: 12 }
    : undefined;
}

function yLabel(config: ChartBoardConfig) {
  return config.format?.yTitle
    ? { value: config.format.yTitle, angle: -90, position: 'insideLeft' as const, fill: '#52514e', fontSize: 12 }
    : undefined;
}
