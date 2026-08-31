import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useBoardResult } from '../../api/hooks';
import { buildChain } from '../../core/boardDefaults';
import { CATEGORICAL, CHART_INK, compactNumber, fullNumber } from '../../core/vizPalette';
import { updateBoard } from '../../store/analysisSlice';
import { useAppDispatch } from '../../store/hooks';
import type { AggregationFn, HistogramBoardConfig } from '../../types/boards';
import {
  AGGREGATION_LABELS,
  allowedAggregations,
  columnsForAggregation,
} from '../../core/aggregations';
import type { BoardViewProps } from '../BoardCard';

const HISTOGRAM_FNS: AggregationFn[] = ['count', 'countDistinct', 'sum', 'avg', 'min', 'max', 'median'];

const BAR_HEIGHT = 34;

export function HistogramBoardView({
  ctx,
  board,
  index,
  inputSchema,
  onCrossFilter,
}: BoardViewProps & { board: HistogramBoardConfig }) {
  const dispatch = useAppDispatch();

  // Histogram hedef olarak kendi aggregate çıktısını ister
  const chain = buildChain(ctx.path.boards, index);
  const { data, isFetching, error } = useBoardResult({
    datasetId: ctx.datasetId,
    datasetVersion: ctx.datasetVersion,
    boards: chain?.boards ?? [],
    targetBoardIndex: chain?.targetBoardIndex ?? 0,
    parameters: ctx.parameters,
    limit: 1000,
    enabled: Boolean(chain),
  });

  const patch = (p: Partial<HistogramBoardConfig>) =>
    dispatch(updateBoard({ pathId: ctx.path.id, board: { ...board, ...p } }));

  const rows = useMemo(
    () => (data?.rows ?? []).slice(0, 30) as Array<Record<string, unknown>>,
    [data?.rows],
  );

  const selection = new Set(board.selection ?? []);

  const toggleBar = (label: string) => {
    if (onCrossFilter) {
      onCrossFilter(board.groupColumn, label);
      return;
    }
    const next = new Set(selection);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    patch({ selection: next.size > 0 ? [...next] : undefined });
  };

  const allowedFns = allowedAggregations(inputSchema.columns, HISTOGRAM_FNS);

  return (
    <Stack spacing={1.5}>
      {/* Başlık cümlesi + kontroller */}
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Select
          size="small"
          variant="standard"
          value={board.aggregate.fn}
          onChange={(e) => {
            const fn = e.target.value as AggregationFn;
            const valid = columnsForAggregation(fn, inputSchema.columns);
            patch({
              aggregate: {
                fn,
                column: fn === 'count' ? undefined : valid[0]?.name,
                alias: 'value',
              },
            });
          }}
          sx={{ '& .MuiSelect-select': { color: 'primary.main', fontWeight: 600 } }}
        >
          {allowedFns.map((fn) => (
            <MenuItem key={fn} value={fn}>{AGGREGATION_LABELS[fn]}</MenuItem>
          ))}
        </Select>
        {board.aggregate.fn !== 'count' && (
          <>
            <Typography variant="body2">of</Typography>
            <Select
              size="small"
              variant="standard"
              displayEmpty
              value={board.aggregate.column ?? ''}
              onChange={(e) =>
                patch({ aggregate: { ...board.aggregate, column: e.target.value, alias: 'value' } })
              }
              sx={{ '& .MuiSelect-select': { color: 'primary.main', fontWeight: 600 } }}
            >
              <MenuItem value="" disabled>kolon</MenuItem>
              {columnsForAggregation(board.aggregate.fn, inputSchema.columns).map((c) => (
                <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
              ))}
            </Select>
          </>
        )}
        <Typography variant="body2">by</Typography>
        <Select
          size="small"
          variant="standard"
          displayEmpty
          value={board.groupColumn}
          onChange={(e) => patch({ groupColumn: e.target.value, selection: undefined })}
          sx={{ '& .MuiSelect-select': { color: 'primary.main', fontWeight: 600 } }}
        >
          <MenuItem value="" disabled>kolon seç</MenuItem>
          {inputSchema.columns.map((c) => (
            <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
          ))}
        </Select>

        <Box sx={{ flexGrow: 1 }} />

        <Typography variant="caption" color="text.secondary">Order by:</Typography>
        <Select
          size="small"
          variant="standard"
          value={board.sort.by}
          onChange={(e) => patch({ sort: { ...board.sort, by: e.target.value } })}
        >
          <MenuItem value="value">aggregate (x-axis)</MenuItem>
          <MenuItem value="label">label</MenuItem>
        </Select>
        <Typography variant="caption" color="text.secondary">Sort:</Typography>
        <Select
          size="small"
          variant="standard"
          value={board.sort.direction}
          onChange={(e) => patch({ sort: { ...board.sort, direction: e.target.value } })}
        >
          <MenuItem value="desc">descending</MenuItem>
          <MenuItem value="asc">ascending</MenuItem>
        </Select>
        <Button
          size="small"
          startIcon={<SwapHorizIcon />}
          variant={board.pivoted ? 'contained' : 'text'}
          onClick={() => patch({ pivoted: !board.pivoted })}
          sx={{ textTransform: 'none' }}
        >
          {board.pivoted ? 'Pivoted data aktif' : 'Switch to pivoted data'}
        </Button>
      </Stack>

      {selection.size > 0 && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary">
            Seçim (downstream board'ları filtreler):
          </Typography>
          {[...selection].map((s) => (
            <Chip key={s} size="small" label={s} onDelete={() => toggleBar(s)} />
          ))}
          <Button size="small" onClick={() => patch({ selection: undefined })}>
            Temizle
          </Button>
        </Stack>
      )}

      {isFetching && <LinearProgress />}
      {error && <Alert severity="error">{String(error)}</Alert>}
      {!chain && (
        <Alert severity="info">Gruplanacak kolonu seç — histogram otomatik dolacak.</Alert>
      )}

      {data && rows.length > 0 && (
        <ResponsiveContainer width="100%" height={Math.max(rows.length * BAR_HEIGHT + 60, 140)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 60, left: 8 }}>
            <CartesianGrid stroke={CHART_INK.gridline} horizontal={false} />
            <XAxis
              type="number"
              stroke={CHART_INK.baseline}
              tick={{ fill: CHART_INK.muted, fontSize: 12 }}
              tickFormatter={(v: number) => compactNumber.format(v)}
            />
            <YAxis
              type="category"
              dataKey={board.groupColumn}
              width={160}
              stroke={CHART_INK.baseline}
              tick={{ fill: CHART_INK.muted, fontSize: 12 }}
            />
            <RechartsTooltip formatter={(v: unknown) => fullNumber.format(Number(v))} />
            <Bar
              dataKey={board.aggregate.alias}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              onClick={(entry) => {
                const payload = (entry as { payload?: Record<string, unknown> }).payload;
                if (payload) toggleBar(String(payload[board.groupColumn]));
              }}
              cursor="pointer"
            >
              <LabelList
                dataKey={board.aggregate.alias}
                position="right"
                formatter={(v: unknown) => compactNumber.format(Number(v))}
                style={{ fill: '#52514e', fontSize: 11 }}
              />
              {rows.map((r, i) => {
                const label = String(r[board.groupColumn]);
                const dimmed = selection.size > 0 && !selection.has(label);
                return (
                  <Cell
                    key={i}
                    fill={CATEGORICAL[0]}
                    opacity={dimmed ? 0.3 : 1}
                    stroke={selection.has(label) ? '#0b0b0b' : undefined}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {data && (
        <Typography variant="caption" color="text.secondary">
          {rows.length} / {data.totalRows.toLocaleString('tr-TR')} grup gösteriliyor
          {board.pivoted && ' · sonraki board\'lar aggregate edilmiş veriyi görür'}
        </Typography>
      )}
    </Stack>
  );
}
