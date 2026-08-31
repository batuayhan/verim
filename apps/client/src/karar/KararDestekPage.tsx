import CloseIcon from '@mui/icons-material/Close';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import GridViewIcon from '@mui/icons-material/GridView';
import ShieldIcon from '@mui/icons-material/Shield';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  LinearProgress,
  Link as MuiLink,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLiveMode } from '../api/live';
import { KONSOL, KonsolTema, KpiRozet } from '../components/konsol';
import { TopNav } from '../components/TopNav';
import { useNavigate } from 'react-router';
import { useNesneDetay } from '../nesne/NesneDetay';
import { SenkronizasyonMatrisi, SenkOzetSerit } from '../components/SenkronizasyonMatrisi';
import {
  getCoa,
  getDurum,
  getSenkronizasyon,
  getTehditler,
  type CoaSonuc,
  type Secenek,
} from './api';

const ONCELIK_RENK: Record<string, string> = {
  Kritik: '#d32f2f',
  Yüksek: '#f57c00',
  Orta: '#f9a825',
  Düşük: '#1976d2',
  Asgari: '#90a4ae',
};
const RISK_RENK: Record<string, 'error' | 'warning' | 'success'> = {
  Yüksek: 'error',
  Orta: 'warning',
  Düşük: 'success',
};
const ROE_RENK: Record<string, 'success' | 'warning' | 'error'> = {
  serbest: 'success',
  kısıtlı: 'warning',
  yasak: 'error',
};

export function KararDestekPage() {
  const { refetchInterval } = useLiveMode();
  const [seciliIz, setSeciliIz] = useState<string | null>(null);
  const detay = useNesneDetay(); // Mercek tarzı sonsuz-ilişki nesne detayı
  const navigate = useNavigate();
  // BİLEŞENLER KONUŞUR: tehdit tablosu ↔ angajman matrisi aynı izi vurgular
  const [hoverIz, setHoverIz] = useState<string | null>(null);
  // Rozet tıkı → tablo filtresi (read'i assess'e bağlar — konsol dili)
  const [filtre, setFiltre] = useState<'hepsi' | 'Düşman' | 'Şüpheli' | 'Kritik' | 'Yaklaşan'>('hepsi');
  // Angajman matrisi paneli: varsayılan çökük (SenkOzetSerit), tercih kalıcı
  const [matrisAcik, setMatrisAcik] = useState(() => localStorage.getItem('verim-karar-matris') === '1');
  const matrisToggle = () =>
    setMatrisAcik((v) => {
      localStorage.setItem('verim-karar-matris', v ? '0' : '1');
      return !v;
    });

  const durum = useQuery({ queryKey: ['durum'], queryFn: () => getDurum(), refetchInterval });
  const tehditler = useQuery({
    queryKey: ['tehditler'],
    queryFn: () => getTehditler(25),
    refetchInterval,
  });
  const senk = useQuery({
    queryKey: ['senkronizasyon'],
    queryFn: () => getSenkronizasyon(24),
    refetchInterval,
  });

  const satirlar = (tehditler.data ?? []).filter((t) => {
    if (filtre === 'hepsi') return true;
    if (filtre === 'Kritik') return t.tehdit_onceligi === 'Kritik';
    if (filtre === 'Yaklaşan') return t.yaklasiyor;
    return t.siniflandirma === filtre;
  });

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#070b13', overflow: 'hidden' }}>
      <TopNav />
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 1400, mx: 'auto', px: 2, py: 1, gap: 1 }}>
        {/* ═══ KONSOL ═══ */}
        <Box
          sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 1.5, overflow: 'hidden', border: `1px solid ${KONSOL.kenar}`, bgcolor: KONSOL.kanvas }}
        >
          {/* BAŞLIK ÇUBUĞU — kimlik + tek satır durum özeti (read) */}
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.25, py: 0.6, borderBottom: `1px solid ${KONSOL.kenarSoluk}`, flexShrink: 0 }}>
            <ShieldIcon sx={{ color: KONSOL.vurgu, fontSize: 18 }} />
            <Typography sx={{ fontWeight: 800, color: KONSOL.metin, fontSize: 14, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
              KARAR DESTEK
            </Typography>
            <Tooltip title="Akıl yürütme motoru · canlı writeback · 3 sn'de bir tazelenir">
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#4ade80', flexShrink: 0 }} />
            </Tooltip>
            {durum.data && (
              <Tooltip title={durum.data.ozet}>
                <Typography noWrap sx={{ color: KONSOL.metinIkincil, fontSize: 12, minWidth: 0 }}>
                  {durum.data.ozet}
                </Typography>
              </Tooltip>
            )}
          </Stack>

          {/* KANVAS — tehdit tablosu (assess); satır/COA → act */}
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {tehditler.isLoading ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <CircularProgress size={28} sx={{ color: KONSOL.vurgu }} />
              </Box>
            ) : (
              <Table
                size="small"
                stickyHeader
                sx={{
                  '& .MuiTableCell-root': { color: KONSOL.metin, borderColor: KONSOL.kenarSoluk, fontSize: 12.5 },
                  '& .MuiTableCell-head': { bgcolor: KONSOL.bant, color: KONSOL.metinIkincil, fontWeight: 800, fontSize: 10.5, letterSpacing: 1, fontFamily: KONSOL.mono },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>İZ NO</TableCell>
                    <TableCell>SINIF</TableCell>
                    <TableCell>DOMAIN</TableCell>
                    <TableCell align="right">SKOR</TableCell>
                    <TableCell>ÖNCELİK</TableCell>
                    <TableCell>DURUM</TableCell>
                    <TableCell align="right">EYLEM</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {satirlar.map((t) => (
                    <TableRow
                      key={t.iz_no}
                      hover
                      onClick={() => setSeciliIz(t.iz_no)}
                      onMouseEnter={() => setHoverIz(t.iz_no)}
                      onMouseLeave={() => setHoverIz((h) => (h === t.iz_no ? null : h))}
                      sx={{
                        cursor: 'pointer',
                        borderLeft: t.tehdit_onceligi === 'Kritik' ? '3px solid #ff5252' : '3px solid transparent',
                        bgcolor: hoverIz === t.iz_no ? 'rgba(125,211,252,.08)' : undefined,
                        '&:hover': { bgcolor: 'rgba(125,211,252,.06) !important' },
                      }}
                    >
                      <TableCell sx={{ fontFamily: KONSOL.mono }}>
                        <MuiLink
                          component="button"
                          underline="hover"
                          onClick={(e) => {
                            e.stopPropagation(); // satır COA'yı açar; iz_no nesne detayını
                            detay.ac('iz', t.iz_no);
                          }}
                          sx={{ fontFamily: KONSOL.mono, color: KONSOL.vurgu }}
                        >
                          {t.iz_no}
                        </MuiLink>
                      </TableCell>
                      <TableCell>{t.siniflandirma}</TableCell>
                      <TableCell sx={{ color: KONSOL.metinIkincil }}>{t.domain}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                          <Box sx={{ width: 44, height: 6, borderRadius: 3, bgcolor: '#1e293b', overflow: 'hidden' }}>
                            <Box sx={{ width: `${t.tehdit_skoru}%`, height: '100%', bgcolor: ONCELIK_RENK[t.tehdit_onceligi] ?? '#90a4ae' }} />
                          </Box>
                          <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: KONSOL.mono }}>
                            {t.tehdit_skoru}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={t.tehdit_onceligi}
                          sx={{ bgcolor: ONCELIK_RENK[t.tehdit_onceligi] ?? '#90a4ae', color: '#fff', fontWeight: 700, height: 20 }}
                        />
                      </TableCell>
                      <TableCell>
                        {t.yaklasiyor && (
                          <Tooltip title="Dost varlığa yaklaşıyor">
                            <Chip size="small" icon={<GpsFixedIcon />} label="Yaklaşıyor" color="error" variant="outlined" sx={{ height: 20 }} />
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {/* COA keşfi GÖRÜNÜR — gizli satır tıkına ek (alan-uzmanı şartı) */}
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSeciliIz(t.iz_no);
                          }}
                          sx={{ textTransform: 'none', py: 0, color: KONSOL.vurgu, borderColor: 'rgba(125,211,252,.35)', fontSize: 11 }}
                        >
                          COA
                        </Button>
                        <Tooltip title="Haritada göster">
                          <Button
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/harita?izler=1&lat=${t.enlem}&lon=${t.boylam}&zoom=9&etiket=${encodeURIComponent(t.iz_no)}`);
                            }}
                            sx={{ minWidth: 0, py: 0, px: 0.5, fontSize: 13 }}
                          >
                            🗺
                          </Button>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>

          {/* ANGAJMAN MATRİSİ PANE — varsayılan çökük şerit (tek ekran garantisi) */}
          <Box sx={{ borderTop: `1px solid ${KONSOL.kenarSoluk}`, flexShrink: 0, maxHeight: matrisAcik ? '40vh' : undefined, display: 'flex', flexDirection: 'column' }}>
            <Stack
              direction="row"
              spacing={1}
              onClick={matrisToggle}
              sx={{ alignItems: 'center', px: 1.25, py: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(148,163,184,.06)' }, flexShrink: 0 }}
            >
              <GridViewIcon sx={{ fontSize: 14, color: KONSOL.vurgu }} />
              <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: KONSOL.metinIkincil, letterSpacing: 1, fontFamily: KONSOL.mono }}>
                ANGAJMAN SENKRONİZASYON MATRİSİ
              </Typography>
              <Box component="span" sx={{ fontSize: 10, color: KONSOL.metinIkincil }}>{matrisAcik ? '▼' : '▶'}</Box>
              <Box sx={{ flexGrow: 1 }} />
              {senk.data && (
                <Box sx={{ '& *': { color: `${KONSOL.metinIkincil} !important` }, '& .MuiTypography-root': { fontSize: 11 } }}>
                  <SenkOzetSerit ozet={senk.data.ozet} />
                </Box>
              )}
            </Stack>
            {matrisAcik && (
              <Box sx={{ overflow: 'auto', minHeight: 0, bgcolor: KONSOL.kanvas }}>
                {senk.isLoading ? (
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : senk.data ? (
                  <SenkronizasyonMatrisi
                    matris={senk.data}
                    kompakt
                    koyu
                    maxYukseklik="34vh"
                    onIz={(izNo) => setSeciliIz(izNo)}
                    onSatir={(s) => s.pk && detay.ac('platform', s.pk)}
                    vurguIz={hoverIz}
                    onIzHover={setHoverIz}
                  />
                ) : (
                  <Typography color="error" sx={{ p: 2 }}>
                    Matris alınamadı
                  </Typography>
                )}
              </Box>
            )}
          </Box>

          {/* DURUM ÇUBUĞU — tıklanabilir KPI rozetleri = tablo filtresi */}
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', px: 1.25, py: 0.4, borderTop: `1px solid ${KONSOL.kenarSoluk}`, flexWrap: 'wrap', flexShrink: 0 }}>
            <KpiRozet etiket="Toplam İz" deger={String(durum.data?.toplam_iz ?? '…')} aktif={filtre === 'hepsi'} onClick={() => setFiltre('hepsi')} ipucu="Filtreyi temizle" />
            <KpiRozet etiket="Düşman" deger={String(durum.data?.dagilim.dusman ?? '…')} renk="#ff5252" aktif={filtre === 'Düşman'} onClick={() => setFiltre((f) => (f === 'Düşman' ? 'hepsi' : 'Düşman'))} ipucu="Tabloda yalnız düşman izleri" />
            <KpiRozet etiket="Şüpheli" deger={String(durum.data?.dagilim.supheli ?? '…')} renk="#fb8c00" aktif={filtre === 'Şüpheli'} onClick={() => setFiltre((f) => (f === 'Şüpheli' ? 'hepsi' : 'Şüpheli'))} ipucu="Tabloda yalnız şüpheli izler" />
            <KpiRozet etiket="Kritik" deger={String(durum.data?.dagilim.kritik_tehdit ?? '…')} renk="#ff5252" aktif={filtre === 'Kritik'} onClick={() => setFiltre((f) => (f === 'Kritik' ? 'hepsi' : 'Kritik'))} ipucu="Tabloda yalnız kritik öncelik" />
            <KpiRozet etiket="Yaklaşan" deger={String(durum.data?.dagilim.yaklasan ?? '…')} renk="#f472b6" aktif={filtre === 'Yaklaşan'} onClick={() => setFiltre((f) => (f === 'Yaklaşan' ? 'hepsi' : 'Yaklaşan'))} ipucu="Tabloda yalnız yaklaşanlar" />
            <Box sx={{ flexGrow: 1 }} />
            {filtre !== 'hepsi' && (
              <Chip size="small" label={`Filtre: ${filtre} (${satirlar.length})`} onDelete={() => setFiltre('hepsi')} sx={{ bgcolor: KONSOL.bant, color: KONSOL.vurgu, height: 20 }} />
            )}
            <Typography sx={{ fontSize: 10, color: KONSOL.metinIkincil }}>satır → COA · iz no → detay</Typography>
          </Stack>
        </Box>
      </Box>

      <CoaDrawer izNo={seciliIz} onClose={() => setSeciliIz(null)} />
    </Box>
  );
}



function CoaDrawer({ izNo, onClose }: { izNo: string | null; onClose: () => void }) {
  const coa = useQuery({
    queryKey: ['coa', izNo],
    queryFn: () => getCoa(izNo!),
    enabled: !!izNo,
  });
  const data = coa.data && !('hata' in coa.data) ? (coa.data as CoaSonuc) : undefined;
  const hata = coa.data && 'hata' in coa.data ? coa.data.hata : null;

  return (
    <KonsolTema>
    <Drawer
      anchor="right"
      open={!!izNo}
      onClose={onClose}
      slotProps={{ paper: { sx: { bgcolor: KONSOL.yuzey, color: KONSOL.metin, borderLeft: `1px solid ${KONSOL.kenar}` } } }}
    >
      <Box sx={{ width: 440, p: 2.5 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Angajman Senaryoları (COA)
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
        <Typography variant="body2" sx={{ fontFamily: KONSOL.mono, mb: 2, color: KONSOL.metinIkincil }}>
          {izNo}
        </Typography>

        {coa.isLoading && <LinearProgress />}
        {hata && <Typography color="error">{hata}</Typography>}
        {data && (
          <>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
              <Typography variant="body2">ROE Durumu:</Typography>
              <Chip
                size="small"
                label={data.roeDurumu.toUpperCase()}
                color={ROE_RENK[data.roeDurumu]}
              />
            </Stack>
            {data.roeIhlalleri.length > 0 && (
              <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#3a2a12', border: '1px solid rgba(251,191,36,.35)' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                  <WarningAmberIcon fontSize="small" color="warning" />
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    ROE KISITLARI
                  </Typography>
                </Stack>
                {data.roeIhlalleri.map((i, k) => (
                  <Typography key={k} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    • {i}
                  </Typography>
                ))}
              </Paper>
            )}
            <Stack spacing={1.5}>
              {data.secenekler.map((s, k) => (
                <SecenekKart key={k} s={s} oneri={s === data.oneri} />
              ))}
            </Stack>
          </>
        )}
      </Box>
    </Drawer>
    </KonsolTema>
  );
}

function SecenekKart({ s, oneri }: { s: Secenek; oneri: boolean }) {
  const detay = useNesneDetay();
  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, bgcolor: KONSOL.bant, borderColor: oneri ? KONSOL.vurgu : KONSOL.kenar, borderWidth: oneri ? 2 : 1, color: KONSOL.metin }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontWeight: 700 }}>{s.angajmanTipi}</Typography>
          {oneri && <Chip size="small" label="ÖNERİ" color="primary" />}
        </Stack>
        <Chip size="small" label={`Risk: ${s.risk}`} color={RISK_RENK[s.risk]} variant="outlined" />
      </Stack>
      <Stack direction="row" spacing={2} sx={{ mt: 1, mb: 0.5 }}>
        <Typography variant="body2">
          Varlık:{' '}
          {s.varlik && s.varlikPk ? (
            <MuiLink
              component="button"
              underline="hover"
              onClick={() => detay.ac('platform', s.varlikPk!)}
              sx={{ fontWeight: 700 }}
            >
              {s.varlik}
            </MuiLink>
          ) : (
            <b>{s.varlik ?? '—'}</b>
          )}
          {s.varlikTipi ? ` (${s.varlikTipi})` : ''}
        </Typography>
        {s.mesafeKm != null && <Typography variant="body2">{s.mesafeKm} km</Typography>}
        {s.kesismeDk != null && <Typography variant="body2">~{s.kesismeDk} dk</Typography>}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box sx={{ flex: 1 }}>
          <LinearProgress
            variant="determinate"
            value={s.basariYuzde}
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          %{s.basariYuzde}
        </Typography>
        {!s.roeUygun && (
          <Chip size="small" label="onay gerekli" color="warning" variant="outlined" />
        )}
      </Stack>
      {s.gerekce.map((g, k) => (
        <Typography
          key={k}
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.5 }}
        >
          • {g}
        </Typography>
      ))}
    </Paper>
  );
}
