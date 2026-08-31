import {
  Box,
  Chip,
  Link as MuiLink,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { Fragment } from 'react';
import { KONSOL } from './konsol';
import type { SenkGorev, SenkMatris } from '../karar/api';

/**
 * SENKRONİZASYON MATRİSİ — genel/yeniden-kullanılabilir sunum bileşeni.
 *
 * Satır (aktör) × Sütun (zaman penceresi) × Hücre (senkronize görev) gridini
 * çizer. Domain'e göre gruplu satırlar, yapışkan başlık + ilk sütun, öncelik
 * rengi ve ROE işaretiyle. Alan bilgisi yok: `SenkMatris` verisini alır, tıklama
 * geri-çağrılarını dışarı verir — Karar Destek, Pano vb. her yerde kullanılabilir.
 */

const ONCELIK_RENK: Record<string, string> = {
  Kritik: '#d32f2f',
  Yüksek: '#f57c00',
  Orta: '#f9a825',
  Düşük: '#1976d2',
  Asgari: '#90a4ae',
};

const ROE_ISARET: Record<string, { simge: string; renk: string; baslik: string }> = {
  serbest: { simge: '●', renk: '#2e7d32', baslik: 'ROE serbest — angajman yetkili' },
  kısıtlı: { simge: '◐', renk: '#ed6c02', baslik: 'ROE kısıtlı — komutan onayı gerekli' },
  yasak: { simge: '○', renk: '#c62828', baslik: 'ROE yasak — yalnız takip' },
};

export interface SenkronizasyonMatrisiProps {
  matris: SenkMatris;
  /** Bir görev rozetine tıklanınca (ör. COA çekmecesini aç). */
  onIz?: (izNo: string) => void;
  /** Bir varlık satırına tıklanınca (ör. platform nesne detayını aç). */
  onSatir?: (satir: SenkMatris['satirlar'][number]) => void;
  /** Dar/özet mod: açıklamaları ve gerekçeleri gizler. */
  kompakt?: boolean;
  /** Koyu komuta-konsolu paleti (Karar Destek gömülü kullanımı). */
  koyu?: boolean;
  maxYukseklik?: number | string;
  /** BİLEŞENLER KONUŞUR: dışarıdan işaret edilen iz (tehdit tablosu hover'ı)
   *  matristeki rozetleri vurgular; rozet hover'ı da dışarı bildirilir. */
  vurguIz?: string | null;
  onIzHover?: (izNo: string | null) => void;
}

export function SenkronizasyonMatrisi({
  matris,
  onIz,
  onSatir,
  kompakt = false,
  koyu = false,
  maxYukseklik = 460,
  vurguIz = null,
  onIzHover,
}: SenkronizasyonMatrisiProps) {
  const { satirlar, sutunlar } = matris;
  // Koyu/aydınlık palet anahtarları — tek yerden
  const bas = koyu ? KONSOL.bant : 'grey.50'; // başlık/sticky zemin
  const grup = koyu ? KONSOL.yuzey : 'grey.100';
  const satZemin = koyu ? KONSOL.kanvas : 'background.paper';
  const ayrac = koyu ? KONSOL.kenar : 'divider';
  // (satirId|sutunId) → hücre  hızlı erişim
  const hucreDizin = new Map(matris.hucreler.map((h) => [`${h.satirId}|${h.sutunId}`, h]));

  const ILK_SUTUN_GEN = kompakt ? 150 : 200;

  if (satirlar.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
        <Typography variant="body2">
          Şu an görevlendirilecek angajman yok — tehditler eşiğin altında ya da ROE takip modunda.
        </Typography>
      </Box>
    );
  }

  let oncekiGrup: string | null = null;

  return (
    <TableContainer sx={{ maxHeight: maxYukseklik }}>
      <Table size="small" stickyHeader sx={{ borderCollapse: 'separate', borderSpacing: 0 }}>
        <TableHead>
          <TableRow>
            <TableCell
              sx={{
                position: 'sticky',
                left: 0,
                zIndex: 4,
                bgcolor: bas,
                color: koyu ? KONSOL.metin : undefined,
                borderColor: ayrac,
                minWidth: ILK_SUTUN_GEN,
                fontWeight: 700,
              }}
            >
              Varlık \ Zaman
            </TableCell>
            {sutunlar.map((s) => (
              <TableCell key={s.id} align="center" sx={{ bgcolor: bas, color: koyu ? KONSOL.metin : undefined, borderColor: ayrac, minWidth: 140 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {s.baslik}
                </Typography>
                {!kompakt && s.aciklama && (
                  <Typography variant="caption" color="text.secondary">
                    {s.aciklama}
                  </Typography>
                )}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {satirlar.map((satir) => {
            const grupBasligi = satir.grup !== oncekiGrup ? satir.grup : null;
            oncekiGrup = satir.grup;
            return (
              <Fragment key={satir.id}>
                {grupBasligi && (
                  <TableRow>
                    <TableCell
                      colSpan={sutunlar.length + 1}
                      sx={{
                        position: 'sticky',
                        left: 0,
                        bgcolor: grup,
                        color: koyu ? KONSOL.metin : undefined,
                        py: 0.5,
                        borderTop: 2,
                        borderColor: ayrac,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}
                      >
                        {grupBasligi}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                <TableRow hover>
                  <TableCell
                    sx={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      bgcolor: satZemin,
                      color: koyu ? KONSOL.metin : undefined,
                      borderColor: ayrac,
                      minWidth: ILK_SUTUN_GEN,
                    }}
                  >
                    {satir.pk && onSatir ? (
                      <MuiLink
                        component="button"
                        underline="hover"
                        onClick={() => onSatir(satir)}
                        sx={{ fontWeight: 700, textAlign: 'left' }}
                      >
                        {satir.baslik}
                      </MuiLink>
                    ) : (
                      <Typography sx={{ fontWeight: 700 }}>{satir.baslik}</Typography>
                    )}
                    {satir.altbaslik && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {satir.altbaslik}
                      </Typography>
                    )}
                  </TableCell>
                  {sutunlar.map((sutun) => {
                    const hucre = hucreDizin.get(`${satir.id}|${sutun.id}`);
                    return (
                      <TableCell key={sutun.id} align="center" sx={{ verticalAlign: 'top', px: 0.75, borderColor: ayrac }}>
                        {hucre ? (
                          <Stack spacing={0.5} sx={{ alignItems: 'stretch' }}>
                            {hucre.gorevler.map((g) => (
                              <GorevRozet key={g.izNo} g={g} onIz={onIz} kompakt={kompakt} koyu={koyu} vurgu={vurguIz === g.izNo} onHover={onIzHover} />
                            ))}
                          </Stack>
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            —
                          </Typography>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function GorevRozet({
  g,
  onIz,
  kompakt,
  koyu = false,
  vurgu = false,
  onHover,
}: {
  g: SenkGorev;
  onIz?: (izNo: string) => void;
  kompakt: boolean;
  koyu?: boolean;
  vurgu?: boolean;
  onHover?: (izNo: string | null) => void;
}) {
  const renk = ONCELIK_RENK[g.oncelik] ?? '#90a4ae';
  const roe = ROE_ISARET[g.roeDurumu] ?? { simge: '·', renk: '#90a4ae', baslik: g.roeDurumu };
  return (
    <Tooltip
      title={`${g.izNo} · ${g.oncelik} (skor ${g.skor}) · ${g.angajmanTipi} · ${roe.baslik} · başarı %${g.basariYuzde}`}
      arrow
    >
      <Chip
        size="small"
        onClick={onIz ? () => onIz(g.izNo) : undefined}
        clickable={!!onIz}
        onMouseEnter={onHover ? () => onHover(g.izNo) : undefined}
        onMouseLeave={onHover ? () => onHover(null) : undefined}
        label={
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Box component="span" sx={{ color: roe.renk, fontWeight: 900, lineHeight: 1 }}>
              {roe.simge}
            </Box>
            <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
              {kompakt ? g.izNo.replace(/^IZ-?/, '') : g.izNo}
            </Box>
          </Stack>
        }
        sx={{
          height: 22,
          borderLeft: `4px solid ${renk}`,
          borderRadius: 1,
          bgcolor: vurgu ? 'rgba(125,211,252,.25)' : koyu ? KONSOL.bant : 'grey.50',
          color: koyu ? KONSOL.metin : undefined,
          outline: vurgu ? '2px solid #38bdf8' : undefined,
          '& .MuiChip-label': { px: 0.75 },
        }}
      />
    </Tooltip>
  );
}

/** Matris özetini rozet şeridi olarak gösteren yardımcı (opsiyonel kullanım). */
export function SenkOzetSerit({ ozet }: { ozet: SenkMatris['ozet'] }) {
  const oge = (etiket: string, deger: number, renk?: string) => (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'baseline' }}>
      <Typography variant="body2" sx={{ fontWeight: 800, color: renk }}>
        {deger}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {etiket}
      </Typography>
    </Stack>
  );
  return (
    <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {oge('görevli varlık', ozet.gorevlendirilen_varlik, '#1976d2')}
      {oge('planlı angajman', ozet.planlanan_angajman, '#d32f2f')}
      {oge('kapsanan tehdit', ozet.kapsanan_tehdit)}
      {oge('boşta varlık', ozet.bosta_varlik, '#2e7d32')}
      {ozet.atanamayan_tehdit > 0 && oge('atanamayan', ozet.atanamayan_tehdit, '#ed6c02')}
    </Stack>
  );
}
