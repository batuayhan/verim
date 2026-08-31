import BarChartIcon from '@mui/icons-material/BarChart';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import HubIcon from '@mui/icons-material/Hub';
import JoinInnerIcon from '@mui/icons-material/JoinInner';
import NumbersIcon from '@mui/icons-material/Numbers';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import {
  Avatar,
  Button,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { nanoid } from '@reduxjs/toolkit';
import { useState } from 'react';
import { useAppDispatch } from '../store/hooks';
import { addMercekCard } from '../store/mercekSlice';
import type {
  OntologyResponse,
  MercekAnalysis,
  MercekCard,
  MercekLayoutItem,
} from '../types/mercek';
import { findFreeSlot, nextChip, resultObjectType } from './core';

/**
 * Mercek'ın "Continue analysis from [$X]" barı — seçili karttan yeni
 * kart türetmenin tek yolu. Acemi kullanıcı "sırada ne yapabilirim?"
 * sorusunun cevabını her an burada görür.
 */
export function ContinueBar({
  analysis,
  selectedCard,
  ontology,
}: {
  analysis: MercekAnalysis;
  selectedCard: MercekCard;
  ontology: OntologyResponse;
}) {
  const dispatch = useAppDispatch();
  const [linkAnchor, setLinkAnchor] = useState<HTMLElement | null>(null);
  const [joinAnchor, setJoinAnchor] = useState<HTMLElement | null>(null);

  const typeName = resultObjectType(analysis, selectedCard.id, ontology);
  const objectType = ontology.objectTypes.find((t) => t.apiName === typeName);
  const links = ontology.linkTypes.filter((l) => l.fromObjectType === typeName);
  const dateProps = objectType?.properties.filter(
    (p) => p.type === 'date' || p.type === 'timestamp',
  ) ?? [];

  const spawn = (card: MercekCard, tall = false) => {
    const near = analysis.layout[selectedCard.id];
    const layout: MercekLayoutItem = findFreeSlot(
      analysis.layout,
      6,
      tall ? 9 : 7,
      near,
    );
    dispatch(addMercekCard({ card, layout }));
  };

  const base = () => ({ id: nanoid(), chip: nextChip(analysis.cards) });

  return (
    <Paper
      elevation={3}
      sx={{
        px: 1.5,
        py: 0.75,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderRadius: 5,
      }}
    >
      <Avatar sx={{ width: 24, height: 24, fontSize: 10, fontWeight: 700, bgcolor: 'secondary.main' }}>
        {selectedCard.chip}
      </Avatar>
      <Typography variant="body2" color="text.secondary">
        kartından devam et:
      </Typography>
      <Stack direction="row" spacing={0.5}>
        <Button
          size="small"
          startIcon={<FilterAltIcon />}
          sx={{ textTransform: 'none' }}
          onClick={() =>
            spawn(
              {
                ...base(),
                kind: 'filter',
                title: `Filtre — ${objectType?.pluralName ?? ''}`,
                inputId: selectedCard.id,
                combinator: 'and',
                conditions: [],
              },
              true,
            )
          }
        >
          Filtrele
        </Button>
        <Button
          size="small"
          startIcon={<BarChartIcon />}
          sx={{ textTransform: 'none' }}
          onClick={() =>
            spawn({
              ...base(),
              kind: 'chart',
              title: `Grafik — ${objectType?.pluralName ?? ''}`,
              inputId: selectedCard.id,
              chartType: 'bar',
              groupBy: '',
              metric: { fn: 'count' },
            })
          }
        >
          Görselleştir
        </Button>
        <Button
          size="small"
          startIcon={<NumbersIcon />}
          sx={{ textTransform: 'none' }}
          onClick={() =>
            spawn({
              ...base(),
              kind: 'metric',
              title: `Metrik — ${objectType?.pluralName ?? ''}`,
              inputId: selectedCard.id,
              metric: { fn: 'count' },
            })
          }
        >
          Hesapla
        </Button>
        <Button
          size="small"
          startIcon={<ShowChartIcon />}
          sx={{ textTransform: 'none' }}
          disabled={dateProps.length === 0}
          onClick={() =>
            spawn({
              ...base(),
              kind: 'timeseries',
              title: `Zaman serisi — ${objectType?.pluralName ?? ''}`,
              inputId: selectedCard.id,
              dateProperty: dateProps[0]?.apiName ?? '',
              metric: { fn: 'count' },
              granularity: 'month',
            })
          }
        >
          Zaman serisi
        </Button>
        <Button
          size="small"
          startIcon={<HubIcon />}
          sx={{ textTransform: 'none' }}
          disabled={links.length === 0}
          onClick={(e) => setLinkAnchor(e.currentTarget)}
        >
          İlişkilere geç ▾
        </Button>
        <Button
          size="small"
          startIcon={<JoinInnerIcon />}
          sx={{ textTransform: 'none' }}
          disabled={links.length === 0}
          onClick={(e) => setJoinAnchor(e.currentTarget)}
        >
          İlişkiden kolon ekle ▾
        </Button>
      </Stack>

      <Menu anchorEl={linkAnchor} open={Boolean(linkAnchor)} onClose={() => setLinkAnchor(null)}>
        {links.map((link) => {
          const target = ontology.objectTypes.find((t) => t.apiName === link.toObjectType);
          return (
            <MenuItem
              key={link.apiName}
              onClick={() => {
                spawn(
                  {
                    ...base(),
                    kind: 'searchAround',
                    title: `${target?.icon ?? ''} ${link.displayName}`,
                    inputId: selectedCard.id,
                    linkType: link.apiName,
                  },
                  true,
                );
                setLinkAnchor(null);
              }}
            >
              <ListItemText
                primary={link.displayName}
                secondary={`→ ${target?.pluralName ?? link.toObjectType}`}
              />
            </MenuItem>
          );
        })}
      </Menu>

      {/* Satır seviyesinde join: küme aynı kalır, hedef tipin kolonları eklenir */}
      <Menu anchorEl={joinAnchor} open={Boolean(joinAnchor)} onClose={() => setJoinAnchor(null)}>
        {links.map((link) => {
          const target = ontology.objectTypes.find((t) => t.apiName === link.toObjectType);
          return (
            <MenuItem
              key={link.apiName}
              onClick={() => {
                const defaults = (target?.properties ?? [])
                  .filter((p) => p.apiName !== target?.primaryKey)
                  .slice(0, 2)
                  .map((p) => p.apiName);
                spawn(
                  {
                    ...base(),
                    kind: 'joinLinked',
                    title: `${objectType?.pluralName ?? ''} + ${target?.displayName ?? ''} kolonları`,
                    inputId: selectedCard.id,
                    linkType: link.apiName,
                    columns: defaults.length ? defaults : [target?.primaryKey ?? ''],
                  },
                  true,
                );
                setJoinAnchor(null);
              }}
            >
              <ListItemText
                primary={link.displayName}
                secondary={`${target?.displayName ?? link.toObjectType} kolonlarını tabloya ekle`}
              />
            </MenuItem>
          );
        })}
      </Menu>
    </Paper>
  );
}
