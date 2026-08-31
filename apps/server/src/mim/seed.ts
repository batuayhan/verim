/**
 * MIM staging seed — dummy üreticinin (generateDatasets) çıktısını
 * MIM entity izdüşümü tablolarına AYRIŞTIRARAK yükler. Böylece dummy ve
 * mim backend'leri birebir aynı veriyi sunar; eşdeğerlik testleri anlamlıdır.
 *
 * Kullanım:
 *   DATABASE_URL=postgres://localhost/verim_mip npx ts-node src/mim/seed.ts
 *   IZ_SCALE=500000  → izler tablosunu sentetik kayıtlarla bu toplam sayıya
 *                      tamamlar (hacim testi; eşdeğerlik testleri IZ_SCALE'siz koşar)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Faker, en, tr } from '@faker-js/faker';
import { Pool } from 'pg';
import { generateDatasets } from '../datasets/dummy/generators';
import type { Row } from '../datasets/dataset-provider';

const HOSTILITY: Record<string, string> = {
  Dost: 'FR',
  Düşman: 'HO',
  Şüpheli: 'SUSPECT',
  Bilinmeyen: 'UNK',
};

// alternate_identification_text → sayısal object_item_id blokları
// (ingest 8M'den başlar — çakışma imkânsız)
const BASE = { birlik: 1_000_000, platform: 2_000_000, sensor: 3_000_000, iz: 4_000_000, act: 5_000_000, person: 6_000_000 };

function cols<T>(rows: T[], pick: (r: T, i: number) => unknown[]): unknown[][] {
  const out: unknown[][] = [];
  rows.forEach((r, i) => {
    const vals = pick(r, i);
    vals.forEach((v, c) => ((out[c] ??= []) as unknown[]).push(v));
  });
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgres://localhost/verim_mip';
  const izTarget = Number(process.env.IZ_SCALE ?? 0);
  const pool = new Pool({ connectionString: url, max: 4 });

  // İDEMPOTENLİK KORUMASI — seed tek seferliktir ama compose, app her
  // `up -d app` dediğinde depends_on zinciriyle bu konteyneri YENİDEN
  // koşturur. schema.sql DROP ile başladığından korumasız her yeniden
  // koşum canlı DB'yi (ingest'in yarattığı izler dahil) SİLER ve ingest
  // kimlik cache'ini fantomlaştırır (05.07 FK krizlerinin kök nedeni).
  // Veri varsa hiçbir şey yapmadan çık; bilinçli sıfırlama FORCE_SEED=1.
  if (process.env.FORCE_SEED !== '1') {
    const mevcut = await pool
      .query<{ n: string }>(
        `SELECT count(*)::text AS n FROM object_item WHERE category_code = 'TRACK'`,
      )
      .then((r) => Number(r.rows[0]?.n ?? 0))
      .catch(() => 0); // tablo yoksa taze kurulumdur
    if (mevcut > 0) {
      console.log(`Veri mevcut (${mevcut} iz) — seed atlandı. Sıfırlamak için FORCE_SEED=1.`);
      await pool.end();
      return;
    }
  }

  console.log('Şema kuruluyor…');
  await pool.query(readFileSync(join(__dirname, '../../db/schema.sql'), 'utf8'));

  const data = new Map(generateDatasets().map((d) => [d.summary.id, d.rows]));
  const birlikler = data.get('birlikler')!;
  const platformlar = data.get('platformlar')!;
  const sensorler = data.get('sensorler')!;
  const gorevler = data.get('gorevler')!;
  const personel = data.get('personel')!;
  const izler = [...data.get('izler')!];

  // Hacim testi: aynı sözlükle sentetik iz üret (eşdeğerlik testinde kullanılmaz)
  if (izTarget > izler.length) {
    const f = new Faker({ locale: [tr, en] });
    f.seed(777);
    const cls = ['Dost', 'Düşman', 'Şüpheli', 'Bilinmeyen'];
    const doms = ['Hava', 'Deniz', 'Kara'];
    for (let i = izler.length; i < izTarget; i++) {
      const siniflandirma = f.helpers.arrayElement(cls);
      const domain = f.helpers.arrayElement(doms);
      izler.push({
        iz_no: `IZ-${String(i + 1).padStart(6, '0')}`,
        siniflandirma,
        domain,
        tespit_zamani: f.date.between({ from: '2026-01-01', to: '2026-06-30' }).toISOString(),
        sensor_no: (f.helpers.arrayElement(sensorler) as Row).sensor_no,
        surat_knot: f.number.int({ min: 0, max: domain === 'Hava' ? 900 : 45 }),
        irtifa_ft: domain === 'Hava' ? f.number.int({ min: 500, max: 45_000 }) : 0,
        rota_derece: f.number.int({ min: 0, max: 359 }),
        enlem: f.number.float({ min: 34, max: 43, fractionDigits: 4 }),
        boylam: f.number.float({ min: 25, max: 45, fractionDigits: 4 }),
        tehdit_seviyesi: f.number.int({ min: 1, max: 5 }),
      });
    }
    console.log(`İz sayısı sentetikle ${izler.length}'e tamamlandı`);
  }

  const birlikId = new Map(birlikler.map((b, i) => [b.birlik_no as string, BASE.birlik + i]));
  const platformId = new Map(platformlar.map((p, i) => [p.platform_no as string, BASE.platform + i]));
  const sensorId = new Map(sensorler.map((s, i) => [s.sensor_no as string, BASE.sensor + i]));
  const personId = new Map(personel.map((p, i) => [p.personel_no as string, BASE.person + i]));

  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // --- obj_item (hepsi) -----------------------------------------------
    const insObj = async (rows: Row[], base: number, cat: string, idKey: string, nameKey?: string) => {
      for (let off = 0; off < rows.length; off += 50_000) {
        const chunk = rows.slice(off, off + 50_000);
        const [ids, alts, names] = cols(chunk, (r, i) => [
          base + off + i,
          r[idKey],
          nameKey ? r[nameKey] : null,
        ]);
        await c.query(
          `INSERT INTO object_item (object_item_id, category_code, alternate_identification_text, name_text)
           SELECT t.id, $4, t.alt, t.nm
           FROM unnest($1::bigint[], $2::text[], $3::text[]) AS t(id, alt, nm)`,
          [ids, alts, names, cat],
        );
      }
    };
    await insObj(birlikler, BASE.birlik, 'ORGANISATION', 'birlik_no', 'ad');
    await insObj(platformlar, BASE.platform, 'MATERIEL', 'platform_no', 'cagri_adi');
    await insObj(sensorler, BASE.sensor, 'MATERIEL', 'sensor_no');
    await insObj(personel, BASE.person, 'PERSON', 'personel_no', 'ad_soyad');
    await insObj(izler, BASE.iz, 'TRACK', 'iz_no');

    // --- org (komutan + garnizon dahil) -----------------------------------
    {
      const [ids, ech, dom, reg, st, per, rr, cmd, gar] = cols(birlikler, (b, i) => [
        BASE.birlik + i, b.kademe, b.domain, b.bolge, b.durum, b.personel, b.hazirlik_orani,
        b.komutan_no ? (personId.get(b.komutan_no as string) ?? null) : null,
        b.us_adi ?? '',
      ]);
      await c.query(
        `INSERT INTO organisation SELECT * FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[], $8::bigint[], $9::text[])`,
        [ids, ech, dom, reg, st, per, rr, cmd, gar],
      );
    }

    // --- mat: platformlar + sensörler --------------------------------------
    {
      const [ids, tip, dom, st, fuel, spd, ser, man] = cols(platformlar, (p, i) => [
        BASE.platform + i, p.tip, p.domain, p.durum, p.yakit_orani, p.surat_knot,
        p.kuyruk_no, p.uretici,
      ]);
      await c.query(
        `INSERT INTO materiel (materiel_id, materiel_category_code, type_text, domain_code, operational_status_code, fuel_rate_quantity, speed_quantity_knots, serial_identification_text, manufacturer_text)
         SELECT t.id, 'PLATFORM', t.tip, t.dom, t.st, t.fuel, t.spd, t.ser, t.man
         FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::int[], $6::int[], $7::text[], $8::text[]) AS t(id, tip, dom, st, fuel, spd, ser, man)`,
        [ids, tip, dom, st, fuel, spd, ser, man],
      );
    }
    {
      const [ids, tip, st, rng, man, frq] = cols(sensorler, (s, i) => [
        BASE.sensor + i, s.tip, s.durum, s.menzil_km, s.uretici, s.frekans_bandi,
      ]);
      await c.query(
        `INSERT INTO materiel (materiel_id, materiel_category_code, type_text, operational_status_code, range_quantity_km, manufacturer_text, frequency_band_text)
         SELECT t.id, 'SENSOR', t.tip, t.st, t.rng, t.man, t.frq
         FROM unnest($1::bigint[], $2::text[], $3::text[], $4::int[], $5::text[], $6::text[]) AS t(id, tip, st, rng, man, frq)`,
        [ids, tip, st, rng, man, frq],
      );
    }

    // --- person + person_assignment ----------------------------------------
    {
      const [ids, rank, lvl, role, spec, st, clr, exp, fh] = cols(personel, (p, i) => [
        BASE.person + i, p.rutbe, p.rutbe_seviye, p.rol, p.uzmanlik, p.durum,
        p.guvenlik_belgesi, p.tecrube_yili, p.ucus_saati,
      ]);
      await c.query(
        `INSERT INTO person SELECT * FROM unnest($1::bigint[], $2::text[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::int[], $9::int[])`,
        [ids, rank, lvl, role, spec, st, clr, exp, fh],
      );
      const [pids, orgs, mats] = cols(personel, (p, i) => [
        BASE.person + i,
        birlikId.get(p.birlik_no as string),
        p.platform_no ? (platformId.get(p.platform_no as string) ?? null) : null,
      ]);
      await c.query(
        `INSERT INTO person_assignment SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::bigint[])`,
        [pids, orgs, mats],
      );
    }

    // --- holding (birlik→platform), assoc (sensör→platform) ----------------
    {
      const [orgs, mats] = cols(platformlar, (p, i) => [
        birlikId.get(p.birlik_no as string), BASE.platform + i,
      ]);
      await c.query(
        `INSERT INTO holding SELECT * FROM unnest($1::bigint[], $2::bigint[])`,
        [orgs, mats],
      );
    }
    {
      const [sens, plats] = cols(sensorler, (s, i) => [
        BASE.sensor + i, platformId.get(s.platform_no as string),
      ]);
      await c.query(
        `INSERT INTO object_item_association SELECT t.s, t.p, 'INSTALLED_ON' FROM unnest($1::bigint[], $2::bigint[]) AS t(s, p)`,
        [sens, plats],
      );
    }

    // --- obj_item_loc: platform konumu + iz kinematiği ----------------------
    {
      const [ids, lat, lon] = cols(platformlar, (p, i) => [BASE.platform + i, p.enlem, p.boylam]);
      await c.query(
        `INSERT INTO object_item_location (object_item_id, latitude_coordinate, longitude_coordinate)
         SELECT * FROM unnest($1::bigint[], $2::float8[], $3::float8[])`,
        [ids, lat, lon],
      );
    }
    for (let off = 0; off < izler.length; off += 50_000) {
      const chunk = izler.slice(off, off + 50_000);
      const [ids, lat, lon, alt, spd, brg] = cols(chunk, (z, i) => [
        BASE.iz + off + i, z.enlem, z.boylam, z.irtifa_ft, z.surat_knot, z.rota_derece,
      ]);
      await c.query(
        `INSERT INTO object_item_location SELECT * FROM unnest($1::bigint[], $2::float8[], $3::float8[], $4::int[], $5::int[], $6::int[])`,
        [ids, lat, lon, alt, spd, brg],
      );
    }

    // --- iz: hostility + rptd ------------------------------------------------
    for (let off = 0; off < izler.length; off += 50_000) {
      const chunk = izler.slice(off, off + 50_000);
      const [ids, host] = cols(chunk, (z, i) => [
        BASE.iz + off + i, HOSTILITY[z.siniflandirma as string] ?? 'UNK',
      ]);
      await c.query(
        `INSERT INTO object_item_hostility_status SELECT * FROM unnest($1::bigint[], $2::text[])`,
        [ids, host],
      );
      const [ref, src, dttm, dim, thr, lat2, lon2, alt2, spd2, brg2] = cols(chunk, (z, i) => [
        BASE.iz + off + i, sensorId.get(z.sensor_no as string),
        z.tespit_zamani, z.domain, z.tehdit_seviyesi,
        z.enlem, z.boylam, z.irtifa_ft, z.surat_knot, z.rota_derece,
      ]);
      await c.query(
        `INSERT INTO reporting_data (subject_object_item_id, source_materiel_id, reporting_datetime, dimension_code, threat_level_code,
                                     latitude_coordinate, longitude_coordinate, altitude_feet_quantity, speed_quantity_knots, bearing_angle_degrees)
         SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::timestamptz[], $4::text[], $5::int[],
                              $6::float8[], $7::float8[], $8::int[], $9::int[], $10::int[])`,
        [ref, src, dttm, dim, thr, lat2, lon2, alt2, spd2, brg2],
      );
    }

    // --- istihbarat raporları (multi-INT; canlı source-intel aynı tabloya akıtır)
    {
      const raporlar = data.get('istihbarat')!;
      const [code, disc, title, txt, src, rel, cred, pri, thr, conf, trk, lat, lon, dttm] =
        cols(raporlar, (r) => [
          r.rapor_no, r.tur, r.baslik, r.ozet, r.kaynak,
          r.kaynak_guvenilirligi, r.bilgi_dogrulugu, r.oncelik, r.tehdit_tipi,
          r.guven_yuzde, r.ilgili_iz_no, r.enlem, r.boylam, r.rapor_zamani,
        ]);
      await c.query(
        `INSERT INTO intel_report (report_code, intel_discipline_code, report_title,
           report_text, source_name, reliability_code, credibility_code, priority_code,
           threat_type_text, confidence_percent, related_track_code,
           latitude_coordinate, longitude_coordinate, reporting_datetime)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
                              $6::text[], $7::int[], $8::text[], $9::text[], $10::int[],
                              $11::text[], $12::float8[], $13::float8[], $14::timestamptz[])`,
        [code, disc, title, txt, src, rel, cred, pri, thr, conf, trk, lat, lon, dttm],
      );
    }

    // --- görevler -------------------------------------------------------------
    {
      const [ids, alts] = cols(gorevler, (g, i) => [BASE.act + i, g.gorev_no]);
      await c.query(
        `INSERT INTO action (action_id, alternate_identification_text) SELECT * FROM unnest($1::bigint[], $2::text[])`,
        [ids, alts],
      );
      const [tids, tip, pri, start, dur, st, suc, tgt] = cols(gorevler, (g, i) => [
        BASE.act + i, g.tip, g.oncelik, g.baslangic, g.sure_saat, g.durum, g.basari_puani,
        g.hedef_bolge ?? '',
      ]);
      await c.query(
        `INSERT INTO action_task SELECT * FROM unnest($1::bigint[], $2::text[], $3::int[], $4::timestamptz[], $5::int[], $6::text[], $7::int[], $8::text[])`,
        [tids, tip, pri, start, dur, st, suc, tgt],
      );
      const [aids, orgs, cmds] = cols(gorevler, (g, i) => [
        BASE.act + i,
        birlikId.get(g.birlik_no as string),
        g.komutan_no ? (personId.get(g.komutan_no as string) ?? null) : null,
      ]);
      await c.query(
        `INSERT INTO action_resource SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::bigint[])`,
        [aids, orgs, cmds],
      );
    }

    await c.query(`INSERT INTO meta (version) VALUES ($1)`, [
      izTarget > 20_000 ? `mim-c2-v3-x${izler.length}` : 'mim-c2-v3',
    ]);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }

  // track_current backfill: iz-başına EN SON rapor (v_iz bunu okur; canlı akışta
  // ingest günceller). DISTINCT ON, subject_time index'ini kullanır (skip-scan).
  console.log('track_current dolduruluyor…');
  await pool.query(`
    INSERT INTO track_current (object_item_id, reporting_datetime, source_materiel_id, dimension_code, threat_level_code)
    SELECT DISTINCT ON (subject_object_item_id)
      subject_object_item_id, reporting_datetime, source_materiel_id, dimension_code, threat_level_code
    FROM reporting_data
    ORDER BY subject_object_item_id, reporting_datetime DESC, reporting_data_id DESC
    ON CONFLICT (object_item_id) DO NOTHING;
  `);

  console.log("View'lar kuruluyor…");
  await pool.query(readFileSync(join(__dirname, '../../db/views.sql'), 'utf8'));

  for (const v of ['v_birlik', 'v_platform', 'v_gorev', 'v_sensor', 'v_personel', 'v_iz', 'v_istihbarat']) {
    const r = await pool.query(`SELECT count(*)::int AS n FROM ${v}`);
    console.log(`${v}: ${r.rows[0].n} satır`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
