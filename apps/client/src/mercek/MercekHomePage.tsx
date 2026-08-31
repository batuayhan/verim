import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import HubIcon from '@mui/icons-material/Hub';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nanoid } from '@reduxjs/toolkit';
import { useNavigate } from 'react-router';
import { TopNav } from '../components/TopNav';
import { useAppDispatch } from '../store/hooks';
import { setMercekAnalysis } from '../store/mercekSlice';
import {
  deleteMercekAnalysis,
  fetchMercekAnalyses,
  fetchMercekAnalysis,
  useOntology,
} from './api';

export function MercekHomePage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['mercek-analyses'],
    queryFn: fetchMercekAnalyses,
  });
  const { data: ontology } = useOntology();

  const createNew = () => {
    const id = nanoid();
    dispatch(setMercekAnalysis({ id, name: 'Yeni Mercek Analizi', cards: [], layout: {} }));
    navigate(`/mercek/${id}`);
  };

  const open = async (id: string) => {
    const doc = await fetchMercekAnalysis(id);
    dispatch(setMercekAnalysis(doc));
    navigate(`/mercek/${id}`);
  };

  const remove = async (id: string) => {
    await deleteMercekAnalysis(id);
    await queryClient.invalidateQueries({ queryKey: ['mercek-analyses'] });
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <TopNav />
      <Box sx={{ maxWidth: 1240, mx: 'auto', p: 3 }}>
        <Stack spacing={3}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Typography variant="h5">Mercek — Nesne Keşfi</Typography>
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={createNew}>
              Yeni analiz
            </Button>
          </Stack>
          <Typography color="text.secondary" sx={{ maxWidth: 720 }}>
            Mercek, ontolojideki nesneler (
            {ontology?.objectTypes.map((t) => t.pluralName).join(', ') ?? '…'}
            ) üzerinde kart tabanlı keşif aracıdır: bir nesne kümesiyle başla,
            filtrele, ilişkili nesnelere geç, görselleştir — kod veya
            expression bilgisi gerekmez.
          </Typography>

          <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {data?.analyses.map((a) => (
              <Card key={a.id} sx={{ width: 280 }}>
                <CardActionArea onClick={() => void open(a.id)}>
                  <CardContent>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                      <HubIcon color="secondary" />
                      <Typography variant="h6" sx={{ flexGrow: 1 }} noWrap>
                        {a.name}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {a.cardCount} kart
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(a.updatedAt).toLocaleString('tr-TR')}
                    </Typography>
                  </CardContent>
                </CardActionArea>
                <Stack direction="row" sx={{ justifyContent: 'flex-end', px: 1, pb: 0.5 }}>
                  <Tooltip title="Analizi sil">
                    <IconButton size="small" onClick={() => void remove(a.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Card>
            ))}
            {(data?.analyses.length ?? 0) === 0 && (
              <Typography color="text.secondary">
                Henüz Mercek analizi yok — "Yeni analiz" ile başla.
              </Typography>
            )}
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
