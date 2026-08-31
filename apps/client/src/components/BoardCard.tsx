import CloseIcon from '@mui/icons-material/Close';
import PresentToAllIcon from '@mui/icons-material/PresentToAll';
import {
  Alert,
  Box,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { Component, useState, type ReactNode } from 'react';
import { saveAnalysis } from '../api/client';
import { useBoardResult } from '../api/hooks';
import { buildChain, isBoardConfigured } from '../core/boardDefaults';
import { removeBoard } from '../store/analysisSlice';
import { selectAnalysis, useAppDispatch, useAppSelector } from '../store/hooks';
import { PanoyaEkleDialog } from '../pano/PanoyaEkleDialog';
import type { GadgetConfig } from '../pano/api';
import type { BoardConfig } from '../types/boards';
import type { TableSchema } from '../types/schema';
import { BOARD_OPTIONS } from './AddBoardToolbar';
import { ChartBoardView } from './boards/ChartBoardView';
import { EditColumnsBoardView } from './boards/EditColumnsBoardView';
import { EnrichBoardView } from './boards/EnrichBoardView';
import { ExpressionBoardView } from './boards/ExpressionBoardView';
import { FilterBoardView } from './boards/FilterBoardView';
import { HistogramBoardView } from './boards/HistogramBoardView';
import { PivotBoardView } from './boards/PivotBoardView';
import { SetMathBoardView } from './boards/SetMathBoardView';
import { TableBoardView } from './boards/TableBoardView';
import type { PathContext } from './PathEditor';

export const BOARD_TITLES: Record<BoardConfig['type'], string> = {
  filter: 'FILTER',
  table: 'TABLE',
  chart: 'CHART',
  histogram: 'HISTOGRAM',
  expression: 'EXPRESSION',
  pivot: 'PIVOT TABLE',
  enrich: 'ENRICH',
  setMath: 'SET MATH',
  editColumns: 'EDIT COLUMNS',
};

/** Satır sayısını sadece veri şeklini değiştiren board'lar için göster. */
const TRANSFORM_TYPES: Array<BoardConfig['type']> = [
  'filter',
  'expression',
  'enrich',
  'setMath',
  'editColumns',
];

/** Dashboard'a eklenebilen (görsel çıktı üreten) board'lar. */
const DASHBOARDABLE: Array<BoardConfig['type']> = [
  'table',
  'chart',
  'histogram',
  'pivot',
];

export interface BoardViewProps {
  ctx: PathContext;
  board: BoardConfig;
  index: number;
  inputSchema: TableSchema;
  /**
   * Dashboard çapraz filtreleme: verildiğinde histogram bar tıklaması
   * board selection'ı DEĞİŞTİRMEZ (analize yazmaz), bu callback'i çağırır.
   */
  onCrossFilter?: (column: string, value: string) => void;
}

/**
 * Bir board'daki render hatası tüm uygulamayı değil sadece o kartı
 * düşürsün — kart içinde hata mesajı gösterilir, board config
 * değişince otomatik yeniden dener.
 */
class BoardErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <Alert severity="error">
          Board görüntülenirken hata oluştu: {this.state.error.message}
        </Alert>
      );
    }
    return this.props.children;
  }
}

/** Board tipine göre içerik — hem path editörü hem dashboard widget'ları kullanır. */
export function BoardBody(props: BoardViewProps) {
  const { board } = props;
  return (
    <BoardErrorBoundary resetKey={JSON.stringify(board)}>
      {board.type === 'filter' && <FilterBoardView {...props} board={board} />}
      {board.type === 'table' && <TableBoardView {...props} board={board} />}
      {board.type === 'chart' && <ChartBoardView {...props} board={board} />}
      {board.type === 'histogram' && <HistogramBoardView {...props} board={board} />}
      {board.type === 'expression' && <ExpressionBoardView {...props} board={board} />}
      {board.type === 'pivot' && <PivotBoardView {...props} board={board} />}
      {board.type === 'enrich' && <EnrichBoardView {...props} board={board} />}
      {board.type === 'setMath' && <SetMathBoardView {...props} board={board} />}
      {board.type === 'editColumns' && <EditColumnsBoardView {...props} board={board} />}
    </BoardErrorBoundary>
  );
}

export function BoardCard(props: BoardViewProps) {
  const { ctx, board, index } = props;
  const dispatch = useAppDispatch();
  const analysis = useAppSelector(selectAnalysis);
  const [panoGadget, setPanoGadget] = useState<GadgetConfig | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const icon = BOARD_OPTIONS.find((o) => o.type === board.type)?.icon;

  const isTransform = TRANSFORM_TYPES.includes(board.type);
  const chain = isTransform ? buildChain(ctx.path.boards, index) : null;
  const summary = useBoardResult({
    datasetId: ctx.datasetId,
    datasetVersion: ctx.datasetVersion,
    boards: chain?.boards ?? [],
    targetBoardIndex: chain?.targetBoardIndex ?? 0,
    parameters: ctx.parameters,
    limit: 1,
    enabled: Boolean(chain),
  });

  const canDashboard = DASHBOARDABLE.includes(board.type) && isBoardConfigured(board);

  // Board'u panoya eklemeden önce analizi KAYDET — pano gadget'ı
  // analysisId + pathId + boardId ile canlı projeksiyon yapar
  const addToPano = async () => {
    if (!analysis) return;
    try {
      await saveAnalysis(analysis);
    } catch (e) {
      setSaveErr(String(e));
      return;
    }
    setPanoGadget({
      tip: 'harman_board',
      analysisId: analysis.id,
      pathId: ctx.path.id,
      boardId: board.id,
      baslik: `${BOARD_TITLES[board.type]} · ${ctx.path.name}`,
    });
  };

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', px: 2, py: 0.75, borderBottom: 1, borderColor: 'divider' }}
      >
        <Box sx={{ color: 'text.secondary', display: 'inline-flex' }}>{icon}</Box>
        <Typography
          variant="overline"
          sx={{ letterSpacing: 1, color: 'text.secondary', flexGrow: 1, lineHeight: 2 }}
        >
          {BOARD_TITLES[board.type]}
        </Typography>
        <Tooltip title={canDashboard ? 'Panoya ekle' : 'Önce board\'u yapılandır'}>
          <span>
            <IconButton size="small" disabled={!canDashboard} onClick={() => void addToPano()}>
              <PresentToAllIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Board'u kaldır">
          <IconButton
            size="small"
            onClick={() => dispatch(removeBoard({ pathId: ctx.path.id, boardId: board.id }))}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <PanoyaEkleDialog
          open={panoGadget !== null}
          gadget={panoGadget}
          onClose={() => setPanoGadget(null)}
        />
        <Snackbar
          open={Boolean(saveErr)}
          autoHideDuration={4000}
          onClose={() => setSaveErr(null)}
          message={saveErr ? `Panoya eklenemedi: ${saveErr}` : ''}
        />
      </Stack>

      <Box sx={{ p: 2 }}>
        <BoardBody {...props} />
      </Box>

      {isTransform && isBoardConfigured(board) && (
        <Box sx={{ px: 2, py: 0.5, borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">
            {summary.error
              ? `Hata: ${String(summary.error)}`
              : summary.data
                ? `→ ${summary.data.totalRows.toLocaleString('tr-TR')} satır · ${summary.data.schema.columns.length} kolon · ${summary.data.executionTimeMs}ms`
                : 'Hesaplanıyor…'}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
