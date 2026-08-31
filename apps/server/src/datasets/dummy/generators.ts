/**
 * All Domain Joint C2 (Çok Alanlı Müşterek Komuta Kontrol) dummy verisi.
 * faker.seed() ile deterministik: her açılışta byte-aynı — `version`
 * token'ı dürüst, sorgu cache'i güvenilir.
 *
 * Ontoloji graf'ı (Maven Smart System / Palantir Gotham tarzı, gezilebilir):
 *   birlik ─(elindeki)→ platform ─(takılı)→ sensör ─(tespit)→ iz ─(geçmiş)→ iz_gözlem
 *   birlik ─(personeli)→ personel ─(görevli)→ platform
 *   birlik ─(komutanı)→ personel        gorev ─(icra eden)→ birlik / (komutan)→ personel
 * "Search around" zincirleri için anahtarlar tutarlıdır (örn. düşman izleri
 * → tespit eden sensörler → platformları → bağlı birlikleri → komutanları).
 */

import { Faker, en, tr } from '@faker-js/faker';
import { buildIntel, type IntelTrackRef, type Rnd } from '../../ingest/intel-feed';
import { HeuristicThreatScorer } from '../../reasoning/threat-scorer';
import type { DatasetRecord, Row } from '../dataset-provider';

// Dummy izler için de GERÇEK skorlayıcıyı kullan (tek skorlama kaynağı; mim
// backend'de aynı motor enricher üzerinden koşar). Sınıflandırma display'i →
// hostility kodu eşlemesi yalnız dummy fabrikatöründedir (ontoloji-şekilli veri
// üreticisinin işi); pipeline'a sızmaz.
const _izScorer = new HeuristicThreatScorer();
const SINIF_KOD: Record<string, string> = {
  Dost: 'FR',
  Düşman: 'HO',
  Şüpheli: 'SUSPECT',
  Bilinmeyen: 'UNK',
};

const VERSION = 'c2-v3'; // v3: istihbarat (multi-INT) dataset'i eklendi
const SEED = 4242;

const DOMAINS = ['Kara', 'Hava', 'Deniz', 'Uzay', 'Siber'] as const;
const REGIONS = ['Trakya', 'Ege', 'Akdeniz', 'Karadeniz', 'İç Anadolu', 'Doğu Anadolu'];
const ECHELONS = ['Tim', 'Bölük', 'Tabur', 'Alay', 'Tugay'];
const UNIT_STATUS = ['Hazır', 'Görevde', 'Bakımda', 'Eğitimde'];

const PLATFORM_TYPES: Record<string, string[]> = {
  Kara: ['ALTAY Tankı', 'FIRTINA Obüsü', 'KORKUT SSA', 'VURAN ZPT', 'KİRPİ MRAP'],
  Hava: ['F-16', 'ATAK Helikopteri', 'ANKA İHA', 'AKINCI TİHA', 'HÜRJET', 'E-7T HİK'],
  Deniz: ['MİLGEM Korvet', 'İ-Sınıfı Fırkateyn', 'PREVEZE Denizaltı', 'TCG Anadolu', 'MARLİN İDA'],
  Uzay: ['GÖKTÜRK Uydusu', 'İMECE Uydusu'],
  Siber: ['SOME İstasyonu', 'EH Karıştırıcı'],
};
const PLATFORM_STATUS = ['Aktif', 'Görevde', 'Bakımda', 'Arızalı'];
const MANUFACTURERS_BY_DOMAIN: Record<string, string[]> = {
  Kara: ['FNSS', 'BMC', 'Otokar', 'ROKETSAN', 'ASELSAN'],
  Hava: ['TUSAŞ', 'BAYKAR', 'ASELSAN'],
  Deniz: ['ASELSAN', 'STM', 'Askerî Tersane', 'HAVELSAN'],
  Uzay: ['TUSAŞ', 'ASELSAN'],
  Siber: ['HAVELSAN', 'ASELSAN', 'STM'],
};

const MISSION_TYPES = [
  'Keşif-Gözetleme',
  'Taarruz',
  'Hava Savunma',
  'Deniz Karakol',
  'Elektronik Harp',
  'Lojistik Destek',
  'Eğitim Tatbikatı',
  'Sınır Güvenliği',
];
const MISSION_STATUS = ['Planlandı', 'İcrada', 'Tamamlandı', 'İptal'] as const;

const SENSOR_TYPES = ['AESA Radar', 'LPI Radar', 'EO/IR Kamera', 'Sonar', 'SIGINT', 'IFF Sorgulayıcı'];
const SENSOR_STATUS = ['Aktif', 'Pasif', 'Arızalı'];
const SENSOR_MANUFACTURERS = ['ASELSAN', 'HAVELSAN', 'TUSAŞ', 'METEKSAN'];
const FREQ_BANDS = ['L', 'S', 'C', 'X', 'Ku', 'Ka'];

const CLASSIFICATIONS = ['Dost', 'Düşman', 'Şüpheli', 'Bilinmeyen'] as const;
const TRACK_DOMAINS = ['Hava', 'Deniz', 'Kara'] as const;

// --- personel sözlükleri (rütbe seviyeleri sıralama/analiz için sayısaldır) ---
const RANKS: Array<{ ad: string; seviye: number; subay: boolean }> = [
  { ad: 'Er', seviye: 1, subay: false },
  { ad: 'Onbaşı', seviye: 2, subay: false },
  { ad: 'Çavuş', seviye: 3, subay: false },
  { ad: 'Astsubay Çavuş', seviye: 4, subay: false },
  { ad: 'Astsubay Kıdemli Çavuş', seviye: 5, subay: false },
  { ad: 'Başçavuş', seviye: 6, subay: false },
  { ad: 'Teğmen', seviye: 7, subay: true },
  { ad: 'Üsteğmen', seviye: 8, subay: true },
  { ad: 'Yüzbaşı', seviye: 9, subay: true },
  { ad: 'Binbaşı', seviye: 10, subay: true },
  { ad: 'Yarbay', seviye: 11, subay: true },
  { ad: 'Albay', seviye: 12, subay: true },
  { ad: 'Tuğgeneral', seviye: 13, subay: true },
  { ad: 'Tümgeneral', seviye: 14, subay: true },
];
/** Kademeye göre komutan rütbesi (Tim→Teğmen … Tugay→Tuğgeneral) */
const COMMANDER_RANK_BY_ECHELON: Record<string, string[]> = {
  Tim: ['Teğmen', 'Üsteğmen'],
  Bölük: ['Üsteğmen', 'Yüzbaşı'],
  Tabur: ['Binbaşı', 'Yarbay'],
  Alay: ['Albay'],
  Tugay: ['Tuğgeneral', 'Tümgeneral'],
};
const PERSONNEL_STATUS = ['Görevde', 'İzinli', 'Eğitimde', 'Sağlık Raporlu'];
const CLEARANCES = ['Tasnif Dışı', 'Hizmete Özel', 'Özel', 'Gizli', 'Çok Gizli'];

/** Roller ve tipik uzmanlıkları; platforma atanabilir roller işaretli */
const ROLES: Array<{ rol: string; uzmanliklar: string[]; platformlu: boolean }> = [
  { rol: 'Pilot', uzmanliklar: ['Avcı Pilotu', 'Helikopter Pilotu', 'İHA Pilotu', 'Nakliye Pilotu'], platformlu: true },
  { rol: 'Sensör Operatörü', uzmanliklar: ['Radar Operatörü', 'EO/IR Operatörü', 'Sonar Operatörü'], platformlu: true },
  { rol: 'Silah Sistemleri Operatörü', uzmanliklar: ['Füze Sistemleri', 'Top Sistemleri', 'Elektronik Harp'], platformlu: true },
  { rol: 'İstihbarat Subayı', uzmanliklar: ['SIGINT Analizi', 'Görüntü İstihbaratı', 'Hedef Tespit'], platformlu: false },
  { rol: 'Harekât Subayı', uzmanliklar: ['Müşterek Harekât', 'Ateş Desteği', 'Planlama'], platformlu: false },
  { rol: 'Muhabere Astsubayı', uzmanliklar: ['Telsiz Sistemleri', 'Kripto', 'Ağ Yönetimi'], platformlu: false },
  { rol: 'Bakım Teknisyeni', uzmanliklar: ['Aviyonik', 'Motor', 'Silah Bakımı', 'Elektronik'], platformlu: true },
  { rol: 'Keşif Uzmanı', uzmanliklar: ['SİHA Keşif', 'Sızma', 'Gözetleme'], platformlu: false },
  { rol: 'Sıhhiye', uzmanliklar: ['Muharebe Sıhhiyesi', 'Tahliye'], platformlu: false },
];

const GARRISON_SUFFIX = ['Kışlası', 'Garnizonu', 'Üssü', 'Deniz Üssü', 'Hava Üssü'];

function record(
  id: string,
  label: string,
  rows: Row[],
  columns: DatasetRecord['schema']['columns'],
): DatasetRecord {
  return {
    summary: {
      id,
      label,
      rowCount: rows.length,
      lastUpdated: '2026-07-01T06:00:00Z',
      version: VERSION,
    },
    schema: { columns },
    rows,
  };
}

export function generateDatasets(): DatasetRecord[] {
  const faker = new Faker({ locale: [tr, en] });
  faker.seed(SEED);

  // --- birlikler (120) — komutan_no us_adi personel üretiminden sonra dolar ---
  const birlikler: Row[] = Array.from({ length: 120 }, (_, i) => {
    const domain = faker.helpers.weightedArrayElement([
      { value: DOMAINS[0], weight: 40 },
      { value: DOMAINS[1], weight: 25 },
      { value: DOMAINS[2], weight: 20 },
      { value: DOMAINS[3], weight: 5 },
      { value: DOMAINS[4], weight: 10 },
    ]);
    const echelon = faker.helpers.arrayElement(ECHELONS);
    const bolge = faker.helpers.arrayElement(REGIONS);
    return {
      birlik_no: `BRL-${String(i + 1).padStart(3, '0')}`,
      ad: `${faker.number.int({ min: 1, max: 99 })}. ${domain} ${echelon}`,
      domain,
      kademe: echelon,
      bolge,
      durum: faker.helpers.arrayElement(UNIT_STATUS),
      personel: faker.number.int({ min: 30, max: 4500 }),
      hazirlik_orani: faker.number.int({ min: 55, max: 100 }),
      komutan_no: null as string | null, // backfill
      us_adi: `${bolge} ${faker.helpers.arrayElement(GARRISON_SUFFIX)}`,
    };
  });

  // --- platformlar (400) ---
  const platformlar: Row[] = Array.from({ length: 400 }, (_, i) => {
    const birlik = faker.helpers.arrayElement(birlikler);
    const domain = birlik.domain as string;
    const tip = faker.helpers.arrayElement(PLATFORM_TYPES[domain] ?? PLATFORM_TYPES.Kara);
    return {
      platform_no: `PLT-${String(i + 1).padStart(4, '0')}`,
      cagri_adi: `${faker.helpers.arrayElement(['ŞAHİN', 'KARTAL', 'BOZKURT', 'PARS', 'ATMACA', 'DOĞAN'])}-${faker.number.int({ min: 10, max: 99 })}`,
      tip,
      domain,
      birlik_no: birlik.birlik_no,
      durum: faker.helpers.weightedArrayElement([
        { value: PLATFORM_STATUS[0], weight: 45 },
        { value: PLATFORM_STATUS[1], weight: 25 },
        { value: PLATFORM_STATUS[2], weight: 20 },
        { value: PLATFORM_STATUS[3], weight: 10 },
      ]),
      yakit_orani: faker.number.int({ min: 5, max: 100 }),
      surat_knot: faker.number.int({ min: 0, max: domain === 'Hava' ? 480 : 40 }),
      enlem: faker.number.float({ min: 36, max: 42, fractionDigits: 4 }),
      boylam: faker.number.float({ min: 26, max: 45, fractionDigits: 4 }),
      kuyruk_no: `TC-${faker.number.int({ min: 1000, max: 9999 })}`,
      uretici: faker.helpers.arrayElement(
        MANUFACTURERS_BY_DOMAIN[domain] ?? MANUFACTURERS_BY_DOMAIN.Kara,
      ),
    };
  });
  const platformlarByBirlik = new Map<string, Row[]>();
  for (const p of platformlar) {
    const key = p.birlik_no as string;
    (platformlarByBirlik.get(key) ?? platformlarByBirlik.set(key, []).get(key)!).push(p);
  }

  // --- sensorler (250) ---
  const sensorler: Row[] = Array.from({ length: 250 }, (_, i) => {
    const platform = faker.helpers.arrayElement(platformlar);
    return {
      sensor_no: `SNS-${String(i + 1).padStart(4, '0')}`,
      tip: faker.helpers.arrayElement(SENSOR_TYPES),
      platform_no: platform.platform_no,
      menzil_km: faker.number.int({ min: 5, max: 450 }),
      durum: faker.helpers.weightedArrayElement([
        { value: SENSOR_STATUS[0], weight: 70 },
        { value: SENSOR_STATUS[1], weight: 20 },
        { value: SENSOR_STATUS[2], weight: 10 },
      ]),
      uretici: faker.helpers.arrayElement(SENSOR_MANUFACTURERS),
      frekans_bandi: `${faker.helpers.arrayElement(FREQ_BANDS)} Bandı`,
    };
  });

  // --- personel (~2500) — her birliğe 1 komutan + kadro ---
  const personel: Row[] = [];
  const personelByBirlik = new Map<string, Row[]>();
  let pIdx = 0;
  const makePerson = (
    birlik: Row,
    rol: string,
    rank: { ad: string; seviye: number },
    uzmanlik: string,
    platformNo: string | null,
  ): Row => {
    pIdx += 1;
    return {
      personel_no: `PER-${String(pIdx).padStart(5, '0')}`,
      ad_soyad: faker.person.fullName(),
      rutbe: rank.ad,
      rutbe_seviye: rank.seviye,
      rol,
      uzmanlik,
      birlik_no: birlik.birlik_no,
      platform_no: platformNo,
      durum: faker.helpers.weightedArrayElement([
        { value: PERSONNEL_STATUS[0], weight: 70 },
        { value: PERSONNEL_STATUS[1], weight: 12 },
        { value: PERSONNEL_STATUS[2], weight: 13 },
        { value: PERSONNEL_STATUS[3], weight: 5 },
      ]),
      guvenlik_belgesi: faker.helpers.weightedArrayElement([
        { value: CLEARANCES[0], weight: 10 },
        { value: CLEARANCES[1], weight: 25 },
        { value: CLEARANCES[2], weight: 30 },
        { value: CLEARANCES[3], weight: 25 },
        { value: CLEARANCES[4], weight: 10 },
      ]),
      tecrube_yili: faker.number.int({ min: 0, max: 32 }),
      ucus_saati: rol === 'Pilot' ? faker.number.int({ min: 200, max: 4500 }) : 0,
    };
  };

  for (const birlik of birlikler) {
    const echelon = birlik.kademe as string;
    const platformlariBirlik = platformlarByBirlik.get(birlik.birlik_no as string) ?? [];
    // Komutan
    const cmdRankAd = faker.helpers.arrayElement(
      COMMANDER_RANK_BY_ECHELON[echelon] ?? ['Binbaşı'],
    );
    const cmdRank = RANKS.find((r) => r.ad === cmdRankAd)!;
    const komutan = makePerson(birlik, 'Komutan', cmdRank, 'Birlik Komutanlığı', null);
    komutan.guvenlik_belgesi = faker.helpers.arrayElement(['Gizli', 'Çok Gizli']);
    personel.push(komutan);
    birlik.komutan_no = komutan.personel_no;
    // Kadro (12–28 kişi)
    const kadroN = faker.number.int({ min: 12, max: 28 });
    const roster: Row[] = [komutan];
    for (let k = 0; k < kadroN; k++) {
      const roleDef = faker.helpers.arrayElement(ROLES);
      const uzmanlik = faker.helpers.arrayElement(roleDef.uzmanliklar);
      const rank = faker.helpers.arrayElement(
        roleDef.rol === 'Bakım Teknisyeni' || roleDef.rol === 'Muhabere Astsubayı'
          ? RANKS.filter((r) => !r.subay && r.seviye <= 6)
          : RANKS.filter((r) => r.seviye >= 3 && r.seviye <= 11),
      );
      const platformNo =
        roleDef.platformlu && platformlariBirlik.length > 0
          ? (faker.helpers.arrayElement(platformlariBirlik).platform_no as string)
          : null;
      const p = makePerson(birlik, roleDef.rol, rank, uzmanlik, platformNo);
      personel.push(p);
      roster.push(p);
    }
    personelByBirlik.set(birlik.birlik_no as string, roster);
  }

  // --- gorevler (800) — icra eden birlik + o birlikten görev komutanı ---
  const gorevler: Row[] = Array.from({ length: 800 }, (_, i) => {
    const birlik = faker.helpers.arrayElement(birlikler);
    const roster = personelByBirlik.get(birlik.birlik_no as string) ?? [];
    const subaylar = roster.filter((p) => (p.rutbe_seviye as number) >= 7);
    const komutan = (subaylar.length ? subaylar : roster)[0];
    const status = faker.helpers.weightedArrayElement([
      { value: MISSION_STATUS[0], weight: 15 },
      { value: MISSION_STATUS[1], weight: 20 },
      { value: MISSION_STATUS[2], weight: 55 },
      { value: MISSION_STATUS[3], weight: 10 },
    ]);
    return {
      gorev_no: `GRV-${String(i + 1).padStart(4, '0')}`,
      tip: faker.helpers.arrayElement(MISSION_TYPES),
      durum: status,
      oncelik: faker.number.int({ min: 1, max: 5 }),
      baslangic: faker.date.between({ from: '2026-01-01', to: '2026-06-30' }).toISOString(),
      sure_saat: faker.number.int({ min: 1, max: 96 }),
      birlik_no: birlik.birlik_no,
      domain: birlik.domain,
      basari_puani: status === 'Tamamlandı' ? faker.number.int({ min: 40, max: 100 }) : null,
      hedef_bolge: faker.helpers.arrayElement(REGIONS),
      komutan_no: (komutan?.personel_no as string) ?? null,
    };
  });

  // --- izler (20.000) — DEĞİŞMEDİ (1M ölçekli, düşük risk) ---
  const izler: Row[] = Array.from({ length: 20_000 }, (_, i) => {
    const sensor = faker.helpers.arrayElement(sensorler);
    const classification = faker.helpers.weightedArrayElement([
      { value: CLASSIFICATIONS[0], weight: 45 },
      { value: CLASSIFICATIONS[1], weight: 15 },
      { value: CLASSIFICATIONS[2], weight: 15 },
      { value: CLASSIFICATIONS[3], weight: 25 },
    ]);
    const domain = faker.helpers.arrayElement(TRACK_DOMAINS);
    const izNo = `IZ-${String(i + 1).padStart(6, '0')}`;
    const surat = faker.number.int({ min: 0, max: domain === 'Hava' ? 900 : 45 });
    const irtifa = domain === 'Hava' ? faker.number.int({ min: 500, max: 45_000 }) : 0;
    const rota = faker.number.int({ min: 0, max: 359 });
    const enlem = faker.number.float({ min: 34, max: 43, fractionDigits: 4 });
    const boylam = faker.number.float({ min: 25, max: 45, fractionDigits: 4 });
    // Hesaplanan tehdit (bağlamsız: düşmanlık + kinematik) — mim tarafındaki
    // enricher ile AYNI motor; dummy'de bağlam yok, yaklaşma false kalır.
    const skor = _izScorer.skorla({
      izNo,
      domain,
      hostilityCode: SINIF_KOD[classification] ?? 'UNK',
      suratKnot: surat,
      irtifaFt: irtifa,
      rotaDerece: rota,
      enlem,
      boylam,
    });
    return {
      iz_no: izNo,
      siniflandirma: classification,
      domain,
      tespit_zamani: faker.date.between({ from: '2026-01-01', to: '2026-06-30' }).toISOString(),
      sensor_no: sensor.sensor_no,
      surat_knot: surat,
      irtifa_ft: irtifa,
      rota_derece: rota,
      enlem,
      boylam,
      tehdit_seviyesi:
        classification === 'Düşman'
          ? faker.number.int({ min: 3, max: 5 })
          : classification === 'Şüpheli'
            ? faker.number.int({ min: 2, max: 4 })
            : faker.number.int({ min: 1, max: 2 }),
      tehdit_skoru: skor.skor,
      tehdit_onceligi: skor.oncelik,
      yaklasiyor: skor.yaklasiyor,
    };
  });

  // --- istihbarat raporları (1.500) — multi-INT; besteci intel-feed.ts'de
  // (canlı source-intel servisiyle AYNI kompozisyon; kopya bilgi yok).
  // Canlı sistemde bu statik sete omurgadan akan raporlar eklenir.
  const fakerRnd: Rnd = {
    int: (min, max) => faker.number.int({ min, max }),
    pick: (arr) => faker.helpers.arrayElement(arr),
    weighted: (entries) => faker.helpers.weightedArrayElement(entries),
  };
  const istihbarat: Row[] = Array.from({ length: 1_500 }, (_, i) => {
    // %60'ı gerçek bir ize korelasyonlu (SIGINT/IMINT ise ilgiliIzNo dolar)
    const iz = faker.number.int({ min: 0, max: 9 }) < 6 ? faker.helpers.arrayElement(izler) : null;
    const track: IntelTrackRef | null = iz
      ? { izNo: iz.iz_no as string, enlem: iz.enlem as number, boylam: iz.boylam as number }
      : null;
    const m = buildIntel(
      fakerRnd,
      `RPT-${String(i + 1).padStart(6, '0')}`,
      faker.date.between({ from: '2026-01-01', to: '2026-06-30' }).toISOString(),
      track,
    );
    return {
      rapor_no: m.raporNo,
      tur: m.tur,
      baslik: m.baslik,
      ozet: m.ozet,
      kaynak: m.kaynak,
      kaynak_guvenilirligi: m.kaynakGuvenilirligi,
      bilgi_dogrulugu: m.bilgiDogrulugu,
      oncelik: m.oncelik,
      tehdit_tipi: m.tehditTipi,
      guven_yuzde: m.guvenYuzde,
      ilgili_iz_no: m.ilgiliIzNo,
      enlem: m.enlem,
      boylam: m.boylam,
      rapor_zamani: m.zaman,
    };
  });

  const izGecmisi: Row[] = izler.map((z, i) => ({
    gozlem_no: `GZL-${i + 1}`,
    iz_no: z.iz_no,
    tespit_zamani: z.tespit_zamani,
    sensor_no: z.sensor_no,
    domain: z.domain,
    tehdit_seviyesi: z.tehdit_seviyesi,
    enlem: z.enlem,
    boylam: z.boylam,
    surat_knot: z.surat_knot,
    irtifa_ft: z.irtifa_ft,
    rota_derece: z.rota_derece,
  }));

  return [
    record('birlikler', 'Birlikler', birlikler, [
      { name: 'birlik_no', type: 'string', nullable: false },
      { name: 'ad', type: 'string', nullable: false },
      { name: 'domain', type: 'string', nullable: false },
      { name: 'kademe', type: 'string', nullable: false },
      { name: 'bolge', type: 'string', nullable: false },
      { name: 'durum', type: 'string', nullable: false },
      { name: 'personel', type: 'integer', nullable: false },
      { name: 'hazirlik_orani', type: 'integer', nullable: false },
      { name: 'komutan_no', type: 'string', nullable: true },
      { name: 'us_adi', type: 'string', nullable: false },
    ]),
    record('platformlar', 'Platformlar', platformlar, [
      { name: 'platform_no', type: 'string', nullable: false },
      { name: 'cagri_adi', type: 'string', nullable: false },
      { name: 'tip', type: 'string', nullable: false },
      { name: 'domain', type: 'string', nullable: false },
      { name: 'birlik_no', type: 'string', nullable: false },
      { name: 'durum', type: 'string', nullable: false },
      { name: 'yakit_orani', type: 'integer', nullable: false },
      { name: 'surat_knot', type: 'integer', nullable: false },
      { name: 'enlem', type: 'double', nullable: false },
      { name: 'boylam', type: 'double', nullable: false },
      { name: 'kuyruk_no', type: 'string', nullable: false },
      { name: 'uretici', type: 'string', nullable: false },
    ]),
    record('gorevler', 'Görevler', gorevler, [
      { name: 'gorev_no', type: 'string', nullable: false },
      { name: 'tip', type: 'string', nullable: false },
      { name: 'durum', type: 'string', nullable: false },
      { name: 'oncelik', type: 'integer', nullable: false },
      { name: 'baslangic', type: 'timestamp', nullable: false },
      { name: 'sure_saat', type: 'integer', nullable: false },
      { name: 'birlik_no', type: 'string', nullable: false },
      { name: 'domain', type: 'string', nullable: false },
      { name: 'basari_puani', type: 'integer', nullable: true },
      { name: 'hedef_bolge', type: 'string', nullable: false },
      { name: 'komutan_no', type: 'string', nullable: true },
    ]),
    record('sensorler', 'Sensörler', sensorler, [
      { name: 'sensor_no', type: 'string', nullable: false },
      { name: 'tip', type: 'string', nullable: false },
      { name: 'platform_no', type: 'string', nullable: false },
      { name: 'menzil_km', type: 'integer', nullable: false },
      { name: 'durum', type: 'string', nullable: false },
      { name: 'uretici', type: 'string', nullable: false },
      { name: 'frekans_bandi', type: 'string', nullable: false },
    ]),
    record('personel', 'Personel', personel, [
      { name: 'personel_no', type: 'string', nullable: false },
      { name: 'ad_soyad', type: 'string', nullable: false },
      { name: 'rutbe', type: 'string', nullable: false },
      { name: 'rutbe_seviye', type: 'integer', nullable: false },
      { name: 'rol', type: 'string', nullable: false },
      { name: 'uzmanlik', type: 'string', nullable: false },
      { name: 'birlik_no', type: 'string', nullable: false },
      { name: 'platform_no', type: 'string', nullable: true },
      { name: 'durum', type: 'string', nullable: false },
      { name: 'guvenlik_belgesi', type: 'string', nullable: false },
      { name: 'tecrube_yili', type: 'integer', nullable: false },
      { name: 'ucus_saati', type: 'integer', nullable: false },
    ]),
    record('izler', 'İzler (Track)', izler, [
      { name: 'iz_no', type: 'string', nullable: false },
      { name: 'siniflandirma', type: 'string', nullable: false },
      { name: 'domain', type: 'string', nullable: false },
      { name: 'tespit_zamani', type: 'timestamp', nullable: false },
      { name: 'sensor_no', type: 'string', nullable: false },
      { name: 'surat_knot', type: 'integer', nullable: false },
      { name: 'irtifa_ft', type: 'integer', nullable: false },
      { name: 'rota_derece', type: 'integer', nullable: false },
      { name: 'enlem', type: 'double', nullable: false },
      { name: 'boylam', type: 'double', nullable: false },
      { name: 'tehdit_seviyesi', type: 'integer', nullable: false },
      { name: 'tehdit_skoru', type: 'integer', nullable: false },
      { name: 'tehdit_onceligi', type: 'string', nullable: false },
      { name: 'yaklasiyor', type: 'boolean', nullable: false },
    ]),
    record('istihbarat', 'İstihbarat Raporları', istihbarat, [
      { name: 'rapor_no', type: 'string', nullable: false },
      { name: 'tur', type: 'string', nullable: false },
      { name: 'baslik', type: 'string', nullable: false },
      { name: 'ozet', type: 'string', nullable: false },
      { name: 'kaynak', type: 'string', nullable: false },
      { name: 'kaynak_guvenilirligi', type: 'string', nullable: false },
      { name: 'bilgi_dogrulugu', type: 'integer', nullable: false },
      { name: 'oncelik', type: 'string', nullable: false },
      { name: 'tehdit_tipi', type: 'string', nullable: true },
      { name: 'guven_yuzde', type: 'integer', nullable: true },
      { name: 'ilgili_iz_no', type: 'string', nullable: true },
      { name: 'enlem', type: 'double', nullable: true },
      { name: 'boylam', type: 'double', nullable: true },
      { name: 'rapor_zamani', type: 'timestamp', nullable: false },
    ]),
    record('iz_gecmisi', 'İz Gözlem Geçmişi', izGecmisi, [
      { name: 'gozlem_no', type: 'string', nullable: false },
      { name: 'iz_no', type: 'string', nullable: false },
      { name: 'tespit_zamani', type: 'timestamp', nullable: false },
      { name: 'sensor_no', type: 'string', nullable: false },
      { name: 'domain', type: 'string', nullable: false },
      { name: 'tehdit_seviyesi', type: 'integer', nullable: false },
      { name: 'enlem', type: 'double', nullable: true },
      { name: 'boylam', type: 'double', nullable: true },
      { name: 'surat_knot', type: 'integer', nullable: true },
      { name: 'irtifa_ft', type: 'integer', nullable: true },
      { name: 'rota_derece', type: 'integer', nullable: true },
    ]),
  ];
}
