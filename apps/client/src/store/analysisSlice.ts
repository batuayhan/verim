/**
 * The analysis document slice — the single source of truth for the
 * Analysis → Path → Board tree. Wrapped with redux-undo in store.ts so
 * every board/path mutation is undoable.
 */

import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';
import type {
  Analysis,
  AnalysisPath,
  DashboardWidget,
  WidgetLayoutRect,
  Parameter,
  PathSource,
} from '../types/analysis';
import type { BoardConfig } from '../types/boards';

export interface AnalysisState {
  analysis: Analysis | null;
}

const initialState: AnalysisState = {
  analysis: null,
};

function requirePath(state: AnalysisState, pathId: string): AnalysisPath {
  const path = state.analysis?.paths.find((p) => p.id === pathId);
  if (!path) throw new Error(`Path not found: ${pathId}`);
  return path;
}

const analysisSlice = createSlice({
  name: 'analysis',
  initialState,
  reducers: {
    setAnalysis(state, action: PayloadAction<Analysis>) {
      state.analysis = action.payload;
    },

    createAnalysis: {
      reducer(state, action: PayloadAction<{ id: string; name: string }>) {
        state.analysis = {
          id: action.payload.id,
          name: action.payload.name,
          paths: [],
          parameters: [],
          dashboard: {
            title: action.payload.name,
            tabs: [{ id: nanoid(), name: 'Sekme 1', widgets: [] }],
          },
        };
      },
      prepare(name: string) {
        return { payload: { id: nanoid(), name } };
      },
    },

    renameAnalysis(state, action: PayloadAction<string>) {
      if (state.analysis) {
        state.analysis.name = action.payload;
        state.analysis.dashboard.title = action.payload;
      }
    },

    // --- Paths ---

    addPath: {
      reducer(
        state,
        action: PayloadAction<{ id: string; name: string; source: PathSource }>,
      ) {
        state.analysis?.paths.push({ ...action.payload, boards: [] });
      },
      prepare(name: string, source: PathSource) {
        return { payload: { id: nanoid(), name, source } };
      },
    },

    removePath(state, action: PayloadAction<{ pathId: string }>) {
      if (!state.analysis) return;
      state.analysis.paths = state.analysis.paths.filter(
        (p) => p.id !== action.payload.pathId,
      );
    },

    changePathSource(
      state,
      action: PayloadAction<{ pathId: string; source: PathSource }>,
    ) {
      requirePath(state, action.payload.pathId).source = action.payload.source;
    },

    // --- Boards ---

    /** Append, or insert at `index` (the hover-"+" between boards). */
    addBoard(
      state,
      action: PayloadAction<{ pathId: string; board: BoardConfig; index?: number }>,
    ) {
      const path = requirePath(state, action.payload.pathId);
      const { board, index } = action.payload;
      if (index === undefined) path.boards.push(board);
      else path.boards.splice(index, 0, board);
    },

    updateBoard(
      state,
      action: PayloadAction<{ pathId: string; board: BoardConfig }>,
    ) {
      const path = requirePath(state, action.payload.pathId);
      const i = path.boards.findIndex((b) => b.id === action.payload.board.id);
      if (i !== -1) path.boards[i] = action.payload.board;
    },

    removeBoard(
      state,
      action: PayloadAction<{ pathId: string; boardId: string }>,
    ) {
      const path = requirePath(state, action.payload.pathId);
      path.boards = path.boards.filter((b) => b.id !== action.payload.boardId);
    },

    /** "Remove boards below" from the edit-path menu. */
    removeBoardsBelow(
      state,
      action: PayloadAction<{ pathId: string; index: number }>,
    ) {
      const path = requirePath(state, action.payload.pathId);
      path.boards = path.boards.slice(0, action.payload.index);
    },

    // --- Parameters ---

    addParameter(state, action: PayloadAction<Parameter>) {
      state.analysis?.parameters.push(action.payload);
    },

    setParameterValue(
      state,
      action: PayloadAction<{ name: string; value: Parameter['value'] }>,
    ) {
      const param = state.analysis?.parameters.find(
        (p) => p.name === action.payload.name,
      );
      if (param) param.value = action.payload.value;
    },

    removeParameter(state, action: PayloadAction<{ name: string }>) {
      if (!state.analysis) return;
      state.analysis.parameters = state.analysis.parameters.filter(
        (p) => p.name !== action.payload.name,
      );
    },

    // --- Dashboard ---

    addWidgetToDashboard: {
      reducer(
        state,
        action: PayloadAction<{ widget: DashboardWidget; tabId?: string; newTabName?: string }>,
      ) {
        const dashboard = state.analysis?.dashboard;
        if (!dashboard) return;
        if (action.payload.newTabName) {
          dashboard.tabs.push({
            id: nanoid(),
            name: action.payload.newTabName,
            widgets: [action.payload.widget],
          });
          return;
        }
        let tab =
          dashboard.tabs.find((t) => t.id === action.payload.tabId) ??
          dashboard.tabs[0];
        if (!tab) {
          tab = { id: nanoid(), name: 'Sekme 1', widgets: [] };
          dashboard.tabs.push(tab);
        }
        tab.widgets.push(action.payload.widget);
      },
      prepare(input: {
        widget: Omit<DashboardWidget, 'id'>;
        tabId?: string;
        newTabName?: string;
      }) {
        return {
          payload: {
            widget: { ...input.widget, id: nanoid() },
            tabId: input.tabId,
            newTabName: input.newTabName,
          },
        };
      },
    },

    removeDashboardWidget(
      state,
      action: PayloadAction<{ tabId: string; widgetId: string }>,
    ) {
      const tab = state.analysis?.dashboard.tabs.find(
        (t) => t.id === action.payload.tabId,
      );
      if (tab) {
        tab.widgets = tab.widgets.filter((w) => w.id !== action.payload.widgetId);
        if (tab.layout) delete tab.layout[action.payload.widgetId];
      }
    },

    setDashboardLayout(
      state,
      action: PayloadAction<{ tabId: string; layout: Record<string, WidgetLayoutRect> }>,
    ) {
      const tab = state.analysis?.dashboard.tabs.find(
        (t) => t.id === action.payload.tabId,
      );
      if (tab) tab.layout = { ...tab.layout, ...action.payload.layout };
    },
  },
});

export const {
  setAnalysis,
  createAnalysis,
  renameAnalysis,
  addPath,
  removePath,
  changePathSource,
  addBoard,
  updateBoard,
  removeBoard,
  removeBoardsBelow,
  addParameter,
  setParameterValue,
  removeParameter,
  addWidgetToDashboard,
  removeDashboardWidget,
  setDashboardLayout,
} = analysisSlice.actions;

export default analysisSlice.reducer;
