import { Alert, Box, LinearProgress, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useMemo } from 'react';
import { useBoardResult } from '../../api/hooks';
import { buildChain } from '../../core/boardDefaults';
import type { TableBoardConfig } from '../../types/boards';
import type { BoardViewProps } from '../BoardCard';

const PREVIEW_LIMIT = 100;

export function TableBoardView({
  ctx,
  index,
}: BoardViewProps & { board: TableBoardConfig }) {
  const chain = buildChain(ctx.path.boards, index);
  const { data, isFetching, error } = useBoardResult({
    datasetId: ctx.datasetId,
    datasetVersion: ctx.datasetVersion,
    boards: chain?.boards ?? [],
    targetBoardIndex: chain?.targetBoardIndex ?? 0,
    parameters: ctx.parameters,
    limit: PREVIEW_LIMIT,
    enabled: Boolean(chain),
  });

  const columns = useMemo<GridColDef[]>(
    () =>
      (data?.schema.columns ?? []).map((c) => ({
        field: c.name,
        headerName: c.name,
        flex: 1,
        minWidth: 120,
        type: c.type === 'integer' || c.type === 'double' ? 'number' : undefined,
      })),
    [data?.schema],
  );

  const rows = useMemo(
    () => (data?.rows ?? []).map((r, i) => ({ __id: i, ...r })),
    [data?.rows],
  );

  if (error) {
    return <Alert severity="error">{String(error)}</Alert>;
  }

  return (
    <Box>
      {isFetching && <LinearProgress sx={{ mb: 1 }} />}
      {data && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {Math.min(PREVIEW_LIMIT, data.rows.length).toLocaleString('tr-TR')} satır
          önizleniyor · toplam {data.totalRows.toLocaleString('tr-TR')} satır ·{' '}
          {data.schema.columns.length} kolon · {data.executionTimeMs}ms
        </Typography>
      )}
      <DataGrid
        density="compact"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.__id as number}
        disableColumnMenu
        hideFooterSelectedRowCount
        pageSizeOptions={[25]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        sx={{ minHeight: 200, maxHeight: 420, bgcolor: 'background.paper' }}
      />
    </Box>
  );
}
