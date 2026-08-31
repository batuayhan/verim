import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import StorageIcon from '@mui/icons-material/Storage';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { materializePath } from '../api/client';
import { useDatasetSchema } from '../api/hooks';
import { isBoardConfigured } from '../core/boardDefaults';
import { propagatePath } from '../core/schemaPropagation';
import type { AnalysisPath } from '../types/analysis';
import { selectAnalysis, useAppSelector } from '../store/hooks';
import { InsertBoardButton } from './AddBoardButton';
import { AddBoardToolbar } from './AddBoardToolbar';
import { BoardCard } from './BoardCard';

export interface PathContext {
  path: AnalysisPath;
  datasetId: string;
  datasetVersion: string;
  parameters: Record<string, string | number | boolean | null>;
}

export function PathEditor({ path }: { path: AnalysisPath }) {
  const analysis = useAppSelector(selectAnalysis);
  const datasetId =
    path.source.kind === 'dataset' ? path.source.datasetId : undefined;
  const { data: schemaData, isLoading, error } = useDatasetSchema(datasetId);

  const parameters = useMemo(
    () =>
      Object.fromEntries(
        (analysis?.parameters ?? []).map((p) => [p.name, p.value]),
      ),
    [analysis?.parameters],
  );

  const schemas = useMemo(
    () =>
      schemaData ? propagatePath(schemaData.schema, path.boards) : undefined,
    [schemaData, path.boards],
  );

  if (isLoading) {
    return (
      <Stack sx={{ alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </Stack>
    );
  }
  if (error || !schemaData || !datasetId) {
    return <Alert severity="error">Dataset şeması alınamadı: {String(error)}</Alert>;
  }

  const ctx: PathContext = {
    path,
    datasetId,
    datasetVersion: schemaData.version,
    parameters,
  };

  const finalSchema = schemas![schemas!.length - 1];

  return (
    <Stack spacing={0} sx={{ alignItems: 'stretch' }}>
      {/* Dataset header card */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <StorageIcon color="primary" />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {path.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {schemaData.rowCount.toLocaleString('tr-TR')} satır ·{' '}
              {schemaData.schema.columns.length} kolon
            </Typography>
          </Box>
          <Chip label={datasetId} size="small" variant="outlined" />
        </Stack>
      </Paper>

      {/* Boards */}
      {path.boards.map((board, index) => (
        <Box key={board.id}>
          <Connector>
            <InsertBoardButton pathId={path.id} insertIndex={index} />
          </Connector>
          <BoardCard
            ctx={ctx}
            board={board}
            index={index}
            inputSchema={schemas![index]}
          />
        </Box>
      ))}

      {/* Board ekleme toolbar'ı — Harman'daki gibi path'in sonunda */}
      <Connector />
      <AddBoardToolbar pathId={path.id} />

      {/* Result card */}
      <Connector />
      <ResultCard ctx={ctx} columnCount={finalSchema.columns.length} />
    </Stack>
  );
}

function ResultCard({
  ctx,
  columnCount,
}: {
  ctx: PathContext;
  columnCount: number;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const materialize = async () => {
    setBusy(true);
    try {
      const res = await materializePath({
        label,
        datasetId: ctx.datasetId,
        boards: ctx.path.boards.filter(isBoardConfigured),
        parameters: ctx.parameters,
      });
      await queryClient.invalidateQueries({ queryKey: ['datasets'] });
      setMessage(
        `"${res.dataset.label}" oluşturuldu — ${res.dataset.rowCount.toLocaleString('tr-TR')} satır. Yeni path başlatırken seçebilirsin.`,
      );
      setOpen(false);
    } catch (e) {
      setMessage(`Materialize başarısız: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover', borderStyle: 'dashed' }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          Sonuç — {columnCount} kolon
        </Typography>
        <Button size="small" variant="outlined" onClick={() => setOpen(true)}>
          Save as dataset
        </Button>
      </Stack>
      {message && (
        <Alert severity="info" sx={{ mt: 1 }} onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Save as dataset</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Path'in güncel sonucu yeni bir dataset olarak kaydedilir ve dataset
            listesinde görünür.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Dataset adı"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>İptal</Button>
          <Button
            variant="contained"
            disabled={!label.trim() || busy}
            onClick={() => void materialize()}
          >
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

function Connector({ children }: { children?: React.ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', justifyContent: 'center', py: 0.5 }}
    >
      <ArrowDownwardIcon sx={{ color: 'text.disabled' }} fontSize="small" />
      {children}
    </Stack>
  );
}
