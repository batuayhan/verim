import { useQuery } from '@tanstack/react-query';
import { useLiveMode } from './live';
import { isBoardConfigured } from '../core/boardDefaults';
import { buildQueryKey } from '../core/queryKey';
import type { BoardConfig } from '../types/boards';
import { fetchDatasets, fetchDatasetSchema, runQuery } from './client';

export function useDatasets() {
  return useQuery({ queryKey: ['datasets'], queryFn: fetchDatasets });
}

export function useDatasetSchema(datasetId: string | undefined) {
  const { refetchInterval } = useLiveMode();
  return useQuery({
    refetchInterval,
    queryKey: ['dataset-schema', datasetId],
    queryFn: () => fetchDatasetSchema(datasetId!),
    enabled: Boolean(datasetId),
  });
}

export interface BoardQueryArgs {
  datasetId: string | undefined;
  datasetVersion: string | undefined;
  /** Full upstream chain including the target board */
  boards: BoardConfig[];
  targetBoardIndex: number;
  parameters: Record<string, string | number | boolean | null>;
  limit?: number;
  enabled?: boolean;
}

/**
 * Executes the board chain targeting one board. The query key mirrors the
 * cache semantics (dataset version + effective upstream configs + referenced
 * parameters), so editing an upstream board automatically invalidates and
 * refetches every downstream board — the cascade behavior.
 */
export function useBoardResult({
  datasetId,
  datasetVersion,
  boards,
  targetBoardIndex,
  parameters,
  limit,
  enabled = true,
}: BoardQueryArgs) {
  const { refetchInterval } = useLiveMode();
  return useQuery({
    refetchInterval,
    queryKey:
      datasetId && datasetVersion
        ? buildQueryKey({
            datasetId,
            datasetVersion,
            boards,
            targetBoardIndex,
            parameters,
            limit,
          })
        : ['query', 'disabled'],
    queryFn: () =>
      runQuery({
        datasetId: datasetId!,
        boards: boards.slice(0, targetBoardIndex + 1),
        targetBoardIndex,
        parameters,
        limit,
      }),
    enabled: enabled && Boolean(datasetId) && Boolean(datasetVersion),
    placeholderData: (prev) => prev, // eski veri görünür kalır, üstüne yenisi gelir
  });
}

/**
 * Bir kolonun upstream zincirden geçen distinct değerleri — filtre
 * formlarında öneri dropdown'ını besler ("kullanıcıya gerçek veriden seçtir").
 * Sanal bir histogram board'u ile en sık 30 değer çekilir.
 */
export function useDistinctValues({
  datasetId,
  datasetVersion,
  upstreamBoards,
  column,
  parameters,
  enabled = true,
}: {
  datasetId: string | undefined;
  datasetVersion: string | undefined;
  upstreamBoards: BoardConfig[];
  column: string | undefined;
  parameters: Record<string, string | number | boolean | null>;
  enabled?: boolean;
}): string[] {
  const configured = upstreamBoards.filter(isBoardConfigured);
  const boards: BoardConfig[] = column
    ? [
        ...configured,
        {
          type: 'histogram',
          id: `__distinct_${column}`,
          groupColumn: column,
          aggregate: { alias: 'n', fn: 'count' },
          sort: { by: 'value', direction: 'desc' },
          pivoted: true,
        },
      ]
    : [];

  const { data } = useBoardResult({
    datasetId,
    datasetVersion,
    boards,
    targetBoardIndex: boards.length - 1,
    parameters,
    limit: 30,
    enabled: enabled && Boolean(column) && Boolean(datasetId),
  });

  if (!data || !column) return [];
  return data.rows.map((r) => String(r[column]));
}
