/**
 * İz simülatörü — gerçek zamanlı kaynak taklidi (Maven-tarzı canlı sistem
 * için Faz A). Her tikte:
 *   - rastgele izler HAREKET eder: yeni ReportingData gözlemi eklenir
 *     (geçmiş birikir), ObjectItemLocation upsert edilir (son durum)
 *   - küçük olasılıkla sınıflandırma değişir (Şüpheli → Düşman gibi)
 *   - ara sıra YENİ İZ doğar
 *
 * Gerçek sistemde bu sürecin yerini MIP4-IES ingest'i alır — yazdığı
 * tablolar ve desen (gözlem ekle + son durumu upsert et) birebir aynıdır.
 *
 *   DATABASE_URL=... npx ts-node src/mim/simulator.ts
 *   TICK_MS=1000 MOVES_PER_TICK=200 SPAWN_PER_TICK=2
 */

import { Pool } from 'pg';

const TICK_MS = Number(process.env.TICK_MS ?? 1000);
const MOVES = Number(process.env.MOVES_PER_TICK ?? 200);
const SPAWNS = Number(process.env.SPAWN_PER_TICK ?? 2);
const RECLASS_PROB = Number(process.env.RECLASS_PROB ?? 0.01);

const DOMAINS = ['Hava', 'Deniz', 'Kara'];
const HOSTILITY = ['FR', 'HO', 'SUSPECT', 'UNK'];

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(a: T[]): T => a[rand(a.length)];

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://localhost/verim_mip',
    max: 2,
    options: '-c TimeZone=UTC',
  });

  // Sensör kimlikleri (gözlem kaynağı olarak) bir kere okunur
  const sensors = (
    await pool.query<{ id: string }>(
      `SELECT materiel_id::text AS id FROM materiel WHERE materiel_category_code = 'SENSOR'`,
    )
  ).rows.map((r) => r.id);
  if (sensors.length === 0) throw new Error('Seed edilmemiş veritabanı — önce seed çalıştır.');

  let nextId =
    Number(
      (
        await pool.query<{ m: string }>(
          `SELECT max(object_item_id)::text AS m FROM object_item WHERE category_code = 'TRACK'`,
        )
      ).rows[0].m ?? '4000000',
    ) + 1;
  let izCount = Number(
    (
      await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM object_item WHERE category_code = 'TRACK'`,
      )
    ).rows[0].n,
  );

  console.log(
    `Simülatör başladı: ${izCount} iz, tick=${TICK_MS}ms, hareket=${MOVES}/tik, yeni=${SPAWNS}/tik`,
  );

  let tick = 0;
  let obsTotal = 0;
  for (;;) {
    const t0 = Date.now();
    try {
      // --- hareket: rastgele MOVES iz için yeni gözlem + son durum ---
      const moved = await pool.query<{ n: string }>(
        `WITH secim AS (
           SELECT oi.object_item_id AS id, l.latitude_coordinate AS lat,
                  l.longitude_coordinate AS lon, l.speed_quantity_knots AS spd,
                  l.bearing_angle_degrees AS brg, l.altitude_feet_quantity AS alt
           FROM object_item oi
           JOIN object_item_location l ON l.object_item_id = oi.object_item_id
           WHERE oi.category_code = 'TRACK'
           ORDER BY random() LIMIT $1
         ),
         hareket AS (
           SELECT id,
             -- sürat (knot) ve rotaya göre kabaca yer değiştir + gürültü
             lat + cos(radians(brg)) * (spd * $2 / 3600.0) / 60.0 + (random() - 0.5) * 0.002 AS lat,
             lon + sin(radians(brg)) * (spd * $2 / 3600.0) / 54.0 + (random() - 0.5) * 0.002 AS lon,
             greatest(0, spd + (random() * 20 - 10)::int)           AS spd,
             ((brg + (random() * 20 - 10)::int) % 360 + 360) % 360  AS brg,
             greatest(0, alt + (random() * 400 - 200)::int)         AS alt
           FROM secim
         ),
         guncelle AS (
           UPDATE object_item_location l
           SET latitude_coordinate = h.lat, longitude_coordinate = h.lon,
               speed_quantity_knots = h.spd, bearing_angle_degrees = h.brg,
               altitude_feet_quantity = h.alt
           FROM hareket h WHERE l.object_item_id = h.id
         )
         INSERT INTO reporting_data (subject_object_item_id, source_materiel_id,
           reporting_datetime, dimension_code, threat_level_code,
           latitude_coordinate, longitude_coordinate, altitude_feet_quantity,
           speed_quantity_knots, bearing_angle_degrees)
         SELECT h.id, ($3::bigint[])[1 + floor(random() * $4)::int], now(),
                r.dimension_code, r.threat_level_code,
                h.lat, h.lon, h.alt, h.spd, h.brg
         FROM hareket h
         JOIN LATERAL (
           SELECT dimension_code, threat_level_code FROM reporting_data rd
           WHERE rd.subject_object_item_id = h.id
           ORDER BY rd.reporting_datetime DESC LIMIT 1
         ) r ON true
         RETURNING 1`,
        [MOVES, TICK_MS / 1000, sensors, sensors.length],
      );
      obsTotal += moved.rows.length;

      // --- sınıflandırma kayması (küçük olasılık) ---
      if (Math.random() < RECLASS_PROB * MOVES) {
        await pool.query(
          `UPDATE object_item_hostility_status
           SET hostility_status_code = $1
           WHERE object_item_id = (
             SELECT object_item_id FROM object_item_hostility_status
             WHERE hostility_status_code IN ('SUSPECT', 'UNK')
             ORDER BY random() LIMIT 1
           )`,
          [pick(['HO', 'FR', 'SUSPECT'])],
        );
      }

      // --- yeni iz doğuşu ---
      for (let s = 0; s < SPAWNS; s++) {
        const id = nextId++;
        izCount++;
        const domain = pick(DOMAINS);
        const lat = 34 + Math.random() * 9;
        const lon = 25 + Math.random() * 20;
        const spd = rand(domain === 'Hava' ? 900 : 45);
        const brg = rand(360);
        const alt = domain === 'Hava' ? 500 + rand(44_500) : 0;
        const host = pick(HOSTILITY);
        const threat = host === 'HO' ? 3 + rand(3) : host === 'SUSPECT' ? 2 + rand(3) : 1 + rand(2);
        const altId = `IZ-${String(izCount).padStart(6, '0')}`;
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          await c.query(
            `INSERT INTO object_item VALUES ($1, 'TRACK', $2, NULL)`,
            [id, altId],
          );
          await c.query(
            `INSERT INTO object_item_hostility_status VALUES ($1, $2)`,
            [id, host],
          );
          await c.query(
            `INSERT INTO object_item_location VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, lat, lon, alt, spd, brg],
          );
          await c.query(
            `INSERT INTO reporting_data (subject_object_item_id, source_materiel_id,
               reporting_datetime, dimension_code, threat_level_code,
               latitude_coordinate, longitude_coordinate, altitude_feet_quantity,
               speed_quantity_knots, bearing_angle_degrees)
             VALUES ($1, $2, now(), $3, $4, $5, $6, $7, $8, $9)`,
            [id, pick(sensors), domain, threat, lat, lon, alt, spd, brg],
          );
          await c.query('COMMIT');
        } catch (e) {
          await c.query('ROLLBACK');
          throw e;
        } finally {
          c.release();
        }
      }
    } catch (e) {
      console.error('tik hatası (devam ediliyor):', (e as Error).message);
    }

    tick++;
    if (tick % 10 === 0) {
      console.log(
        `tik ${tick}: toplam iz=${izCount}, bu oturumda gözlem=${obsTotal}`,
      );
    }
    const elapsed = Date.now() - t0;
    await new Promise((r) => setTimeout(r, Math.max(0, TICK_MS - elapsed)));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
