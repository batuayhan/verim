import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InsightsIcon from '@mui/icons-material/Insights';
import StorageIcon from '@mui/icons-material/Storage';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useDatasets, useDatasetSchema } from '../api/hooks';
import { TopNav } from '../components/TopNav';
import { buildNewAnalysis } from '../core/newAnalysis';
import { addPath, setAnalysis } from '../store/analysisSlice';
import { useAppDispatch } from '../store/hooks';

export function DatasetsPage() {
  const { data, isLoading, error } = useDatasets();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <TopNav />
      <Box sx={{ maxWidth: 1000, mx: 'auto', p: 3 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>
          Datasetler
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Analizlere kaynak olan tablolar. "Save as dataset" ile
          materialize ettiğin sonuçlar da burada listelenir.
        </Typography>

        {isLoading && (
          <Stack sx={{ alignItems: 'center', py: 8 }}>
            <CircularProgress />
          </Stack>
        )}
        {Boolean(error) && <Alert severity="error">{String(error)}</Alert>}

        {data?.datasets.map((d) => (
          <Accordion
            key={d.id}
            expanded={expanded === d.id}
            onChange={(_, open) => setExpanded(open ? d.id : null)}
            disableGutters
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack
                direction="row"
                spacing={2}
                sx={{ alignItems: 'center', flexGrow: 1, pr: 2 }}
              >
                <StorageIcon color={d.id.startsWith('derived_') ? 'secondary' : 'primary'} />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography sx={{ fontWeight: 600 }}>{d.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {d.id}
                  </Typography>
                </Box>
                {d.id.startsWith('derived_') && (
                  <Chip size="small" variant="outlined" color="secondary" label="Türetilmiş" />
                )}
                <Typography variant="body2" color="text.secondary">
                  {d.rowCount.toLocaleString('tr-TR')} satır
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(d.lastUpdated).toLocaleDateString('tr-TR')}
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              {expanded === d.id && <DatasetDetail datasetId={d.id} label={d.label} />}
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Box>
  );
}

function DatasetDetail({ datasetId, label }: { datasetId: string; label: string }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data, isLoading } = useDatasetSchema(datasetId);

  const analyze = () => {
    const analysis = buildNewAnalysis(label);
    dispatch(setAnalysis(analysis));
    dispatch(addPath(label, { kind: 'dataset', datasetId }));
    navigate(`/harman/${analysis.id}`);
  };

  if (isLoading) return <CircularProgress size={20} />;
  if (!data) return <Alert severity="error">Şema alınamadı.</Alert>;

  return (
    <Stack spacing={2}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Kolon</TableCell>
            <TableCell>Tip</TableCell>
            <TableCell>Null olabilir</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.schema.columns.map((c) => (
            <TableRow key={c.name}>
              <TableCell sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {c.name}
              </TableCell>
              <TableCell>
                <Chip size="small" variant="outlined" label={c.type} />
              </TableCell>
              <TableCell>{c.nullable ? 'evet' : 'hayır'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button
        variant="contained"
        startIcon={<InsightsIcon />}
        sx={{ alignSelf: 'flex-start' }}
        onClick={analyze}
      >
        Bu dataset ile analiz başlat
      </Button>
    </Stack>
  );
}
