import {
  Box,
  Button,
  Card,
  CardActionArea,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fetchAnalyses, fetchAnalysis } from '../api/client';
import { fetchMercekAnalyses, fetchMercekAnalysis, useOntology } from '../mercek/api';
import type { ObjectSetDef } from '../types/mercek';
import type { Gadget, GadgetMetric, GadgetTip } from './api';

/**
 * "Gadget ekle" — Jira'nın gadget kataloğu karşılığı. İki adım: tip seç →
 * yapılandır. Formlar acemi-dostu: her alan ontolojiden/analiz listesinden
 * beslenen SELECT'tir; geçersiz kombinasyon kurulamaz (metrik property'si
 * fonksiyona göre daralır, tarih kolonu yalnız temporal kolonlardan seçilir).
 */

const KATALOG: Array<{ tip: GadgetTip; ad: string; aciklama: string; emoji: string }> = [
  { tip: 'stat', ad: 'Sayı kartı', aciklama: 'Tek büyük canlı sayı (örn. düşman iz sayısı)', emoji: '🔢' },
  { tip: 'grafik', ad: 'Grafik', aciklama: 'Bar/pie — grupla ve say/topla, segment destekli', emoji: '📊' },
  { tip: 'zaman', ad: 'Zaman serisi', aciklama: 'Saatlik/günlük/haftalık/aylık trend', emoji: '📈' },
  { tip: 'tablo', ad: 'Tablo', aciklama: 'Nesne kümesinin canlı tablosu', emoji: '🗂️' },
  { tip: 'liste', ad: 'Sıralı liste', aciklama: 'En çok / leaderboard — grupla, say, sırala', emoji: '🏆' },
  { tip: 'pivot', ad: 'Özet tablo', aciklama: 'Satır × sütun matris (iki boyut)', emoji: '▦' },
  { tip: 'dagilim', ad: 'Dağılım', aciklama: 'Scatter — iki sayısal kolonu noktalarla', emoji: '⚬' },
  { tip: 'harita', ad: 'Canlı harita', aciklama: 'COP mini görünümü — son N dk izler', emoji: '🗺️' },
  { tip: 'alarmlar', ad: 'Alarmlar', aciklama: 'Son alarm olayları listesi', emoji: '🚨' },
  { tip: 'analizler', ad: 'Analizler', aciklama: 'Son Harman + Mercek analizleri', emoji: '📁' },
  { tip: 'senkronizasyon', ad: 'Senkronizasyon matrisi', aciklama: 'Angajman planı — dost varlık × zaman penceresi', emoji: '🎯' },
  { tip: 'asistan', ad: 'Asistan kutusu', aciklama: 'Doğal dil komut kutusu', emoji: '✨' },
  { tip: 'harman_board', ad: 'Harman board', aciklama: 'Mevcut bir Harman analizinden canlı board', emoji: '🧮' },
  { tip: 'mercek_kart', ad: 'Mercek kartı', aciklama: 'Mevcut bir Mercek analizinden canlı kart', emoji: '🔍' },
];

const METRIC_FNS: Array<{ v: GadgetMetric['fn']; l: string }> = [
  { v: 'count', l: 'Say (count)' },
  { v: 'countDistinct', l: 'Benzersiz say' },
  { v: 'sum', l: 'Topla' },
  { v: 'avg', l: 'Ortalama' },
  { v: 'min', l: 'En küçük' },
  { v: 'max', l: 'En büyük' },
];

const PENCERELER = [
  { v: 0, l: 'Pencere yok (tüm veri)' },
  { v: 15, l: 'Son 15 dakika' },
  { v: 60, l: 'Son 1 saat' },
  { v: 1440, l: 'Son 24 saat' },
];

const SINIFLAR = ['Dost', 'Düşman', 'Şüpheli', 'Bilinmeyen'];

let gadgetSeq = 0;
function nextGadgetId(): string {
  gadgetSeq += 1;
  return `g-${Date.now().toString(36)}-${gadgetSeq}`;
}

export function GadgetEkleDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (gadget: Omit<Gadget, 'yerlesim'>) => void;
}) {
  const [tip, setTip] = useState<GadgetTip | null>(null);

  const close = () => {
    setTip(null);
    onClose();
  };
  const add = (g: Omit<Gadget, 'yerlesim' | 'id'>) => {
    onAdd({ ...g, id: nextGadgetId() } as Omit<Gadget, 'yerlesim'>);
    close();
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>{tip ? `Gadget yapılandır — ${KATALOG.find((k) => k.tip === tip)?.ad}` : 'Gadget ekle'}</DialogTitle>
      <DialogContent dividers>
        {!tip ? (
          <Stack spacing={1}>
            {KATALOG.map((k) => (
              <Card key={k.tip} variant="outlined">
                <CardActionArea onClick={() => setTip(k.tip)} sx={{ p: 1.25 }}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Typography sx={{ fontSize: 22 }}>{k.emoji}</Typography>
                    <Box>
                      <Typography variant="subtitle2">{k.ad}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {k.aciklama}
                      </Typography>
                    </Box>
                  </Stack>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
        ) : (
          <GadgetForm tip={tip} onSubmit={add} onBack={() => setTip(null)} />
        )}
      </DialogContent>
      {!tip && (
        <DialogActions>
          <Button onClick={close}>Vazgeç</Button>
        </DialogActions>
      )}
    </Dialog>
  );
}

function GadgetForm({
  tip,
  onSubmit,
  onBack,
}: {
  tip: GadgetTip;
  onSubmit: (g: Omit<Gadget, 'yerlesim' | 'id'>) => void;
  onBack: () => void;
}) {
  const { data: ontology } = useOntology();
  const [baslik, setBaslik] = useState('');

  // Sorgu gadget'ları için ortak durum
  const [objectType, setObjectType] = useState('iz');
  const [filtreKolon, setFiltreKolon] = useState('');
  const [filtreDeger, setFiltreDeger] = useState('');
  const [metricFn, setMetricFn] = useState<GadgetMetric['fn']>('count');
  const [metricProp, setMetricProp] = useState('');
  const [groupBy, setGroupBy] = useState('');
  const [segmentBy, setSegmentBy] = useState('');
  const [grafikTuru, setGrafikTuru] = useState<'bar' | 'pie'>('bar');
  const [dateProperty, setDateProperty] = useState('');
  const [xCol, setXCol] = useState('');
  const [yCol, setYCol] = useState('');
  const [granularity, setGranularity] = useState<'hour' | 'day' | 'week' | 'month'>('hour');
  const [pencereDk, setPencereDk] = useState(0);
  const [renk, setRenk] = useState<'primary' | 'error' | 'warning' | 'success' | 'secondary'>('primary');
  const [siniflar, setSiniflar] = useState<string[]>([]);
  const [limit, setLimit] = useState(6);

  // harman_board / mercek_kart seçimi
  const [analysisId, setAnalysisId] = useState('');
  const [pathId, setPathId] = useState('');
  const [boardId, setBoardId] = useState('');
  const [cardId, setCardId] = useState('');
  const { data: harmanList } = useQuery({
    queryKey: ['analyses'],
    queryFn: fetchAnalyses,
    enabled: tip === 'harman_board',
  });
  const { data: mercekList } = useQuery({
    queryKey: ['mercek-analyses'],
    queryFn: fetchMercekAnalyses,
    enabled: tip === 'mercek_kart',
  });
  const { data: harmanDoc } = useQuery({
    queryKey: ['analysis', analysisId],
    queryFn: () => fetchAnalysis(analysisId),
    enabled: tip === 'harman_board' && Boolean(analysisId),
  });
  const { data: mercekDoc } = useQuery({
    queryKey: ['mercek-analysis', analysisId],
    queryFn: () => fetchMercekAnalysis(analysisId),
    enabled: tip === 'mercek_kart' && Boolean(analysisId),
  });

  const objType = ontology?.objectTypes.find((t) => t.apiName === objectType);
  const props = objType?.properties ?? [];
  const numericProps = props.filter((p) => p.type === 'integer' || p.type === 'double');
  const temporalProps = props.filter((p) => p.type === 'date' || p.type === 'timestamp');
  const metricPropOptions = metricFn === 'countDistinct' ? props : numericProps;
  const pencereKolon = temporalProps[0]?.apiName;

  const def = useMemo<ObjectSetDef>(() => {
    const base: ObjectSetDef = { type: 'base', objectType };
    if (!filtreKolon || !filtreDeger) return base;
    return {
      type: 'filter',
      base,
      combinator: 'and',
      conditions: [
        {
          id: 'f1',
          column: filtreKolon,
          operator: 'eq',
          values: [{ kind: 'literal', value: filtreDeger }],
        },
      ],
    };
  }, [objectType, filtreKolon, filtreDeger]);

  const metric: GadgetMetric = { fn: metricFn, ...(metricProp ? { property: metricProp } : {}) };
  const pencere = pencereDk > 0 && pencereKolon ? { pencereDk, pencereKolon } : {};
  const b = baslik.trim() ? { baslik: baslik.trim() } : {};

  const gecerli = (() => {
    switch (tip) {
      case 'grafik':
      case 'liste':
        return Boolean(groupBy) && (metricFn === 'count' || Boolean(metricProp) || metricFn === 'countDistinct');
      case 'pivot':
        return Boolean(groupBy) && Boolean(segmentBy);
      case 'dagilim':
        return Boolean(xCol) && Boolean(yCol);
      case 'zaman':
        return Boolean(dateProperty);
      case 'harman_board':
        return Boolean(analysisId && pathId && boardId);
      case 'mercek_kart':
        return Boolean(analysisId && cardId);
      default:
        return true;
    }
  })();

  const submit = () => {
    switch (tip) {
      case 'stat':
        return onSubmit({ tip, def, metric, renk, ...pencere, ...b } as never);
      case 'grafik':
        return onSubmit({
          tip,
          def,
          groupBy,
          ...(segmentBy ? { segmentBy } : {}),
          metric,
          grafikTuru,
          ...pencere,
          ...b,
        } as never);
      case 'zaman':
        return onSubmit({ tip, def, dateProperty, granularity, metric, ...pencere, ...b } as never);
      case 'tablo':
        return onSubmit({ tip, def, limit: 20, ...pencere, ...b } as never);
      case 'liste':
        return onSubmit({ tip, def, groupBy, metric, limit: 10, ...pencere, ...b } as never);
      case 'pivot':
        return onSubmit({ tip, def, groupBy, segmentBy, metric, ...pencere, ...b } as never);
      case 'dagilim':
        return onSubmit({ tip, def, xColumn: xCol, yColumn: yCol, limit: 500, ...pencere, ...b } as never);
      case 'harita':
        return onSubmit({
          tip,
          ...(siniflar.length ? { siniflandirmalar: siniflar } : {}),
          pencereDk: pencereDk || 15,
          ...b,
        } as never);
      case 'alarmlar':
      case 'analizler':
        return onSubmit({ tip, limit, ...b } as never);
      case 'senkronizasyon':
        return onSubmit({ tip, limit: 24, ...b } as never);
      case 'asistan':
        return onSubmit({ tip, ...b } as never);
      case 'harman_board':
        return onSubmit({ tip, analysisId, pathId, boardId, ...b } as never);
      case 'mercek_kart':
        return onSubmit({ tip, analysisId, cardId, ...b } as never);
    }
  };

  const sorguGadget =
    tip === 'stat' || tip === 'grafik' || tip === 'zaman' || tip === 'tablo' ||
    tip === 'liste' || tip === 'pivot' || tip === 'dagilim';
  const secilenPath = harmanDoc?.paths.find((p) => p.id === pathId);

  return (
    <Stack spacing={2} sx={{ pt: 0.5 }}>
      <TextField
        size="small"
        label="Başlık (isteğe bağlı)"
        value={baslik}
        onChange={(e) => setBaslik(e.target.value)}
      />

      {sorguGadget && (
        <>
          <FormControl size="small">
            <InputLabel>Nesne tipi</InputLabel>
            <Select
              label="Nesne tipi"
              value={objectType}
              onChange={(e) => {
                setObjectType(e.target.value);
                setFiltreKolon('');
                setGroupBy('');
                setSegmentBy('');
                setDateProperty('');
                setMetricProp('');
              }}
            >
              {(ontology?.objectTypes ?? []).map((t) => (
                <MenuItem key={t.apiName} value={t.apiName}>
                  {t.icon} {t.displayName} ({t.apiName})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Stack direction="row" spacing={1}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Filtre kolonu (isteğe bağlı)</InputLabel>
              <Select
                label="Filtre kolonu (isteğe bağlı)"
                value={filtreKolon}
                onChange={(e) => setFiltreKolon(e.target.value)}
              >
                <MenuItem value="">(filtre yok)</MenuItem>
                {props.map((p) => (
                  <MenuItem key={p.apiName} value={p.apiName}>
                    {p.displayName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {filtreKolon && (
              <TextField
                size="small"
                sx={{ flex: 1 }}
                label="= değer"
                value={filtreDeger}
                onChange={(e) => setFiltreDeger(e.target.value)}
                helperText={filtreKolon === 'siniflandirma' ? 'Dost / Düşman / Şüpheli / Bilinmeyen' : undefined}
              />
            )}
          </Stack>

          {tip !== 'tablo' && tip !== 'dagilim' && (
            <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Metrik</InputLabel>
                <Select
                  label="Metrik"
                  value={metricFn}
                  onChange={(e) => {
                    setMetricFn(e.target.value as GadgetMetric['fn']);
                    setMetricProp('');
                  }}
                >
                  {METRIC_FNS.map((m) => (
                    <MenuItem key={m.v} value={m.v}>
                      {m.l}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {metricFn !== 'count' && (
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel>Kolon</InputLabel>
                  <Select label="Kolon" value={metricProp} onChange={(e) => setMetricProp(e.target.value)}>
                    {metricPropOptions.map((p) => (
                      <MenuItem key={p.apiName} value={p.apiName}>
                        {p.displayName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Stack>
          )}

          {tip === 'grafik' && (
            <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Grupla (X ekseni)</InputLabel>
                <Select label="Grupla (X ekseni)" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                  {props.map((p) => (
                    <MenuItem key={p.apiName} value={p.apiName}>
                      {p.displayName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Segment (isteğe bağlı)</InputLabel>
                <Select
                  label="Segment (isteğe bağlı)"
                  value={segmentBy}
                  onChange={(e) => setSegmentBy(e.target.value)}
                >
                  <MenuItem value="">(yok)</MenuItem>
                  {props
                    .filter((p) => p.apiName !== groupBy)
                    .map((p) => (
                      <MenuItem key={p.apiName} value={p.apiName}>
                        {p.displayName}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ width: 110 }}>
                <InputLabel>Tür</InputLabel>
                <Select label="Tür" value={grafikTuru} onChange={(e) => setGrafikTuru(e.target.value as 'bar' | 'pie')}>
                  <MenuItem value="bar">Bar</MenuItem>
                  <MenuItem value="pie">Pasta</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          )}

          {(tip === 'liste' || tip === 'pivot') && (
            <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>{tip === 'pivot' ? 'Satır (grupla)' : 'Grupla'}</InputLabel>
                <Select
                  label={tip === 'pivot' ? 'Satır (grupla)' : 'Grupla'}
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                >
                  {props.map((p) => (
                    <MenuItem key={p.apiName} value={p.apiName}>
                      {p.displayName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {tip === 'pivot' && (
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel>Sütun (segment)</InputLabel>
                  <Select label="Sütun (segment)" value={segmentBy} onChange={(e) => setSegmentBy(e.target.value)}>
                    {props
                      .filter((p) => p.apiName !== groupBy)
                      .map((p) => (
                        <MenuItem key={p.apiName} value={p.apiName}>
                          {p.displayName}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              )}
            </Stack>
          )}

          {tip === 'dagilim' && (
            <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>X ekseni (sayısal)</InputLabel>
                <Select label="X ekseni (sayısal)" value={xCol} onChange={(e) => setXCol(e.target.value)}>
                  {numericProps.map((p) => (
                    <MenuItem key={p.apiName} value={p.apiName}>
                      {p.displayName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Y ekseni (sayısal)</InputLabel>
                <Select label="Y ekseni (sayısal)" value={yCol} onChange={(e) => setYCol(e.target.value)}>
                  {numericProps
                    .filter((p) => p.apiName !== xCol)
                    .map((p) => (
                      <MenuItem key={p.apiName} value={p.apiName}>
                        {p.displayName}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Stack>
          )}

          {tip === 'zaman' && (
            <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Tarih kolonu</InputLabel>
                <Select
                  label="Tarih kolonu"
                  value={dateProperty}
                  onChange={(e) => setDateProperty(e.target.value)}
                >
                  {temporalProps.map((p) => (
                    <MenuItem key={p.apiName} value={p.apiName}>
                      {p.displayName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ width: 140 }}>
                <InputLabel>Granülarite</InputLabel>
                <Select
                  label="Granülarite"
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value as never)}
                >
                  <MenuItem value="hour">Saat</MenuItem>
                  <MenuItem value="day">Gün</MenuItem>
                  <MenuItem value="week">Hafta</MenuItem>
                  <MenuItem value="month">Ay</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          )}

          {tip === 'stat' && (
            <FormControl size="small">
              <InputLabel>Renk</InputLabel>
              <Select label="Renk" value={renk} onChange={(e) => setRenk(e.target.value as never)}>
                <MenuItem value="primary">Mavi</MenuItem>
                <MenuItem value="error">Kırmızı</MenuItem>
                <MenuItem value="warning">Turuncu</MenuItem>
                <MenuItem value="success">Yeşil</MenuItem>
                <MenuItem value="secondary">Mor</MenuItem>
              </Select>
            </FormControl>
          )}

          {temporalProps.length > 0 && (
            <FormControl size="small">
              <InputLabel>Canlı pencere</InputLabel>
              <Select
                label="Canlı pencere"
                value={pencereDk}
                onChange={(e) => setPencereDk(Number(e.target.value))}
              >
                {PENCERELER.map((p) => (
                  <MenuItem key={p.v} value={p.v}>
                    {p.l}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </>
      )}

      {tip === 'harita' && (
        <>
          <FormControl size="small">
            <InputLabel>Sınıflandırmalar</InputLabel>
            <Select
              multiple
              label="Sınıflandırmalar"
              value={siniflar}
              onChange={(e) => setSiniflar(e.target.value as string[])}
              renderValue={(v) => (v as string[]).join(', ') || 'Tümü'}
            >
              {SINIFLAR.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Pencere</InputLabel>
            <Select label="Pencere" value={pencereDk || 15} onChange={(e) => setPencereDk(Number(e.target.value))}>
              <MenuItem value={5}>Son 5 dk</MenuItem>
              <MenuItem value={15}>Son 15 dk</MenuItem>
              <MenuItem value={60}>Son 1 saat</MenuItem>
            </Select>
          </FormControl>
        </>
      )}

      {(tip === 'alarmlar' || tip === 'analizler') && (
        <FormControl size="small">
          <InputLabel>Kaç kayıt</InputLabel>
          <Select label="Kaç kayıt" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[3, 6, 10, 12].map((n) => (
              <MenuItem key={n} value={n}>
                {n}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {tip === 'harman_board' && (
        <>
          <FormControl size="small">
            <InputLabel>Harman analizi</InputLabel>
            <Select
              label="Harman analizi"
              value={analysisId}
              onChange={(e) => {
                setAnalysisId(e.target.value);
                setPathId('');
                setBoardId('');
              }}
            >
              {(harmanList?.analyses ?? []).map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {harmanDoc && (
            <FormControl size="small">
              <InputLabel>Path</InputLabel>
              <Select
                label="Path"
                value={pathId}
                onChange={(e) => {
                  setPathId(e.target.value);
                  setBoardId('');
                }}
              >
                {harmanDoc.paths.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {secilenPath && (
            <FormControl size="small">
              <InputLabel>Board</InputLabel>
              <Select label="Board" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
                {secilenPath.boards.map((bo) => (
                  <MenuItem key={bo.id} value={bo.id}>
                    {bo.type} ({bo.id})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </>
      )}

      {tip === 'mercek_kart' && (
        <>
          <FormControl size="small">
            <InputLabel>Mercek analizi</InputLabel>
            <Select
              label="Mercek analizi"
              value={analysisId}
              onChange={(e) => {
                setAnalysisId(e.target.value);
                setCardId('');
              }}
            >
              {(mercekList?.analyses ?? []).map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {mercekDoc && (
            <FormControl size="small">
              <InputLabel>Kart</InputLabel>
              <Select label="Kart" value={cardId} onChange={(e) => setCardId(e.target.value)}>
                {mercekDoc.cards.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.kind} — {(c as { name?: string }).name ?? c.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </>
      )}

      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', pt: 1 }}>
        <Button onClick={onBack}>Geri</Button>
        <Button variant="contained" disabled={!gecerli} onClick={submit}>
          Ekle
        </Button>
      </Stack>
    </Stack>
  );
}
