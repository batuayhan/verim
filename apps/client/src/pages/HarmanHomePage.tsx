import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import InsightsIcon from '@mui/icons-material/Insights';
import StorageIcon from '@mui/icons-material/Storage';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { deleteAnalysis, fetchAnalyses, fetchAnalysis } from '../api/client';
import { useDatasets } from '../api/hooks';
import { TopNav } from '../components/TopNav';
import { buildNewAnalysis } from '../core/newAnalysis';
import { addPath, setAnalysis } from '../store/analysisSlice';
import { useAppDispatch } from '../store/hooks';

export function HarmanHomePage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: datasetsData, isLoading, error } = useDatasets();
  const { data: analysesData } = useQuery({
    queryKey: ['analyses'],
    queryFn: fetchAnalyses,
  });

  const openAnalysis = async (id: string) => {
    const doc = await fetchAnalysis(id);
    dispatch(setAnalysis(doc));
    navigate(`/harman/${id}`);
  };

  const startFromDataset = (datasetId: string, label: string) => {
    const analysis = buildNewAnalysis(label);
    dispatch(setAnalysis(analysis));
    dispatch(addPath(label, { kind: 'dataset', datasetId }));
    navigate(`/harman/${analysis.id}`);
  };

  const removeAnalysis = async (id: string) => {
    await deleteAnalysis(id);
    await queryClient.invalidateQueries({ queryKey: ['analyses'] });
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <TopNav />
      <Box sx={{ maxWidth: 1240, mx: 'auto', p: 3 }}>
        {isLoading && (
          <Stack sx={{ alignItems: 'center', py: 8 }}>
            <CircularProgress />
          </Stack>
        )}
        {Boolean(error) && (
          <Alert severity="error">
            Backend'e ulaşılamadı — servis çalışıyor mu? ({String(error)})
          </Alert>
        )}

        {!isLoading && !error && (
          <Stack spacing={4}>
            <Stack spacing={2}>
              <Stack direction="row" sx={{ alignItems: 'center' }} spacing={2}>
                <Typography variant="h5">Harman — Veri Harmanlama ve Analiz</Typography>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    const analysis = buildNewAnalysis();
                    dispatch(setAnalysis(analysis));
                    navigate(`/harman/${analysis.id}`);
                  }}
                >
                  Yeni analiz
                </Button>
              </Stack>
              {(analysesData?.analyses.length ?? 0) === 0 ? (
                <Typography color="text.secondary">
                  Henüz kayıtlı analiz yok. Yeni analiz oluştur veya aşağıdan bir
                  dataset ile başla.
                </Typography>
              ) : (
                <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
                  {analysesData!.analyses.map((a) => (
                    <Card key={a.id} sx={{ width: 280 }}>
                      <CardActionArea onClick={() => void openAnalysis(a.id)}>
                        <CardContent>
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                            <InsightsIcon color="secondary" />
                            <Typography variant="h6" sx={{ flexGrow: 1 }} noWrap>
                              {a.name}
                            </Typography>
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            {a.pathCount} path
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(a.updatedAt).toLocaleString('tr-TR')}
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                      <Stack direction="row" sx={{ justifyContent: 'flex-end', px: 1, pb: 0.5 }}>
                        <Tooltip title="Analizi sil">
                          <IconButton size="small" onClick={() => void removeAnalysis(a.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              )}
            </Stack>

            <Stack spacing={2}>
              <Typography variant="h5">Bir dataset ile başla</Typography>
              <Typography color="text.secondary">
                Analiz, seçtiğin dataset'ten başlar; üzerine board'lar ekleyerek
                veriyi filtreler, dönüştürür ve görselleştirirsin.
              </Typography>
              <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {datasetsData?.datasets.map((d) => (
                  <Card key={d.id} sx={{ width: 280 }}>
                    <CardActionArea onClick={() => startFromDataset(d.id, d.label)}>
                      <CardContent>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                          <StorageIcon color="primary" />
                          <Typography variant="h6" noWrap>{d.label}</Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {d.rowCount.toLocaleString('tr-TR')} satır
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Son güncelleme:{' '}
                          {new Date(d.lastUpdated).toLocaleDateString('tr-TR')}
                        </Typography>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                ))}
              </Stack>
            </Stack>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
