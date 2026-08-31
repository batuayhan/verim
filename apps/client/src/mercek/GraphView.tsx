import { Box, Typography } from '@mui/material';
import { useMemo } from 'react';
import type { MercekAnalysis, MercekCard } from '../types/mercek';
import { inputOf, outputBadge } from './core';

const NODE_W = 210;
const NODE_H = 62;
const COL_GAP = 80;
const ROW_GAP = 28;
const PAD = 40;

interface Node {
  card: MercekCard;
  x: number;
  y: number;
}

/**
 * Graf modu — kart DAG'ının katmanlı görünümü. Canvas yerleşiminden bağımsız;
 * derinlik (zincir uzunluğu) sütunları, oklar veri akışını gösterir.
 * Tıklama kartı seçer; seçim canvas moduyla ortaktır.
 */
export function GraphView({
  analysis,
  selectedId,
  onSelect,
}: {
  analysis: MercekAnalysis;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { nodes, edges, width, height } = useMemo(() => {
    const depthOf = new Map<string, number>();
    const calc = (id: string): number => {
      const memo = depthOf.get(id);
      if (memo !== undefined) return memo;
      depthOf.set(id, 0); // döngü koruması
      const card = analysis.cards.find((c) => c.id === id);
      const parent = card ? inputOf(card) : null;
      const d = parent && analysis.cards.some((c) => c.id === parent) ? calc(parent) + 1 : 0;
      depthOf.set(id, d);
      return d;
    };

    const byDepth = new Map<number, MercekCard[]>();
    for (const card of analysis.cards) {
      const d = calc(card.id);
      const col = byDepth.get(d);
      if (col) col.push(card);
      else byDepth.set(d, [card]);
    }

    const nodes = new Map<string, Node>();
    let maxRows = 0;
    for (const [d, cards] of byDepth) {
      maxRows = Math.max(maxRows, cards.length);
      cards.forEach((card, i) => {
        nodes.set(card.id, {
          card,
          x: PAD + d * (NODE_W + COL_GAP),
          y: PAD + i * (NODE_H + ROW_GAP),
        });
      });
    }

    const edges: Array<{ from: Node; to: Node }> = [];
    for (const card of analysis.cards) {
      const parent = inputOf(card);
      const from = parent ? nodes.get(parent) : undefined;
      const to = nodes.get(card.id);
      if (from && to) edges.push({ from, to });
    }

    const cols = byDepth.size || 1;
    return {
      nodes: [...nodes.values()],
      edges,
      width: PAD * 2 + cols * NODE_W + (cols - 1) * COL_GAP,
      height: PAD * 2 + maxRows * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP,
    };
  }, [analysis.cards]);

  if (nodes.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
        Graf görünümü için önce kart ekleyin.
      </Typography>
    );
  }

  return (
    <Box sx={{ overflow: 'auto', flexGrow: 1, p: 1 }}>
      <svg width={Math.max(width, 400)} height={Math.max(height, 200)}>
        <defs>
          <marker
            id="mercek-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#90a4ae" />
          </marker>
        </defs>

        {edges.map(({ from, to }, i) => {
          const x1 = from.x + NODE_W;
          const y1 = from.y + NODE_H / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_H / 2;
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 4} ${y2}`}
              fill="none"
              stroke="#90a4ae"
              strokeWidth={1.5}
              markerEnd="url(#mercek-arrow)"
            />
          );
        })}

        {nodes.map(({ card, x, y }) => {
          const selected = card.id === selectedId;
          return (
            <g
              key={card.id}
              transform={`translate(${x}, ${y})`}
              onClick={() => onSelect(card.id)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill="#fff"
                stroke={selected ? '#1976d2' : '#cfd8dc'}
                strokeWidth={selected ? 2.5 : 1.5}
              />
              <circle cx={22} cy={NODE_H / 2} r={12} fill="#9c27b0" />
              <text
                x={22}
                y={NODE_H / 2 + 3.5}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill="#fff"
              >
                {card.chip}
              </text>
              <text x={42} y={26} fontSize={12} fontWeight={600} fill="#263238">
                {card.title.length > 24 ? `${card.title.slice(0, 23)}…` : card.title}
              </text>
              <text x={42} y={44} fontSize={10} fill="#78909c">
                {outputBadge(card)}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}
