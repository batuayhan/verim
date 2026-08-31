import { configureStore } from '@reduxjs/toolkit';
import undoable from 'redux-undo';
import analysisReducer from './analysisSlice';
import mercekReducer from './mercekSlice';

export const store = configureStore({
  reducer: {
    // Every document mutation is undoable; UI-only state will live in a
    // separate non-undoable slice so panel toggles don't pollute history.
    analysis: undoable(analysisReducer, { limit: 100 }),
    mercek: undoable(mercekReducer, { limit: 100 }),
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
