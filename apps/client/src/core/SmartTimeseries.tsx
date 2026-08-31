import { Box, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_INK, compactNumber, fullNumber, seriesColor } from './vizPalette';

/**
 * Akıllı zaman serisi grafiği — tek yerden 4 bağlam besler (pano gadget'ı,
 * Mercek kartı/widget'ı, asistan paneli). Gerçek veri iki illetle geliyordu:
 *  1) ÖLÇEK UÇURUMU: tarihsel günler ~100, canlı gün milyonlarca → küçük
 *     değerler sıfır gibi görünüp "başlangıç boş" sanılıyordu. Çözüm: uçurum
 *     büyükse otomatik LOG ölçek (elle de değiştirilebilir).
 *  2) YOĞUNLAŞMA: veri belli aralıklara toplanıyor. Çözüm: Recharts Brush ile
 *     KAYDIRILABİLİR/YAKINLAŞTIRILABİLİR pencere; ilk açılışta boş uçlar
 *     kırpılıp dolu aralığa odaklanılır.
 */

export interface TPoint {
  t: string;
  value: number;
}

/** Baştaki ve sondaki sıfır/boş kovaları at (aradaki boşluklar korunur —
    onlar gerçek; yalnız uçlardaki ölü bölge kırpılır) */
function trimEmptyEnds(points: TPoint[]): TPoint[] {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi && (points[lo]?.value ?? 0) === 0) lo++;
  while (hi > lo && (points[hi]?.value ?? 0) === 0) hi--;
  return points.slice(lo, hi + 1);
}

export function SmartTimeseries({
  points,
  height = 200,
  showControls = true,
}: {
  points: TPoint[];
  height?: number;
  /** Küçük tile'larda ölçek/pencere düğmelerini gizle (yalnız grafik + brush) */
  showControls?: boolean;
}) {
  const data = useMemo(() => trimEmptyEnds(points), [points]);

  // Ölçek uçurumu: en büyük / (ortanca ya da 1) — 50x üstü log'a değer
  const logOnerilir = useMemo(() => {
    const vals = data.map((p) => p.value).filter((v) => v > 0);
    if (vals.length < 3) return false;
    const sorted = [...vals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 1;
    const max = sorted[sorted.length - 1];
    return max / median > 50;
  }, [data]);

  const [logManuel, setLogManuel] = useState<boolean | null>(null);
  const log = logManuel ?? logOnerilir;

  const brushGoster = data.length > 15;
  // Brush penceresi KALICI state'te tutulur: canlı modda veri her
  // tazelendiğinde (yeni array) pencere varsayılana DÖNMEZ — kullanıcının
  // yakınlaştırması korunur. İlk açılışta uzun seride son ~%40'a odaklanır.
  // Kullanıcı serinin SONUNU izliyorsa (canlıyı takip) yeni noktalar
  // geldikçe pencere sonu otomatik ilerler.
  const [brush, setBrush] = useState<{ s: number; e: number } | null>(null);
  const uzunlukRef = useRef(data.length);
  useEffect(() => {
    const n = data.length;
    setBrush((prev) => {
      if (!prev) {
        return n > 60 ? { s: Math.floor(n * 0.6), e: n - 1 } : { s: 0, e: Math.max(0, n - 1) };
      }
      const oncekiN = uzunlukRef.current;
      const sonuIzliyordu = prev.e >= oncekiN - 1;
      const s = Math.min(prev.s, n - 1);
      const e = sonuIzliyordu ? n - 1 : Math.min(prev.e, n - 1);
      return { s: Math.max(0, Math.min(s, e)), e };
    });
    uzunlukRef.current = n;
  }, [data.length]);
  const start = brush?.s ?? 0;
  const uc = brush?.e ?? Math.max(0, data.length - 1);

  if (data.length === 0) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: CHART_INK.muted, fontSize: 12 }}>Bu aralıkta veri yok</span>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', height }}>
      {showControls && (logOnerilir || logManuel !== null) && (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={log ? 'log' : 'linear'}
          onChange={(_, v: string | null) => {
            if (v) setLogManuel(v === 'log');
          }}
          sx={{
            position: 'absolute',
            top: -2,
            right: 0,
            zIndex: 2,
            '& .MuiToggleButton-root': { py: 0, px: 0.75, fontSize: 10, textTransform: 'none' },
          }}
        >
          <Tooltip title="Doğrusal ölçek">
            <ToggleButton value="linear">Doğrusal</ToggleButton>
          </Tooltip>
          <Tooltip title="Log ölçek — çok farklı büyüklükleri birlikte gösterir">
            <ToggleButton value="log">Log</ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: showControls ? 16 : 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_INK.gridline} vertical={false} />
          <XAxis
            dataKey="t"
            stroke={CHART_INK.baseline}
            tick={{ fill: CHART_INK.muted, fontSize: 10 }}
            minTickGap={28}
          />
          <YAxis
            stroke={CHART_INK.baseline}
            tick={{ fill: CHART_INK.muted, fontSize: 10 }}
            tickFormatter={(v: number) => compactNumber.format(v)}
            width={46}
            scale={log ? 'log' : 'auto'}
            domain={log ? [1, 'auto'] : [0, 'auto']}
            allowDataOverflow={log}
          />
          <ChartTooltip
            formatter={(v) => fullNumber.format(Number(v))}
            labelStyle={{ fontSize: 11 }}
            contentStyle={{ fontSize: 11 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={seriesColor(0)}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {brushGoster && (
            <Brush
              dataKey="t"
              height={18}
              stroke={seriesColor(0)}
              travellerWidth={8}
              startIndex={start}
              endIndex={uc}
              onChange={(r: { startIndex?: number; endIndex?: number }) => {
                if (r.startIndex !== undefined && r.endIndex !== undefined) {
                  setBrush({ s: r.startIndex, e: r.endIndex });
                }
              }}
              tickFormatter={() => ''}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
