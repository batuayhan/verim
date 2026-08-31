import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './store';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/** The current (undoable-present) analysis document. */
export const selectAnalysis = (state: RootState) =>
  state.analysis.present.analysis;

/** The current (undoable-present) Mercek analysis document. */
export const selectMercekAnalysis = (state: RootState) =>
  state.mercek.present.analysis;
