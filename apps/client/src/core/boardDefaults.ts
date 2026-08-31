import { nanoid } from '@reduxjs/toolkit';
import type { BoardConfig, BoardType } from '../types/boards';

export function makeBoard(type: BoardType): BoardConfig {
  const id = nanoid();
  switch (type) {
    case 'filter':
      return { type, id, action: 'keep', combinator: 'and', conditions: [] };
    case 'table':
      return { type, id };
    case 'chart':
      return {
        type,
        id,
        chartType: 'bar',
        xAxis: { column: '', bucketing: { kind: 'exact' } },
        series: [{ id: nanoid(), aggregate: { alias: 'Satır sayısı', fn: 'count' } }],
        format: { showLegend: true, legendPosition: 'right', segmentMode: 'stacked' },
      };
    case 'histogram':
      return {
        type,
        id,
        groupColumn: '',
        aggregate: { alias: 'Satır sayısı', fn: 'count' },
        sort: { by: 'value', direction: 'desc' },
        pivoted: false,
      };
    case 'expression':
      return { type, id, mode: 'filter', expression: '' };
    case 'pivot':
      return { type, id, rows: [], columns: [], aggregates: [], pivoted: false };
    case 'enrich':
      return {
        type,
        id,
        rightDatasetId: '',
        joinType: 'left',
        conditions: [{ leftColumn: '', rightColumn: '' }],
        selectedColumns: [],
      };
    case 'setMath':
      return {
        type,
        id,
        operation: 'keepOnly',
        otherDatasetId: '',
        keyColumns: [{ leftColumn: '', rightColumn: '' }],
      };
    case 'editColumns':
      return { type, id, operations: [] };
  }
}

/** Board henüz sorgu çalıştırılabilir kadar dolduruldu mu? */
export function isBoardConfigured(board: BoardConfig): boolean {
  switch (board.type) {
    case 'filter':
    case 'table':
    case 'editColumns':
      return true;
    case 'chart':
      return Boolean(board.xAxis.column);
    case 'histogram':
      return Boolean(board.groupColumn);
    case 'expression':
      if (board.mode === 'aggregate') {
        return board.aggregates.length > 0 &&
          board.aggregates.every((a) => a.expression.trim().length > 0);
      }
      return board.expression.trim().length > 0;
    case 'pivot':
      return board.rows.length > 0 && board.aggregates.length > 0;
    case 'enrich':
      return (
        Boolean(board.rightDatasetId) &&
        board.conditions.every((c) => c.leftColumn && c.rightColumn) &&
        board.selectedColumns.length > 0
      );
    case 'setMath':
      return (
        Boolean(board.otherDatasetId) &&
        board.keyColumns.every((c) => c.leftColumn && c.rightColumn)
      );
  }
}

/**
 * Bir board'u hedefleyen sorgu zinciri: üstteki konfigüre edilmemiş
 * board'lar zincirden düşer (Harman'da yeni eklenen boş board downstream'i
 * kırmaz), hedef index buna göre kayar. Hedef konfigüre değilse null.
 */
export function buildChain(
  boards: BoardConfig[],
  targetIndex: number,
): { boards: BoardConfig[]; targetBoardIndex: number } | null {
  const target = boards[targetIndex];
  if (!target || !isBoardConfigured(target)) return null;
  const upstream = boards.slice(0, targetIndex).filter(isBoardConfigured);
  return { boards: [...upstream, target], targetBoardIndex: upstream.length };
}
