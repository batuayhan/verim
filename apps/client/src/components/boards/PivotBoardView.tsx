import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useMemo, useState } from 'react';
import { useBoardResult } from '../../api/hooks';
import { buildChain } from '../../core/boardDefaults';
import { updateBoard } from '../../store/analysisSlice';
import { useAppDispatch } from '../../store/hooks';
import type { AggregateSpec, AggregationFn, PivotBoardConfig } from '../../types/boards';
import {
  AGGREGATION_LABELS,
  allowedAggregations,
  columnsForAggregation,
} from '../../core/aggregations';
import type { BoardViewProps } from '../BoardCard';

const PIVOT_FNS: AggregationFn[] = ['count', 'countDistinct', 'sum', 'avg', 'min', 'max'];

export function PivotBoardView({
  ctx,
  board,
  index,
  inputSchema,
}: BoardViewProps & { board: PivotBoardConfig }) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<PivotBoardConfig>(board);
  const columnNames = inputSchema.columns.map((c) => c.name);

  const chain = buildChain(ctx.path.boards, index);
  const { data, isFetching, error } = useBoardResult({
    datasetId: ctx.datasetId,
    datasetVersion: ctx.datasetVersion,
    boards: chain?.boards ?? [],
    targetBoardIndex: chain?.targetBoardIndex ?? 0,
    parameters: ctx.parameters,
    limit: 200,
    enabled: Boolean(chain),
  });

  const gridColumns = useMemo<GridColDef[]>(
    () =>
      (data?.schema.columns ?? []).map((c) => ({
        field: c.name,
        headerName: c.name,
        minWidth: 130,
        flex: 1,
        type: c.type === 'integer' || c.type === 'double' ? ('number' as const) : undefined,
      })),
    [data?.schema],
  );
  const gridRows = useMemo(
    () => (data?.rows ?? []).map((r, i) => ({ __id: i, ...r })),
    [data?.rows],
  );

  const compute = () =>
    dispatch(updateBoard({ pathId: ctx.path.id, board: { ...draft, pivoted: board.pivoted } }));

  return (
    <Stack direction="row" spacing={2}>
      {/* Sol: sonuç grid'i */}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {isFetching && <LinearProgress sx={{ mb: 1 }} />}
        {error && <Alert severity="error">{String(error)}</Alert>}
        {!chain && (
          <Alert severity="info">
            Sağdan ROWS ve AGGREGATES seçip <b>Compute</b>'a bas.
          </Alert>
        )}
        {data && (
          <>
            <Typography variant="caption" color="text.secondary">
              {data.totalRows.toLocaleString('tr-TR')} satır
              {data.truncated && ' (kesildi)'} · {data.schema.columns.length} kolon
            </Typography>
            <DataGrid
              density="compact"
              columns={gridColumns}
              rows={gridRows}
              getRowId={(r) => r.__id as number}
              disableColumnMenu
              hideFooterSelectedRowCount
              pageSizeOptions={[25]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              sx={{ minHeight: 200, maxHeight: 420, bgcolor: 'background.paper', mt: 0.5 }}
            />
          </>
        )}
      </Box>

      {/* Sağ: config paneli */}
      <Stack sx={{ width: 280, flexShrink: 0 }} spacing={1.5}>
        <Typography variant="overline" color="text.secondary">Rows</Typography>
        <Autocomplete
          multiple
          size="small"
          options={columnNames}
          value={draft.rows}
          onChange={(_, v) => setDraft({ ...draft, rows: v })}
          renderInput={(params) => <TextField {...params} placeholder="Satır boyutu ekle…" />}
          renderValue={(value, getItemProps) =>
            value.map((option, i) => (
              <Chip {...getItemProps({ index: i })} key={option} size="small" label={option} />
            ))
          }
        />

        <Typography variant="overline" color="text.secondary">Columns</Typography>
        <Autocomplete
          multiple
          size="small"
          options={columnNames}
          value={draft.columns}
          onChange={(_, v) => setDraft({ ...draft, columns: v })}
          renderInput={(params) => <TextField {...params} placeholder="Sütun boyutu ekle…" />}
          renderValue={(value, getItemProps) =>
            value.map((option, i) => (
              <Chip {...getItemProps({ index: i })} key={option} size="small" label={option} />
            ))
          }
        />

        <Typography variant="overline" color="text.secondary">Aggregates</Typography>
        {draft.aggregates.map((a, i) => (
          <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Select
              size="small"
              value={a.fn}
              sx={{ minWidth: 100 }}
              onChange={(e) => {
                const fn = e.target.value as AggregationFn;
                const valid = columnsForAggregation(fn, inputSchema.columns);
                const column = fn === 'count' ? undefined : valid[0]?.name;
                const next: AggregateSpec = {
                  fn,
                  column,
                  alias: fn === 'count' ? 'count' : `${fn}_${column ?? ''}`,
                };
                setDraft({ ...draft, aggregates: draft.aggregates.map((x, j) => (j === i ? next : x)) });
              }}
            >
              {allowedAggregations(inputSchema.columns, PIVOT_FNS).map((fn) => (
                <MenuItem key={fn} value={fn}>{AGGREGATION_LABELS[fn]}</MenuItem>
              ))}
            </Select>
            {a.fn !== 'count' && (
              <Select
                size="small"
                displayEmpty
                value={a.column ?? ''}
                sx={{ minWidth: 100 }}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    aggregates: draft.aggregates.map((x, j) =>
                      j === i ? { ...x, column: e.target.value, alias: `${x.fn}_${e.target.value}` } : x,
                    ),
                  })
                }
              >
                <MenuItem value="" disabled>Kolon</MenuItem>
                {columnsForAggregation(a.fn, inputSchema.columns).map((c) => (
                  <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
                ))}
              </Select>
            )}
            <IconButton
              size="small"
              onClick={() => setDraft({ ...draft, aggregates: draft.aggregates.filter((_, j) => j !== i) })}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() =>
            setDraft({ ...draft, aggregates: [...draft.aggregates, { alias: 'count', fn: 'count' }] })
          }
        >
          Aggregate ekle
        </Button>

        <Divider />
        <Button
          variant="contained"
          fullWidth
          disabled={draft.rows.length === 0 || draft.aggregates.length === 0}
          onClick={compute}
        >
          Compute
        </Button>
        <Button
          size="small"
          variant={board.pivoted ? 'contained' : 'outlined'}
          onClick={() =>
            dispatch(updateBoard({ pathId: ctx.path.id, board: { ...board, pivoted: !board.pivoted } }))
          }
          sx={{ textTransform: 'none' }}
        >
          {board.pivoted ? 'Pivoted data aktif' : 'Switch to pivoted data'}
        </Button>
      </Stack>
    </Stack>
  );
}
