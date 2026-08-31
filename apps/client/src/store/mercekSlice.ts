/**
 * Mercek analiz dokümanı slice'ı — kart DAG'ı + canvas yerleşimi.
 * store.ts'te redux-undo ile sarılır (Harman slice'ı gibi).
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  MercekAnalysis,
  MercekCard,
  MercekLayoutItem,
  MercekParameter,
} from '../types/mercek';
import { withDescendants } from '../mercek/core';

export interface MercekState {
  analysis: MercekAnalysis | null;
}

const initialState: MercekState = { analysis: null };

const mercekSlice = createSlice({
  name: 'mercek',
  initialState,
  reducers: {
    setMercekAnalysis(state, action: PayloadAction<MercekAnalysis>) {
      state.analysis = action.payload;
    },

    renameMercekAnalysis(state, action: PayloadAction<string>) {
      if (state.analysis) state.analysis.name = action.payload;
    },

    addMercekCard(
      state,
      action: PayloadAction<{ card: MercekCard; layout: MercekLayoutItem }>,
    ) {
      if (!state.analysis) return;
      state.analysis.cards.push(action.payload.card);
      state.analysis.layout[action.payload.card.id] = action.payload.layout;
    },

    updateMercekCard(state, action: PayloadAction<MercekCard>) {
      if (!state.analysis) return;
      const i = state.analysis.cards.findIndex((c) => c.id === action.payload.id);
      if (i !== -1) state.analysis.cards[i] = action.payload;
    },

    /** Kartı ve ondan türeyen tüm kartları kaldırır (DAG bütünlüğü). */
    removeMercekCard(state, action: PayloadAction<{ cardId: string }>) {
      if (!state.analysis) return;
      const doomed = new Set(withDescendants(state.analysis, action.payload.cardId));
      state.analysis.cards = state.analysis.cards.filter((c) => !doomed.has(c.id));
      for (const id of doomed) delete state.analysis.layout[id];
    },

    setMercekLayout(
      state,
      action: PayloadAction<Record<string, MercekLayoutItem>>,
    ) {
      if (!state.analysis) return;
      state.analysis.layout = { ...state.analysis.layout, ...action.payload };
    },

    // --- Parametreler ---

    addMercekParameter(state, action: PayloadAction<MercekParameter>) {
      if (!state.analysis) return;
      state.analysis.parameters = [
        ...(state.analysis.parameters ?? []),
        action.payload,
      ];
    },

    setMercekParameterValue(
      state,
      action: PayloadAction<{ name: string; value: MercekParameter['value'] }>,
    ) {
      const param = state.analysis?.parameters?.find(
        (p) => p.name === action.payload.name,
      );
      if (param) param.value = action.payload.value;
    },

    removeMercekParameter(state, action: PayloadAction<{ name: string }>) {
      if (!state.analysis?.parameters) return;
      state.analysis.parameters = state.analysis.parameters.filter(
        (p) => p.name !== action.payload.name,
      );
    },

    // --- Dashboard ---

    addMercekWidget(
      state,
      action: PayloadAction<{ widget: { id: string; cardId: string; title?: string } }>,
    ) {
      if (!state.analysis) return;
      if (!state.analysis.dashboard) {
        state.analysis.dashboard = { title: state.analysis.name, widgets: [] };
      }
      state.analysis.dashboard.widgets.push(action.payload.widget);
    },

    removeMercekWidget(state, action: PayloadAction<{ widgetId: string }>) {
      if (!state.analysis?.dashboard) return;
      state.analysis.dashboard.widgets = state.analysis.dashboard.widgets.filter(
        (w) => w.id !== action.payload.widgetId,
      );
    },

    setMercekDashboardLayout(
      state,
      action: PayloadAction<Record<string, MercekLayoutItem>>,
    ) {
      if (!state.analysis?.dashboard) return;
      state.analysis.dashboard.layout = {
        ...state.analysis.dashboard.layout,
        ...action.payload,
      };
    },
  },
});

export const {
  setMercekAnalysis,
  renameMercekAnalysis,
  addMercekCard,
  updateMercekCard,
  removeMercekCard,
  setMercekLayout,
  addMercekParameter,
  setMercekParameterValue,
  removeMercekParameter,
  addMercekWidget,
  removeMercekWidget,
  setMercekDashboardLayout,
} = mercekSlice.actions;

export default mercekSlice.reducer;
