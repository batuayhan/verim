import CloseIcon from '@mui/icons-material/Close';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  Avatar,
  Box,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMemo } from 'react';
import { useAppDispatch } from '../store/hooks';
import { removeMercekCard, updateMercekCard } from '../store/mercekSlice';
import type { OntologyResponse, MercekAnalysis, MercekCard } from '../types/mercek';
import { ChartCardBody } from './cards/ChartCardBody';
import { FilterCardBody } from './cards/FilterCardBody';
import { JoinLinkedCardBody } from './cards/JoinLinkedCardBody';
import { MetricCardBody } from './cards/MetricCardBody';
import { ObjectSetTableBody } from './cards/ObjectSetTableBody';
import { TimeseriesCardBody } from './cards/TimeseriesCardBody';
import { buildDef, inputOf, outputBadge, resultObjectType } from './core';

export function MercekCardView({
  analysis,
  card,
  ontology,
  selected,
  onSelect,
  onAddToPano,
}: {
  analysis: MercekAnalysis;
  card: MercekCard;
  ontology: OntologyResponse;
  selected: boolean;
  onSelect: () => void;
  /** Kartı sistemdeki bir panoya ekle (hedef seçim dialogu açar) */
  onAddToPano: (card: MercekCard) => void;
}) {
  const dispatch = useAppDispatch();

  const selfDef = useMemo(() => buildDef(analysis, card.id), [analysis, card.id]);
  const inputId = inputOf(card);
  const inputDef = useMemo(
    () => (inputId ? buildDef(analysis, inputId) : selfDef),
    [analysis, inputId, selfDef],
  );

  // Kartın çalıştığı nesne tipinin property'leri (config formları için)
  const workingType = useMemo(() => {
    const typeName = inputId
      ? resultObjectType(analysis, inputId, ontology)
      : resultObjectType(analysis, card.id, ontology);
    return ontology.objectTypes.find((t) => t.apiName === typeName);
  }, [analysis, card.id, inputId, ontology]);

  const patch = (p: Partial<MercekCard>) =>
    dispatch(updateMercekCard({ ...card, ...p } as MercekCard));

  return (
    <Paper
      variant="outlined"
      onClick={onSelect}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderColor: selected ? 'primary.main' : undefined,
        borderWidth: selected ? 2 : 1,
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: selected ? 'action.selected' : 'background.paper',
        }}
      >
        <Box className="mercek-drag" sx={{ cursor: 'grab', display: 'inline-flex', color: 'text.secondary' }}>
          <DragIndicatorIcon fontSize="small" />
        </Box>
        <Avatar
          sx={{
            width: 26,
            height: 26,
            fontSize: 11,
            fontWeight: 700,
            bgcolor: 'secondary.main',
          }}
        >
          {card.chip}
        </Avatar>
        <Typography variant="subtitle2" noWrap sx={{ flexGrow: 1 }}>
          {card.title}
        </Typography>
        <Chip size="small" variant="outlined" label={outputBadge(card)} />
        <Tooltip title="Panoya ekle">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onAddToPano(card);
            }}
          >
            <DashboardCustomizeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Kartı ve türeyenlerini kaldır">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              dispatch(removeMercekCard({ cardId: card.id }));
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Box sx={{ p: 1, flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {(card.kind === 'objectSet' ||
          card.kind === 'searchAround' ||
          card.kind === 'drilldown') && <ObjectSetTableBody def={selfDef} />}
        {card.kind === 'joinLinked' && (
          <JoinLinkedCardBody card={card} selfDef={selfDef} ontology={ontology} />
        )}
        {card.kind === 'filter' && workingType && (
          <FilterCardBody
            card={card}
            inputDef={inputDef}
            selfDef={selfDef}
            properties={workingType.properties}
          />
        )}
        {card.kind === 'chart' && workingType && (
          <ChartCardBody card={card} inputDef={inputDef} properties={workingType.properties} onPatch={patch} />
        )}
        {card.kind === 'metric' && workingType && (
          <MetricCardBody card={card} inputDef={inputDef} properties={workingType.properties} onPatch={patch} />
        )}
        {card.kind === 'timeseries' && workingType && (
          <TimeseriesCardBody card={card} inputDef={inputDef} properties={workingType.properties} onPatch={patch} />
        )}
      </Box>
    </Paper>
  );
}
