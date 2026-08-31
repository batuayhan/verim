import AddIcon from '@mui/icons-material/Add';
import FunctionsIcon from '@mui/icons-material/Functions';
import RedoIcon from '@mui/icons-material/Redo';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ActionCreators } from 'redux-undo';
import { fetchAnalysis, saveAnalysis } from '../api/client';
import { useDatasets } from '../api/hooks';
import { ParametersPanel } from '../components/ParametersPanel';
import { PathEditor } from '../components/PathEditor';
import { TopNav } from '../components/TopNav';
import { addPath, renameAnalysis, setAnalysis } from '../store/analysisSlice';
import { selectAnalysis, useAppDispatch, useAppSelector } from '../store/hooks';

const RAIL_WIDTH = 48;
const PARAMS_WIDTH = 320;

export function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const analysis = useAppSelector(selectAnalysis);
  const canUndo = useAppSelector((s) => s.analysis.past.length > 0);
  const canRedo = useAppSelector((s) => s.analysis.future.length > 0);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [newPathAnchor, setNewPathAnchor] = useState<HTMLElement | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const { data: datasetsData } = useDatasets();

  // URL'deki analiz store'da değilse server'dan yükle (paylaşılan link akışı)
  const storeMatchesUrl = analysis?.id === id;
  useEffect(() => {
    if (!id || storeMatchesUrl) return;
    setLoadError(false);
    fetchAnalysis(id)
      .then((doc) => dispatch(setAnalysis(doc)))
      .catch(() => setLoadError(true));
  }, [id, storeMatchesUrl, dispatch]);

  const paths = analysis?.paths ?? [];
  const activePath =
    paths.find((p) => p.id === activePathId) ?? paths[0] ?? null;

  const handleSave = async () => {
    if (!analysis) return;
    try {
      const res = await saveAnalysis(analysis);
      await queryClient.invalidateQueries({ queryKey: ['analyses'] });
      setSnack(`Kaydedildi — ${new Date(res.updatedAt).toLocaleTimeString('tr-TR')}`);
    } catch (e) {
      setSnack(`Kaydedilemedi: ${String(e)}`);
    }
  };

  if (loadError) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <TopNav />
        <Box sx={{ maxWidth: 600, mx: 'auto', p: 4 }}>
          <Alert
            severity="warning"
            action={
              <Button component={Link} to="/" size="small">
                Ana sayfa
              </Button>
            }
          >
            Analiz bulunamadı — silinmiş ya da hiç kaydedilmemiş olabilir.
          </Alert>
        </Box>
      </Box>
    );
  }

  if (!storeMatchesUrl) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <TopNav />
        <Stack sx={{ alignItems: 'center', py: 10 }}>
          <CircularProgress />
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
      <TopNav>
        {editingName ? (
          <TextField
            size="small"
            autoFocus
            defaultValue={analysis?.name}
            onBlur={(e) => {
              if (e.target.value.trim()) dispatch(renameAnalysis(e.target.value.trim()));
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <Tooltip title="Yeniden adlandır">
            <Typography
              variant="subtitle2"
              onClick={() => setEditingName(true)}
              sx={{ cursor: 'text', '&:hover': { textDecoration: 'underline' } }}
            >
              {analysis?.name}
            </Typography>
          </Tooltip>
        )}
        <Button size="small" startIcon={<SaveIcon />} onClick={() => void handleSave()}>
          Kaydet
        </Button>
      </TopNav>

      <Box sx={{ display: 'flex', flexGrow: 1, minHeight: 0 }}>
        {/* Sol ikon rayı */}
        <Paper
          square
          elevation={0}
          sx={{
            width: RAIL_WIDTH,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            pt: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <Tooltip title="Parametreler" placement="right">
            <IconButton
              size="small"
              color={paramsOpen ? 'primary' : 'default'}
              onClick={() => setParamsOpen((v) => !v)}
            >
              <FunctionsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Paper>

        {/* Parametre paneli */}
        {paramsOpen && (
          <Paper
            square
            elevation={0}
            sx={{ width: PARAMS_WIDTH, flexShrink: 0, borderRight: 1, borderColor: 'divider' }}
          >
            <ParametersPanel />
          </Paper>
        )}

        {/* Ana alan */}
        <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {paths.length > 0 && (
            <Paper
              square
              elevation={0}
              sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', pr: 1 }}
            >
              <TableChartOutlinedIcon fontSize="small" sx={{ mx: 1, color: 'text.secondary' }} />
              <Tabs
                value={activePath?.id ?? false}
                onChange={(_, v: string) => setActivePathId(v)}
                variant="scrollable"
                sx={{ minHeight: 40, flexGrow: 1 }}
              >
                {paths.map((p) => (
                  <Tab key={p.id} value={p.id} label={p.name} sx={{ minHeight: 40, textTransform: 'none' }} />
                ))}
              </Tabs>
              <Tooltip title="Yeni path">
                <IconButton size="small" onClick={(e) => setNewPathAnchor(e.currentTarget)}>
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
              <Tooltip title="Geri al">
                <span>
                  <IconButton size="small" disabled={!canUndo} onClick={() => dispatch(ActionCreators.undo())}>
                    <UndoIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Yinele">
                <span>
                  <IconButton size="small" disabled={!canRedo} onClick={() => dispatch(ActionCreators.redo())}>
                    <RedoIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Verileri yenile">
                <IconButton size="small" onClick={() => queryClient.invalidateQueries({ queryKey: ['query'] })}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={newPathAnchor}
                open={Boolean(newPathAnchor)}
                onClose={() => setNewPathAnchor(null)}
              >
                <MenuItem disabled>
                  <Typography variant="caption">Dataset seç</Typography>
                </MenuItem>
                {datasetsData?.datasets.map((d) => (
                  <MenuItem
                    key={d.id}
                    onClick={() => {
                      dispatch(addPath(d.label, { kind: 'dataset', datasetId: d.id }));
                      setNewPathAnchor(null);
                    }}
                  >
                    {d.label}
                  </MenuItem>
                ))}
              </Menu>
            </Paper>
          )}

          {/* Canvas */}
          <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
            <Box sx={{ maxWidth: 1240, mx: 'auto', p: 3 }}>
              {activePath ? (
                <PathEditor key={activePath.id} path={activePath} />
              ) : (
                <EmptyAnalysis
                  onPick={(datasetId, label) =>
                    dispatch(addPath(label, { kind: 'dataset', datasetId }))
                  }
                />
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        message={snack}
      />
    </Box>
  );
}

function EmptyAnalysis({
  onPick,
}: {
  onPick: (datasetId: string, label: string) => void;
}) {
  const { data } = useDatasets();
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Bu analiz boş — bir dataset ile path başlat</Typography>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {data?.datasets.map((d) => (
          <Button
            key={d.id}
            variant="outlined"
            onClick={() => onPick(d.id, d.label)}
            sx={{ textTransform: 'none' }}
          >
            {d.label} ({d.rowCount.toLocaleString('tr-TR')} satır)
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}
