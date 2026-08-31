import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddIcon from '@mui/icons-material/Add';
import GridViewIcon from '@mui/icons-material/GridView';
import RedoIcon from '@mui/icons-material/Redo';
import SaveIcon from '@mui/icons-material/Save';
import UndoIcon from '@mui/icons-material/Undo';
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { nanoid } from '@reduxjs/toolkit';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { GridLayout, useContainerWidth, type Layout, type LayoutItem } from 'react-grid-layout';
import { ActionCreators } from 'redux-undo';
import 'react-grid-layout/css/styles.css';
import { TopNav } from '../components/TopNav';
import {
  selectMercekAnalysis,
  useAppDispatch,
  useAppSelector,
} from '../store/hooks';
import {
  addMercekCard,
  renameMercekAnalysis,
  setMercekAnalysis,
  setMercekLayout,
} from '../store/mercekSlice';
import type { MercekCard, MercekLayoutItem } from '../types/mercek';
import { fetchMercekAnalysis, saveMercekAnalysis, useOntology } from './api';
import { ContinueBar } from './ContinueBar';
import { findFreeSlot, inputOf, nextChip } from './core';
import { GraphView } from './GraphView';
import { ParamsPanel } from './ParamsPanel';
import { MercekParamsProvider, type MercekParams } from './params';
import { MercekCardView } from './MercekCard';
import { PanoyaEkleDialog } from '../pano/PanoyaEkleDialog';
import type { GadgetConfig } from '../pano/api';

const CONTENTS_WIDTH = 260;

export function MercekAnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const analysis = useAppSelector(selectMercekAnalysis);
  const canUndo = useAppSelector((s) => s.mercek.past.length > 0);
  const canRedo = useAppSelector((s) => s.mercek.future.length > 0);
  const { data: ontology } = useOntology();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<'canvas' | 'graph'>('canvas');
  const [panoGadget, setPanoGadget] = useState<GadgetConfig | null>(null);

  const storeMatchesUrl = analysis?.id === id;
  useEffect(() => {
    if (!id || storeMatchesUrl) return;
    setLoadError(false);
    fetchMercekAnalysis(id)
      .then((doc) => dispatch(setMercekAnalysis(doc)))
      .catch(() => setLoadError(true));
  }, [id, storeMatchesUrl, dispatch]);

  const selectedCard = analysis?.cards.find((c) => c.id === selectedId) ?? null;

  const paramsCtx = useMemo<MercekParams>(() => {
    const list = analysis?.parameters ?? [];
    return {
      values: Object.fromEntries(list.map((p) => [p.name, p.value])),
      names: list.map((p) => p.name),
    };
  }, [analysis?.parameters]);

  const layout = useMemo<LayoutItem[]>(
    () =>
      (analysis?.cards ?? []).map((c) => {
        const l = analysis?.layout[c.id] ?? { x: 0, y: 0, w: 6, h: 7 };
        return { i: c.id, ...l, minW: 3, minH: 4 };
      }),
    [analysis],
  );

  const handleSave = async () => {
    if (!analysis) return;
    try {
      const res = await saveMercekAnalysis(analysis);
      await queryClient.invalidateQueries({ queryKey: ['mercek-analyses'] });
      setSnack(`Kaydedildi — ${new Date(res.updatedAt).toLocaleTimeString('tr-TR')}`);
    } catch (e) {
      setSnack(`Kaydedilemedi: ${String(e)}`);
    }
  };

  // Kartı panoya eklemeden önce analizi KAYDET — pano gadget'ı analysisId +
  // cardId ile canlı projeksiyon yapar; kaydedilmemiş kart sunucuda yoktur
  const handleAddToPano = async (card: MercekCard) => {
    if (!analysis) return;
    try {
      await saveMercekAnalysis(analysis);
      await queryClient.invalidateQueries({ queryKey: ['mercek-analyses'] });
    } catch (e) {
      setSnack(`Panoya eklenemedi (kaydetme hatası): ${String(e)}`);
      return;
    }
    setPanoGadget({
      tip: 'mercek_kart',
      analysisId: analysis.id,
      cardId: card.id,
      baslik: `${analysis.name} · ${card.title}`,
    });
  };

  const addObjectSet = (objectType: string) => {
    if (!analysis) return;
    const type = ontology?.objectTypes.find((t) => t.apiName === objectType);
    dispatch(
      addMercekCard({
        card: {
          id: nanoid(),
          chip: nextChip(analysis.cards),
          kind: 'objectSet',
          title: `${type?.icon ?? ''} ${type?.pluralName ?? objectType}`,
          objectType,
        },
        layout: findFreeSlot(analysis.layout, 6, 8),
      }),
    );
    setAddAnchor(null);
  };

  if (loadError) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <TopNav />
        <Box sx={{ maxWidth: 600, mx: 'auto', p: 4 }}>
          <Alert
            severity="warning"
            action={<Button component={Link} to="/mercek" size="small">Mercek ana sayfası</Button>}
          >
            Mercek analizi bulunamadı — silinmiş ya da hiç kaydedilmemiş olabilir.
          </Alert>
        </Box>
      </Box>
    );
  }

  if (!storeMatchesUrl || !ontology) {
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
    <MercekParamsProvider value={paramsCtx}>
    <Box sx={{ height: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
      <TopNav>
        {editingName ? (
          <TextField
            size="small"
            autoFocus
            defaultValue={analysis!.name}
            onBlur={(e) => {
              if (e.target.value.trim()) dispatch(renameMercekAnalysis(e.target.value.trim()));
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <Typography
            variant="subtitle2"
            onClick={() => setEditingName(true)}
            sx={{ cursor: 'text', '&:hover': { textDecoration: 'underline' } }}
          >
            {analysis!.name}
          </Typography>
        )}
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
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, v: 'canvas' | 'graph' | null) => {
            if (v) setView(v);
          }}
          sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1, textTransform: 'none' } }}
        >
          <ToggleButton value="canvas">
            <GridViewIcon fontSize="small" sx={{ mr: 0.5 }} /> Canvas
          </ToggleButton>
          <ToggleButton value="graph">
            <AccountTreeIcon fontSize="small" sx={{ mr: 0.5 }} /> Graf
          </ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" startIcon={<SaveIcon />} onClick={() => void handleSave()}>
          Kaydet
        </Button>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={(e) => setAddAnchor(e.currentTarget)}
        >
          Nesne ekle
        </Button>
        <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
          {ontology.objectTypes.map((t) => (
            <MenuItem key={t.apiName} onClick={() => addObjectSet(t.apiName)}>
              <ListItemText
                primary={`${t.icon ?? ''} ${t.pluralName}`}
                secondary={`${t.properties.length} özellik`}
              />
            </MenuItem>
          ))}
        </Menu>
      </TopNav>

      <Box sx={{ display: 'flex', flexGrow: 1, minHeight: 0 }}>
        {/* Sol: analiz içeriği */}
        <Paper
          square
          elevation={0}
          sx={{
            width: CONTENTS_WIDTH,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            overflowY: 'auto',
          }}
        >
          <Typography variant="overline" color="text.secondary" sx={{ px: 2, pt: 1, display: 'block' }}>
            Analiz içeriği
          </Typography>
          <List dense>
            {analysis!.cards.map((c) => {
              const depth = chainDepth(analysis!.cards, c.id);
              return (
                <ListItemButton
                  key={c.id}
                  selected={c.id === selectedId}
                  onClick={() => setSelectedId(c.id)}
                  sx={{ pl: 2 + depth * 1.5 }}
                >
                  <Avatar sx={{ width: 22, height: 22, fontSize: 9, fontWeight: 700, bgcolor: 'secondary.main', mr: 1 }}>
                    {c.chip}
                  </Avatar>
                  <ListItemText
                    primary={c.title}
                    slotProps={{ primary: { noWrap: true, sx: { fontSize: 13 } } }}
                  />
                </ListItemButton>
              );
            })}
            {analysis!.cards.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>
                Henüz kart yok.
              </Typography>
            )}
          </List>

          <Divider sx={{ my: 1 }} />
          <ParamsPanel parameters={analysis!.parameters ?? []} />
        </Paper>

        {/* Canvas */}
        <CanvasArea>
          {analysis!.cards.length === 0 ? (
            <Stack sx={{ alignItems: 'center', py: 10 }} spacing={2}>
              <Typography variant="h5">Görselleştir, Analiz Et, Keşfet</Typography>
              <Typography color="text.secondary" sx={{ maxWidth: 480, textAlign: 'center' }}>
                Bir nesne kümesiyle başla; sonra kartı seçip alttaki bardan
                filtrele, görselleştir veya ilişkili nesnelere geç.
              </Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={(e) => setAddAnchor(e.currentTarget)}>
                Nesne ekle
              </Button>
              <Stack direction="row" spacing={1}>
                {['Filtrele', 'Görselleştir', 'Hesapla', 'İlişkilere geç', 'Zaman serisi'].map((s) => (
                  <Typography key={s} variant="caption" color="text.disabled">
                    {s}
                  </Typography>
                ))}
              </Stack>
            </Stack>
          ) : view === 'graph' ? (
            <GraphView
              analysis={analysis!}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : (
            <MercekGrid
              layout={layout}
              onLayoutChange={(next: Layout) => {
                const map: Record<string, MercekLayoutItem> = {};
                for (const l of next) map[l.i] = { x: l.x, y: l.y, w: l.w, h: l.h };
                dispatch(setMercekLayout(map));
              }}
            >
              {analysis!.cards.map((c) => (
                <div key={c.id}>
                  <MercekCardView
                    analysis={analysis!}
                    card={c}
                    ontology={ontology}
                    selected={c.id === selectedId}
                    onSelect={() => setSelectedId(c.id)}
                    onAddToPano={(card) => void handleAddToPano(card)}
                  />
                </div>
              ))}
            </MercekGrid>
          )}

          {/* Continue bar — seçili kart varken alt ortada süzülür */}
          {selectedCard && (
            <Box
              sx={{
                position: 'sticky',
                bottom: 16,
                display: 'flex',
                justifyContent: 'center',
                pointerEvents: 'none',
                '& > *': { pointerEvents: 'auto' },
                zIndex: 10,
              }}
            >
              <ContinueBar analysis={analysis!} selectedCard={selectedCard} ontology={ontology} />
            </Box>
          )}
        </CanvasArea>
      </Box>

      <Snackbar open={Boolean(snack)} autoHideDuration={3000} onClose={() => setSnack(null)} message={snack} />
      <PanoyaEkleDialog
        open={panoGadget !== null}
        gadget={panoGadget}
        onClose={() => setPanoGadget(null)}
        onDone={(m) => setSnack(m)}
      />
    </Box>
    </MercekParamsProvider>
  );
}

function chainDepth(cards: MercekCard[], id: string): number {
  let depth = 0;
  let current = cards.find((c) => c.id === id);
  while (current) {
    const parent = inputOf(current);
    if (!parent) break;
    current = cards.find((c) => c.id === parent);
    depth++;
    if (depth > 20) break;
  }
  return depth;
}


function CanvasArea({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        flexGrow: 1,
        minWidth: 0,
        overflowY: 'auto',
        position: 'relative',
        // resize tutamacı kart içeriğinin (DataGrid vb.) üstünde kalsın
        '& .react-resizable-handle': { zIndex: 20 },
        '& .react-grid-item.react-grid-placeholder': {
          background: '#90caf9',
          opacity: 0.35,
          borderRadius: 4,
        },
      }}
    >
      {children}
    </Box>
  );
}

/** RGL v2: WidthProvider yerine useContainerWidth hook'u. */
function MercekGrid({
  layout,
  onLayoutChange,
  children,
}: {
  layout: LayoutItem[];
  onLayoutChange: (next: Layout) => void;
  children: React.ReactNode;
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  return (
    <div ref={containerRef}>
      {mounted && (
        <GridLayout
          layout={layout}
          width={width}
          gridConfig={{ cols: 12, rowHeight: 36, margin: [12, 12] }}
          dragConfig={{ handle: '.mercek-drag' }}
          resizeConfig={{ handles: ['se', 'e', 's'] }}
          onLayoutChange={onLayoutChange}
        >
          {children}
        </GridLayout>
      )}
    </div>
  );
}
