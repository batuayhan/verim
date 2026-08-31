import { Box, Chip } from '@mui/material';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useObjectSet } from '../mercek/api';
import type { ObjectSetDef } from '../types/mercek';
import { useWindowStart } from './pencere';

// rolldown maplibre worker fix (HaritaPage ile aynı — çağrı idempotent)
maplibregl.setWorkerUrl(maplibreWorkerUrl);

const SINIF_RENK: Record<string, string> = {
  Dost: '#1e88e5',
  Düşman: '#e53935',
  Şüpheli: '#fb8c00',
  Bilinmeyen: '#757575',
};

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

/**
 * Harita gadget'ı — COP'un kompakt canlı hali. Tıklanınca tam Harita
 * sayfasına aynı filtrelerle gidilir.
 */
export function MiniHarita({
  siniflandirmalar,
  pencereDk = 15,
}: {
  siniflandirmalar?: string[];
  pencereDk?: number;
}) {
  const navigate = useNavigate();
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const windowStart = useWindowStart(pencereDk);

  const def = useMemo<ObjectSetDef | null>(() => {
    if (!windowStart) return null;
    const base: ObjectSetDef = {
      type: 'filter',
      base: { type: 'base', objectType: 'iz' },
      combinator: 'and',
      conditions: [
        {
          id: 'p',
          column: 'tespit_zamani',
          operator: 'gte',
          values: [{ kind: 'literal', value: windowStart }],
        },
        ...(siniflandirmalar?.length
          ? [
              {
                id: 's',
                column: 'siniflandirma',
                operator: 'in' as const,
                values: siniflandirmalar.map((v) => ({ kind: 'literal' as const, value: v })),
              },
            ]
          : []),
      ],
    };
    return base;
  }, [windowStart, siniflandirmalar]);

  const { data } = useObjectSet(def, {}, 3000);

  useEffect(() => {
    if (!mapDiv.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapDiv.current,
      style: MAP_STYLE,
      center: [32.5, 39.0],
      zoom: 4.4,
      attributionControl: { compact: true },
      interactive: false,
    });
    map.on('load', () => {
      map.addSource('izler', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'iz-noktalari',
        type: 'circle',
        source: 'izler',
        paint: {
          'circle-radius': 3,
          'circle-color': [
            'match',
            ['get', 'siniflandirma'],
            'Dost', SINIF_RENK.Dost,
            'Düşman', SINIF_RENK['Düşman'],
            'Şüpheli', SINIF_RENK['Şüpheli'],
            SINIF_RENK.Bilinmeyen,
          ],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      });
      setReady(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !data) return;
    const src = map.getSource('izler') as maplibregl.GeoJSONSource | undefined;
    src?.setData({
      type: 'FeatureCollection',
      features: data.objects
        .filter((o) => o.enlem !== null && o.boylam !== null)
        .map((o) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [Number(o.boylam), Number(o.enlem)],
          },
          properties: { siniflandirma: o.siniflandirma },
        })),
    });
  }, [data, ready]);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (siniflandirmalar?.length) p.set('sinif', siniflandirmalar.join(','));
    if ([5, 15, 60].includes(pencereDk)) p.set('pencere', String(pencereDk));
    const q = p.toString();
    return q ? `/harita?${q}` : '/harita';
  }, [siniflandirmalar, pencereDk]);

  return (
    <Box
      onClick={() => navigate(url)}
      sx={{ position: 'relative', height: '100%', cursor: 'pointer', minHeight: 120 }}
    >
      <div ref={mapDiv} style={{ position: 'absolute', inset: 0 }} />
      <Chip
        size="small"
        label={`${data?.totalCount ?? '…'} iz · son ${pencereDk} dk — tam harita için tıkla`}
        sx={{ position: 'absolute', top: 8, left: 8, bgcolor: 'background.paper', zIndex: 2 }}
      />
    </Box>
  );
}
