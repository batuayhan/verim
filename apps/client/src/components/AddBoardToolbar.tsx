import BarChartIcon from '@mui/icons-material/BarChart';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import EditIcon from '@mui/icons-material/Edit';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import FunctionsIcon from '@mui/icons-material/Functions';
import JoinInnerIcon from '@mui/icons-material/JoinInner';
import PivotTableChartIcon from '@mui/icons-material/PivotTableChart';
import SearchIcon from '@mui/icons-material/Search';
import SortIcon from '@mui/icons-material/Sort';
import TableChartIcon from '@mui/icons-material/TableChart';
import TransformIcon from '@mui/icons-material/Transform';
import VerifiedIcon from '@mui/icons-material/Verified';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import {
  Button,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
} from '@mui/material';
import { useState, type ReactNode } from 'react';
import { makeBoard } from '../core/boardDefaults';
import { addBoard } from '../store/analysisSlice';
import { useAppDispatch } from '../store/hooks';
import type { BoardType } from '../types/boards';

export interface BoardOption {
  type: BoardType;
  label: string;
  desc: string;
  icon: ReactNode;
}

export const BOARD_OPTIONS: BoardOption[] = [
  { type: 'table', label: 'Table', desc: 'Verinin örneklemini gör, şemayı keşfet', icon: <TableChartIcon fontSize="small" /> },
  { type: 'filter', label: 'Filter', desc: 'Sayı, metin, tarih veya null değerlerle süz', icon: <FilterAltIcon fontSize="small" /> },
  { type: 'histogram', label: 'Histogram', desc: 'Grupla, görselleştir ve gruba tıklayarak filtrele', icon: <SortIcon fontSize="small" /> },
  { type: 'chart', label: 'Chart', desc: 'Özelleştirilebilir çok serili chartlar', icon: <BarChartIcon fontSize="small" /> },
  { type: 'expression', label: 'Expression', desc: 'Expression diliyle kolon türet, süz veya aggregate et', icon: <FunctionsIcon fontSize="small" /> },
  { type: 'pivot', label: 'Pivot Table', desc: 'Metrikleri satır ve sütunlar boyunca incele', icon: <PivotTableChartIcon fontSize="small" /> },
  { type: 'enrich', label: 'Enrich', desc: 'Başka dataset ile join edip kolonları birleştir', icon: <JoinInnerIcon fontSize="small" /> },
  { type: 'setMath', label: 'Set Math', desc: 'Başka dataset\'e göre satır tut / ekle / çıkar', icon: <CallMergeIcon fontSize="small" /> },
  { type: 'editColumns', label: 'Edit Columns', desc: 'Kolon sil, yeniden adlandır, tip değiştir', icon: <ViewColumnIcon fontSize="small" /> },
];

const CATEGORIES: Array<{
  key: string;
  label: string;
  icon: ReactNode;
  color: string;
  boards: BoardType[];
}> = [
  { key: 'suggested', label: 'Suggested', icon: <VerifiedIcon fontSize="small" />, color: '#0ca30c', boards: ['table', 'filter', 'histogram', 'chart', 'expression', 'pivot'] },
  { key: 'filter', label: 'Filter', icon: <FilterAltIcon fontSize="small" />, color: '#eda100', boards: ['filter'] },
  { key: 'visualize', label: 'Visualize', icon: <BarChartIcon fontSize="small" />, color: '#2a78d6', boards: ['table', 'histogram', 'chart', 'pivot'] },
  { key: 'join', label: 'Join', icon: <JoinInnerIcon fontSize="small" />, color: '#1baf7a', boards: ['enrich', 'setMath'] },
  { key: 'transform', label: 'Transform', icon: <TransformIcon fontSize="small" />, color: '#e87ba4', boards: ['expression'] },
  { key: 'editColumns', label: 'Edit Columns', icon: <EditIcon fontSize="small" />, color: '#4a3aa7', boards: ['editColumns'] },
];

/** Harman'un path sonundaki kategorili board ekleme toolbar'ı. */
export function AddBoardToolbar({ pathId }: { pathId: string }) {
  const dispatch = useAppDispatch();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const add = (type: BoardType) => {
    dispatch(addBoard({ pathId, board: makeBoard(type) }));
    setAnchor(null);
    setOpenCategory(null);
    setSearch('');
  };

  const openMenu = (key: string) => (e: React.MouseEvent<HTMLElement>) => {
    setAnchor(e.currentTarget);
    setOpenCategory(key);
  };

  const currentBoards =
    openCategory === 'search'
      ? BOARD_OPTIONS.filter(
          (o) =>
            o.label.toLowerCase().includes(search.toLowerCase()) ||
            o.desc.toLowerCase().includes(search.toLowerCase()),
        )
      : BOARD_OPTIONS.filter((o) =>
          CATEGORIES.find((c) => c.key === openCategory)?.boards.includes(o.type),
        );

  return (
    <Paper variant="outlined" sx={{ p: 0.5 }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <Button size="small" color="inherit" sx={{ minWidth: 40 }} onClick={openMenu('search')}>
          <SearchIcon fontSize="small" />
        </Button>
        {CATEGORIES.map((c) => (
          <Button
            key={c.key}
            size="small"
            color="inherit"
            onClick={openMenu(c.key)}
            startIcon={<span style={{ color: c.color, display: 'inline-flex' }}>{c.icon}</span>}
            sx={{ textTransform: 'none', px: 1.5 }}
          >
            {c.label} ▾
          </Button>
        ))}
      </Stack>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => { setAnchor(null); setOpenCategory(null); }}
        slotProps={{ paper: { sx: { width: 420 } } }}
      >
        {openCategory === 'search' && (
          <MenuItem disableRipple sx={{ '&:hover': { bgcolor: 'transparent' } }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              placeholder="Board'ları isim veya işlevle ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </MenuItem>
        )}
        {currentBoards.map((o) => (
          <MenuItem key={o.type} onClick={() => add(o.type)}>
            <ListItemIcon>{o.icon}</ListItemIcon>
            <ListItemText primary={o.label} secondary={o.desc} />
          </MenuItem>
        ))}
      </Menu>
    </Paper>
  );
}
