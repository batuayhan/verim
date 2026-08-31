import AddIcon from '@mui/icons-material/Add';
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import { useState } from 'react';
import { makeBoard } from '../core/boardDefaults';
import { addBoard } from '../store/analysisSlice';
import { useAppDispatch } from '../store/hooks';
import type { BoardType } from '../types/boards';
import { BOARD_OPTIONS } from './AddBoardToolbar';

/** İki board arasına ekleme — Harman'un hover-"+" insert akışı. */
export function InsertBoardButton({
  pathId,
  insertIndex,
}: {
  pathId: string;
  insertIndex: number;
}) {
  const dispatch = useAppDispatch();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const add = (type: BoardType) => {
    dispatch(addBoard({ pathId, board: makeBoard(type), index: insertIndex }));
    setAnchor(null);
  };

  return (
    <>
      <Tooltip title="Araya board ekle">
        <IconButton
          size="small"
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{
            width: 22,
            height: 22,
            border: '1px dashed',
            borderColor: 'divider',
            opacity: 0.35,
            transition: 'opacity 120ms',
            '&:hover': { opacity: 1, borderColor: 'primary.main', color: 'primary.main' },
          }}
        >
          <AddIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {BOARD_OPTIONS.map((o) => (
          <MenuItem key={o.type} onClick={() => add(o.type)}>
            <ListItemIcon>{o.icon}</ListItemIcon>
            <ListItemText primary={o.label} secondary={o.desc} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
