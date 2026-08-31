import HubIcon from '@mui/icons-material/Hub';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import { Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOntology } from '../mercek/api';
import { seriesColor } from '../core/vizPalette';
import { fetchEdges, fetchNeighbors } from './api';

/**
 * Bağlantı Analizi Grafiği (Palantir link-analysis karşılığı) — ontolojiyi
 * gezilebilir bir düğüm-kenar ağı olarak gösterir. Bir düğüme tıkla:
 * komşuları (tüm giden ilişkiler boyunca) ağa eklenir; ağ kendi kendine
 * yerleşir (force-directed, harici bağımlılık yok). Sürükle → sabitle.
 * "Detay" → ontolojik nesne çekmecesi.
 */

interface GNode {
  id: string; // objectType::pk  (balonlar: balon::<kaynak>::<linkType>)
  objectType: string;
  pk: string;
  label: string;
  icon?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
  expanded: boolean;
  root?: boolean;
  /** Balon: kalabalık komşu grubu tek düğümde toplanır; tıklayınca açılır */
  kind?: 'nesne' | 'balon';
  members?: { pk: string; label: string }[];
  total?: number;
}
interface GEdge {
  source: string;
  target: string;
  label: string;
}

const R = 26; // düğüm yarıçapı
const BALON_R = 32; // balon yarıçapı (kalabalık grup)
/** Bir ilişkide bundan çok komşu varsa tek tek düğüm yerine balon gösterilir */
const GRUP_ESIK = 5;
/** Balon başına taşınan üye tavanı (sunucudan istenen limit) */
const GRUP_LIMIT = 30;
const nid = (t: string, pk: string) => `${t}::${pk}`;

export function BaglantiGrafi({
  focus,
  onDetay,
}: {
  focus: { objectType: string; pk: string } | null;
  onDetay: (objectType: string, pk: string) => void;
}) {
  const { data: ontology } = useOntology();
  const boxRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<Map<string, GNode>>(new Map());
  const edgesRef = useRef<GEdge[]>([]);
  // Balon kenarları sunucudan gelmez (balon sanal düğümdür) — ayrı tutulur
  const balonEdgesRef = useRef<GEdge[]>([]);
  // Açılmış balonlar: kaynak tekrar genişletilirse balon yeniden doğmasın
  const acilanBalonlar = useRef<Set<string>>(new Set());
  const [, setTick] = useState(0);
  const [secili, setSecili] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [etiketGoster, setEtiketGoster] = useState(true);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const alive = useRef(true);

  // Tip → sabit renk (ontoloji sırasına göre)
  const renkOf = useCallback(
    (objectType: string) => {
      const i = (ontology?.objectTypes ?? []).findIndex((t) => t.apiName === objectType);
      return seriesColor(i < 0 ? 0 : i);
    },
    [ontology],
  );

  const boyut = () => {
    const el = boxRef.current;
    return { w: el?.clientWidth ?? 800, h: el?.clientHeight ?? 600 };
  };

  // Görünen tüm düğümler arası kenarları sunucudan tazele (OTOMATİK BAĞLAMA):
  // yeni gelen düğüm ekrandaki başka düğümle bağlıysa çizgi kendiliğinden çıkar
  const kenarlariTazele = useCallback(async () => {
    const nodes = [...nodesRef.current.values()];
    if (nodes.length < 2) {
      edgesRef.current = [];
      setTick((t) => t + 1);
      return;
    }
    const kenarlar = await fetchEdges(nodes.map((n) => ({ objectType: n.objectType, pk: n.pk })));
    if (!alive.current) return;
    // Yalnız iki ucu da ekranda olan kenarlar
    edgesRef.current = kenarlar.filter(
      (e) => nodesRef.current.has(e.source) && nodesRef.current.has(e.target),
    );
    setTick((t) => t + 1);
  }, []);

  const ekle = useCallback(
    async (objectType: string, pk: string, root = false) => {
      const id = nid(objectType, pk);
      const { w, h } = boyut();
      setYukleniyor(true);
      try {
        const res = await fetchNeighbors(objectType, pk, GRUP_LIMIT);
        if (!alive.current) return;
        const nodes = nodesRef.current;
        if (!nodes.has(id)) {
          nodes.set(id, {
            id, objectType, pk,
            label: res.focus?.label ?? pk,
            icon: res.focus?.icon,
            x: w / 2 + (Math.random() - 0.5) * 60,
            y: h / 2 + (Math.random() - 0.5) * 60,
            vx: 0, vy: 0, pinned: false, expanded: true, root,
          });
        } else {
          nodes.get(id)!.expanded = true;
          if (res.focus?.label) nodes.get(id)!.label = res.focus.label;
        }
        const kaynak = nodes.get(id)!;
        for (const grup of res.groups) {
          const balonId = `balon::${id}::${grup.linkType}`;
          // KALABALIK grup → tek tek düğüm yerine balon (Palantir aggregation);
          // balon daha önce açıldıysa üyeler zaten/yeniden tek tek eklenir
          if (grup.total > GRUP_ESIK && !acilanBalonlar.current.has(balonId)) {
            if (!nodes.has(balonId)) {
              nodes.set(balonId, {
                id: balonId, objectType: grup.toObjectType, pk: '',
                label: `${grup.total} ${grup.toDisplayName}`, icon: grup.icon,
                x: kaynak.x + (Math.random() - 0.5) * 160,
                y: kaynak.y + (Math.random() - 0.5) * 160,
                vx: 0, vy: 0, pinned: false, expanded: false,
                kind: 'balon', members: grup.nodes, total: grup.total,
              });
              balonEdgesRef.current.push({ source: id, target: balonId, label: grup.linkLabel });
            }
            continue;
          }
          for (const komsu of grup.nodes) {
            const cid = nid(grup.toObjectType, komsu.pk);
            if (!nodes.has(cid)) {
              nodes.set(cid, {
                id: cid, objectType: grup.toObjectType, pk: komsu.pk,
                label: komsu.label, icon: grup.icon,
                x: kaynak.x + (Math.random() - 0.5) * 120,
                y: kaynak.y + (Math.random() - 0.5) * 120,
                vx: 0, vy: 0, pinned: false, expanded: false,
              });
            }
          }
        }
        setTick((t) => t + 1);
        // Kenarları otomatik hesapla (tek tek tıklamaya gerek yok)
        await kenarlariTazele();
      } finally {
        if (alive.current) setYukleniyor(false);
      }
    },
    [kenarlariTazele],
  );

  /** Balonu aç: sanal düğüm kaldırılır, üyeleri tek tek düğüm olur */
  const balonAc = useCallback(
    (b: GNode) => {
      acilanBalonlar.current.add(b.id);
      nodesRef.current.delete(b.id);
      balonEdgesRef.current = balonEdgesRef.current.filter((e) => e.target !== b.id);
      for (const m of b.members ?? []) {
        const cid = nid(b.objectType, m.pk);
        if (!nodesRef.current.has(cid)) {
          nodesRef.current.set(cid, {
            id: cid, objectType: b.objectType, pk: m.pk,
            label: m.label, icon: b.icon,
            x: b.x + (Math.random() - 0.5) * 140,
            y: b.y + (Math.random() - 0.5) * 140,
            vx: 0, vy: 0, pinned: false, expanded: false,
          });
        }
      }
      setSecili(null);
      setTick((t) => t + 1);
      void kenarlariTazele();
    },
    [kenarlariTazele],
  );

  // İlk odak
  useEffect(() => {
    alive.current = true;
    nodesRef.current.clear();
    edgesRef.current = [];
    balonEdgesRef.current = [];
    acilanBalonlar.current.clear();
    setSecili(null);
    if (focus) {
      void ekle(focus.objectType, focus.pk, true).then(() =>
        setSecili(nid(focus.objectType, focus.pk)),
      );
    }
    return () => {
      alive.current = false;
    };
  }, [focus, ekle]);

  // Force simülasyonu
  useEffect(() => {
    const iv = setInterval(() => {
      const nodes = [...nodesRef.current.values()];
      if (nodes.length === 0) return;
      const { w, h } = boyut();
      // itme (repulsion)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { d2 = 1; dx = Math.random(); dy = Math.random(); }
          const f = 7000 / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
      // yay (spring) — kenarlar (+balon kenarları)
      for (const e of [...edgesRef.current, ...balonEdgesRef.current]) {
        const a = nodesRef.current.get(e.source), b = nodesRef.current.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - 120) * 0.015;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
      // merkez çekimi + entegrasyon
      let hareket = 0;
      for (const n of nodes) {
        if (n.pinned || drag.current?.id === n.id) { n.vx = 0; n.vy = 0; continue; }
        n.vx += (w / 2 - n.x) * 0.003;
        n.vy += (h / 2 - n.y) * 0.003;
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(R, Math.min(w - R, n.x));
        n.y = Math.max(R, Math.min(h - R, n.y));
        hareket += Math.abs(n.vx) + Math.abs(n.vy);
      }
      if (hareket > 0.5) setTick((t) => t + 1);
    }, 30);
    return () => clearInterval(iv);
  }, []);

  // Sürükleme
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current || !boxRef.current) return;
      const r = boxRef.current.getBoundingClientRect();
      const n = nodesRef.current.get(drag.current.id);
      if (n) {
        n.x = e.clientX - r.left - drag.current.dx;
        n.y = e.clientY - r.top - drag.current.dy;
        n.pinned = true;
        setTick((t) => t + 1);
      }
    };
    const up = () => { drag.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  const nodes = [...nodesRef.current.values()];
  const edges = [...edgesRef.current, ...balonEdgesRef.current];
  const seciliNode = secili ? nodesRef.current.get(secili) : null;
  const { w, h } = boyut();

  const kullanilanTipler = useMemo(
    () => [...new Set(nodes.map((n) => n.objectType))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes.length],
  );

  return (
    <Box ref={boxRef} sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', bgcolor: 'background.default' }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0 }}>
        {edges.map((e, i) => {
          const a = nodesRef.current.get(e.source), b = nodesRef.current.get(e.target);
          if (!a || !b) return null;
          // Seçili düğümün kenarları vurgulanır; diğerleri soluklaşır (odak)
          const iliskili = secili && (e.source === secili || e.target === secili);
          const vurgu = !secili || iliskili;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          return (
            <g key={i}>
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={iliskili ? '#7b1fa2' : '#c3c2b7'}
                strokeWidth={iliskili ? 2.5 : 1.5}
                opacity={vurgu ? 0.9 : 0.15}
              />
              {iliskili && (
                <text x={mx} y={my - 3} textAnchor="middle" fontSize="9.5" fill="#7b1fa2"
                  style={{ pointerEvents: 'none' }}>
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map((n) => {
          const secildi = n.id === secili;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              style={{ cursor: 'pointer' }}
              onPointerDown={(ev) => {
                const r = boxRef.current!.getBoundingClientRect();
                drag.current = { id: n.id, dx: ev.clientX - r.left - n.x, dy: ev.clientY - r.top - n.y };
              }}
              onClick={() => {
                if (n.kind === 'balon') { balonAc(n); return; }
                setSecili(n.id);
                if (!n.expanded) void ekle(n.objectType, n.pk);
              }}
            >
              {n.kind === 'balon' ? (
                <>
                  {/* Balon: kalabalık grup tek düğümde — tıkla → üyeler açılır */}
                  <circle r={BALON_R} fill={renkOf(n.objectType)} opacity={0.25} />
                  <circle
                    r={BALON_R}
                    fill="none"
                    stroke={renkOf(n.objectType)}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                  <text textAnchor="middle" dy="-0.15em" fontSize="15">{n.icon ?? '•'}</text>
                  <text textAnchor="middle" dy="1.05em" fontSize="12" fontWeight={700}
                    fill="#333">
                    {n.total}
                  </text>
                  <text textAnchor="middle" y={BALON_R + 13} fontSize="10.5" fill="#333"
                    style={{ pointerEvents: 'none' }}>
                    {n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label}
                  </text>
                </>
              ) : (
                <>
                  <circle
                    r={R}
                    fill={renkOf(n.objectType)}
                    stroke={secildi ? '#111' : '#fff'}
                    strokeWidth={secildi ? 3 : 2}
                    opacity={0.92}
                  />
                  <text textAnchor="middle" dy="0.35em" fontSize="18">{n.icon ?? '•'}</text>
                  {(etiketGoster || secildi) && (
                    <text textAnchor="middle" y={R + 13} fontSize="10.5" fill="#333"
                      opacity={!secili || secildi || n.id === secili ? 1 : 0.4}
                      style={{ pointerEvents: 'none' }}>
                      {n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label}
                    </text>
                  )}
                  {!n.expanded && (
                    <circle r={5} cx={R - 4} cy={-R + 4} fill="#fff" stroke={renkOf(n.objectType)} strokeWidth={1.5} />
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* Seçili düğüm kartı */}
      {seciliNode && (
        <Paper elevation={3} sx={{ position: 'absolute', top: 12, left: 12, p: 1.5, maxWidth: 280, zIndex: 5 }}>
          <Typography variant="subtitle2" noWrap>
            {seciliNode.icon} {seciliNode.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {ontology?.objectTypes.find((t) => t.apiName === seciliNode.objectType)?.displayName} ·{' '}
            {seciliNode.pk}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {!seciliNode.expanded && (
              <Button
                size="small"
                startIcon={<OpenInFullIcon sx={{ fontSize: 14 }} />}
                onClick={() => void ekle(seciliNode.objectType, seciliNode.pk)}
                sx={{ textTransform: 'none' }}
              >
                Genişlet
              </Button>
            )}
            <Button
              size="small"
              variant="outlined"
              startIcon={<HubIcon sx={{ fontSize: 14 }} />}
              onClick={() => onDetay(seciliNode.objectType, seciliNode.pk)}
              sx={{ textTransform: 'none' }}
            >
              Detay
            </Button>
          </Stack>
        </Paper>
      )}

      {/* Lejant */}
      {kullanilanTipler.length > 0 && (
        <Paper variant="outlined" sx={{ position: 'absolute', bottom: 12, left: 12, p: 1, zIndex: 5, bgcolor: 'background.paper' }}>
          <Stack spacing={0.25}>
            {kullanilanTipler.map((t) => (
              <Stack key={t} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: renkOf(t) }} />
                <Typography variant="caption">
                  {ontology?.objectTypes.find((o) => o.apiName === t)?.displayName ?? t}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}

      <Chip
        size="small"
        label={etiketGoster ? 'Etiketler açık' : 'Etiketler kapalı'}
        onClick={() => setEtiketGoster((v) => !v)}
        variant={etiketGoster ? 'filled' : 'outlined'}
        sx={{ position: 'absolute', top: 12, right: 48, zIndex: 6, cursor: 'pointer' }}
      />
      {yukleniyor && (
        <CircularProgress size={22} sx={{ position: 'absolute', top: 14, right: 14, zIndex: 6 }} />
      )}
      {nodes.length === 0 && !yukleniyor && (
        <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Chip label="Başlamak için bir nesne seç" />
        </Stack>
      )}
    </Box>
  );
}
