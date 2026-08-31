import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TopNav } from '../components/TopNav';
import type { LinkTypeDef, ObjectTypeDef } from '../types/mercek';
import { KurasyonBuilder } from './KurasyonBuilder';
import {
  aktiflestirSurum,
  denetimIzi,
  geriDon,
  importTtl,
  listeUzantilar,
  onaylaSurum,
  onizle,
  yukleJson,
  type AdmissionRapor,
  type DenetimKaydi,
  type ExtDurum,
  type OnizleSonuc,
  type Uzanti,
  type UzantiSurum,
} from './yonetimApi';

const DURUM_RENK: Record<ExtDurum, 'default' | 'info' | 'warning' | 'success'> = {
  taslak: 'default', dogrulandi: 'info', onayli: 'warning', aktif: 'success', arsiv: 'default',
};
const KADEME_ADLARI = ['Sözdizimi', 'Bağlama', 'Davranış', 'Etki', 'Yönetişim'];

type Aday =
  | { tip: 'ttl'; ttl: string; dosya: string }
  | { tip: 'json'; uzanti: Uzanti }
  | null;

/**
 * Ontoloji Uzantı Yönetimi — iki yol: DOSYADAN (OWL/Turtle/JSON, önizlemeli)
 * ve KÜRASYON (arayüzden görsel kurma). İkisi de önce SAKLAMADAN önizlenir
 * (parse + kademe 1-4 raporu), sonra sürüm oluşturulur → dört-göz onay →
 * aktifleştir. Bkz. docs/SPRINT_ONTOLOJI_YONETIMI.md.
 */
export function YonetimPage() {
  const [sekme, setSekme] = useState(0);
  const [surumler, setSurumler] = useState<UzantiSurum[]>([]);
  const [aktif, setAktif] = useState<number | null>(null);
  const [kayitlar, setKayitlar] = useState<DenetimKaydi[]>([]);
  const [aday, setAday] = useState<Aday>(null);
  const [onizleme, setOnizleme] = useState<OnizleSonuc | null>(null);
  const [mesaj, setMesaj] = useState<{ tip: 'success' | 'error' | 'info'; metin: string } | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const dosyaRef = useRef<HTMLInputElement>(null);

  const yenile = useCallback(async () => {
    const [u, d] = await Promise.all([listeUzantilar(), denetimIzi()]);
    setSurumler(u.surumler); setAktif(u.aktif); setKayitlar(d.kayitlar);
  }, []);
  useEffect(() => { void yenile(); }, [yenile]);

  const dosyaSec = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (dosyaRef.current) dosyaRef.current.value = '';
    if (!f) return;
    const metin = await f.text();
    setOnizleme(null); setMesaj(null);
    setAday(f.name.endsWith('.ttl') ? { tip: 'ttl', ttl: metin, dosya: f.name } : { tip: 'json', uzanti: JSON.parse(metin) });
  };

  const onizle_ = async () => {
    if (!aday) return;
    setMesgul(true); setMesaj(null);
    try {
      const s = await onizle(aday.tip === 'ttl' ? { ttl: aday.ttl } : { json: aday.uzanti });
      setOnizleme(s);
    } catch (e) {
      setMesaj({ tip: 'error', metin: `Önizleme hatası: ${(e as Error).message}` });
    } finally { setMesgul(false); }
  };

  const surumOlustur = async () => {
    if (!aday) return;
    setMesgul(true); setMesaj(null);
    try {
      const r = aday.tip === 'ttl' ? await importTtl(aday.ttl) : await yukleJson(aday.uzanti);
      setMesaj(r.rapor.gecti
        ? { tip: 'success', metin: `Sürüm v${r.surum} doğrulandı — onaya hazır.` }
        : { tip: 'error', metin: `Reddedildi (kademe ${r.rapor.durduranKademe}).` });
      setAday(null); setOnizleme(null);
      await yenile();
    } catch (e) {
      setMesaj({ tip: 'error', metin: (e as Error).message });
    } finally { setMesgul(false); }
  };

  const eylem = async (fn: () => Promise<{ ok?: boolean; hata?: string; not?: string }>, basari: string) => {
    setMesaj(null);
    try {
      const r = await fn();
      setMesaj(r.ok === false
        ? { tip: 'error', metin: r.hata ?? 'İşlem başarısız' }
        : { tip: 'success', metin: [basari, r.not].filter(Boolean).join(' ') });
      await yenile();
    } catch (e) { setMesaj({ tip: 'error', metin: (e as Error).message }); }
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <TopNav />
      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', p: 2, maxWidth: 1100, mx: 'auto', width: '100%' }}>
        <Typography variant="h5" sx={{ mb: 0.5 }}>Ontoloji Uzantı Yönetimi</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Çekirdek ontoloji (iz/sensör/…) kodda kalır; buradan yalnız UZANTI eklenir.
          Yol: yükle/kur → <b>önizle & doğrula</b> → sürüm oluştur → <b>dört-göz onay</b> →
          aktifleştir. Her eylem denetim izine yazılır.
        </Typography>

        {mesaj && <Alert severity={mesaj.tip} sx={{ mb: 2 }} onClose={() => setMesaj(null)}>{mesaj.metin}</Alert>}

        {/* Aday oluşturma: dosya ya da kürasyon */}
        <Paper variant="outlined" sx={{ mb: 2 }}>
          <Tabs value={sekme} onChange={(_, v) => { setSekme(v); setAday(null); setOnizleme(null); }} sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="Dosyadan (OWL/Turtle · JSON)" />
            <Tab label="Kürasyon (arayüzden kur)" />
          </Tabs>
          <Box sx={{ p: 2 }}>
            {sekme === 0 && (
              <Stack spacing={1.5}>
                <input ref={dosyaRef} type="file" accept=".ttl,.json" hidden onChange={dosyaSec} />
                <Box>
                  <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => dosyaRef.current?.click()}>
                    Dosya seç
                  </Button>
                  {aday?.tip === 'ttl' && <Chip sx={{ ml: 1 }} label={aday.dosya} onDelete={() => { setAday(null); setOnizleme(null); }} />}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  OWL/Turtle dosyasında <code>verim:datasetId</code>/<code>verim:primaryKey</code> bağlama
                  annotation'ları zorunludur (Gezgin'den "OWL/Turtle indir" ile örnek biçim).
                </Typography>
              </Stack>
            )}
            {sekme === 1 && (
              <KurasyonBuilder
                onUzanti={(u) => {
                  setOnizleme(null);
                  setAday(u.objectTypes.length > 0 ? { tip: 'json', uzanti: u } : null);
                }}
              />
            )}
          </Box>
        </Paper>

        {/* Önizle & doğrula / sürüm oluştur */}
        {aday && (
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Button variant="outlined" startIcon={<VisibilityIcon />} disabled={mesgul} onClick={() => void onizle_()}>
              Önizle & doğrula
            </Button>
            <Button variant="contained" disabled={mesgul || !onizleme?.rapor.gecti} onClick={() => void surumOlustur()}>
              Sürüm oluştur
            </Button>
            {onizleme && !onizleme.rapor.gecti && (
              <Typography variant="caption" color="error" sx={{ alignSelf: 'center' }}>
                Doğrulama geçmeden sürüm oluşturulamaz.
              </Typography>
            )}
          </Stack>
        )}

        {/* Önizleme paneli: ne tanımlıyor + kademeli rapor */}
        {onizleme && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <RaporStepper rapor={onizleme.rapor} />
            <Divider sx={{ my: 1.5 }} />
            {onizleme.ext ? (
              <UzantiOnizleme tipler={onizleme.ext.objectTypes} linkler={onizleme.ext.linkTypes} />
            ) : (
              <Typography variant="body2" color="error">Dosya ayrıştırılamadı (bağlama manifesti eksik olabilir).</Typography>
            )}
            {onizleme.etkilenen.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                Bu değişiklik {onizleme.etkilenen.length} kayıtlı artefaktı etkiliyor:
                {' '}{onizleme.etkilenen.slice(0, 5).map((e) => `${e.tur}:${e.artefakt}`).join(', ')}
              </Alert>
            )}
          </Paper>
        )}

        {/* Sürüm geçmişi */}
        <SurumTablosu surumler={surumler} aktif={aktif}
          onOnayla={(s) => void eylem(() => onaylaSurum(s), `v${s} onaylandı.`)}
          onAktif={(s) => void eylem(() => aktiflestirSurum(s), `v${s} aktif.`)}
          onGeri={() => void eylem(geriDon, 'Önceki sürüme dönüldü.')} />

        {/* Denetim izi */}
        <DenetimTablosu kayitlar={kayitlar} />
      </Box>
    </Box>
  );
}

function RaporStepper({ rapor }: { rapor: AdmissionRapor }) {
  // 5 kademe: raporun içerdikleri + kalanlar "beklemede"
  const durum = (n: number): 'gecti' | 'kaldi' | 'bekliyor' => {
    const k = rapor.kademeler.find((x) => x.kademe === n);
    if (!k) return 'bekliyor';
    return k.gecti ? 'gecti' : 'kaldi';
  };
  return (
    <>
      <Stepper alternativeLabel sx={{ mb: 1 }}>
        {KADEME_ADLARI.map((ad, i) => {
          const d = durum(i + 1);
          return (
            <Step key={ad} completed={d === 'gecti'} active={d === 'kaldi'}>
              <StepLabel
                icon={
                  d === 'gecti' ? <CheckCircleIcon color="success" /> :
                  d === 'kaldi' ? <ErrorIcon color="error" /> :
                  <RadioButtonUncheckedIcon color="disabled" />
                }
              >
                {i + 1}. {ad}
              </StepLabel>
            </Step>
          );
        })}
      </Stepper>
      {rapor.kademeler.flatMap((k) => k.bulgular).map((b, i) => (
        <Typography key={i} variant="caption" color="error" sx={{ display: 'block' }}>
          [K{b.kademe}·{b.kod}] {b.mesaj}{b.konum ? ` (${b.konum})` : ''}
        </Typography>
      ))}
      {rapor.gecti && (
        <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>
          ✓ Tüm kademeler geçti — sürüm oluşturulabilir.
        </Typography>
      )}
    </>
  );
}

function UzantiOnizleme({ tipler, linkler }: { tipler: ObjectTypeDef[]; linkler: LinkTypeDef[] }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Bu uzantı {tipler.length} tip · {linkler.length} ilişki tanımlıyor
      </Typography>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {tipler.map((t) => (
          <Paper key={t.apiName} variant="outlined" sx={{ p: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
              <Box sx={{ fontSize: 20 }}>{t.icon}</Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{t.displayName}</Typography>
                <Typography variant="caption" color="text.secondary">{t.datasetId} · anahtar {t.primaryKey}</Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
              {t.properties.map((p) => (
                <Chip key={p.apiName} size="small" label={`${p.apiName}: ${p.type}`} sx={{ height: 20, fontSize: 10 }} />
              ))}
            </Stack>
          </Paper>
        ))}
      </Box>
      {linkler.length > 0 && (
        <Stack spacing={0.25} sx={{ mt: 1 }}>
          {linkler.map((l) => (
            <Typography key={l.apiName} variant="caption">
              🔗 <b>{l.fromObjectType}</b> → <b>{l.toObjectType}</b> · {l.displayName} ({l.fromKey}={l.toKey})
            </Typography>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function SurumTablosu({
  surumler, aktif, onOnayla, onAktif, onGeri,
}: {
  surumler: UzantiSurum[]; aktif: number | null;
  onOnayla: (s: number) => void; onAktif: (s: number) => void; onGeri: () => void;
}) {
  return (
    <Paper variant="outlined" sx={{ mb: 2 }}>
      <Stack direction="row" sx={{ p: 1.5, pb: 0.5, alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Sürümler</Typography>
        <Button size="small" color="inherit" onClick={onGeri}>Geri dön (rollback)</Button>
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            {['Sürüm', 'Durum', 'Açıklama', 'Yükleyen', 'Onaylayan', 'İçerik', 'Eylem'].map((h) => (
              <TableCell key={h} sx={{ fontWeight: 600 }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {surumler.map((v) => (
            <TableRow key={v.surum} hover selected={aktif === v.surum}>
              <TableCell>v{v.surum}</TableCell>
              <TableCell><Chip size="small" label={v.durum} color={DURUM_RENK[v.durum]} variant={v.durum === 'aktif' ? 'filled' : 'outlined'} /></TableCell>
              <TableCell sx={{ maxWidth: 200 }}><Typography variant="caption" noWrap sx={{ display: 'block' }}>{v.icerik.aciklama ?? '—'}</Typography></TableCell>
              <TableCell>{v.yukleyen}</TableCell>
              <TableCell>{v.onaylayan ?? '—'}</TableCell>
              <TableCell>{v.icerik.objectTypes.length} tip · {v.icerik.linkTypes.length} link</TableCell>
              <TableCell>
                {v.durum === 'dogrulandi' && <Button size="small" onClick={() => onOnayla(v.surum)}>Onayla</Button>}
                {v.durum === 'onayli' && <Button size="small" variant="contained" onClick={() => onAktif(v.surum)}>Aktifleştir</Button>}
              </TableCell>
            </TableRow>
          ))}
          {surumler.length === 0 && (
            <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.secondary">Henüz uzantı yok.</Typography></TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </Paper>
  );
}

function DenetimTablosu({ kayitlar }: { kayitlar: DenetimKaydi[] }) {
  return (
    <Paper variant="outlined">
      <Typography variant="subtitle2" sx={{ p: 1.5, pb: 0.5 }}>Denetim İzi</Typography>
      <Table size="small">
        <TableBody>
          {kayitlar.slice().reverse().slice(0, 20).map((k, i) => (
            <TableRow key={i}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(k.zaman).toLocaleString('tr')}</TableCell>
              <TableCell><b>{k.kim}</b></TableCell>
              <TableCell>{k.eylem}{k.surum ? ` v${k.surum}` : ''}</TableCell>
              <TableCell>{k.sonuc}</TableCell>
            </TableRow>
          ))}
          {kayitlar.length === 0 && (
            <TableRow><TableCell><Typography variant="body2" color="text.secondary">Kayıt yok.</Typography></TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </Paper>
  );
}
