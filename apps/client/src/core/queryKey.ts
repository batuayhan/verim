/**
 * Cache key construction — mirrors Harman's cache semantics:
 * identical query on identical data ⇒ identical key ⇒ cache hit.
 *
 * Key = (datasetVersion, boards up to target minus display-only boards,
 * only the parameters the chain actually references).
 * Excluding unused parameters means tweaking $foo doesn't invalidate a
 * path that never mentions it.
 */

import type { BoardConfig, FilterValue } from '../types/boards';

function collectParameterNames(boards: BoardConfig[]): Set<string> {
  const names = new Set<string>();
  const visitValue = (v: FilterValue) => {
    if (v.kind === 'parameter') names.add(v.name);
  };
  for (const board of boards) {
    if (board.type === 'filter') {
      board.conditions.forEach((c) => c.values.forEach(visitValue));
    } else if (board.type === 'expression') {
      // Expressions reference parameters as `$name` in source text
      const sources: string[] = [];
      if (board.mode === 'aggregate') {
        sources.push(
          ...board.groupBys.map((g) => g.expression),
          ...board.aggregates.map((a) => a.expression),
        );
      } else {
        sources.push(board.expression);
      }
      for (const src of sources) {
        for (const match of src.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)) {
          names.add(match[1]);
        }
      }
    }
  }
  return names;
}

/** Boards that affect the computed result (display-only ones dropped). */
function effectiveBoards(boards: BoardConfig[], targetIndex: number): BoardConfig[] {
  return boards.slice(0, targetIndex + 1).filter((b, i) => {
    if (i === targetIndex) return true;
    if (b.type === 'chart' || b.type === 'table') return false;
    if (b.type === 'histogram' && !b.pivoted && !b.selection?.length) return false;
    if (b.type === 'pivot' && !b.pivoted) return false;
    return true;
  });
}

export function buildQueryKey(args: {
  datasetId: string;
  datasetVersion: string;
  boards: BoardConfig[];
  targetBoardIndex: number;
  parameters: Record<string, string | number | boolean | null>;
  limit?: number;
}): unknown[] {
  const boards = effectiveBoards(args.boards, args.targetBoardIndex);
  const referenced = collectParameterNames(boards);
  const relevantParams = Object.fromEntries(
    Object.entries(args.parameters)
      .filter(([name]) => referenced.has(name))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return [
    'query',
    args.datasetId,
    args.datasetVersion,
    boards,
    relevantParams,
    args.limit ?? null,
  ];
}
