/**
 * Ingest servisi — omurgadaki (Redpanda/Kafka) kaynak topic'lerini tüketir,
 * mesajları ortak gözlem şekline NORMALIZE eder ve MIM staging'e yazar:
 *
 *   verim.gozlemler  (JSON, sensör ağı)   ─┐
 *   verim.mip4ies    (XML rapor setleri)  ─┤─► normalize ─► MIM upsert deseni:
 *   ...yeni kaynak = yeni parse fonksiyonu ┘    • bilinmeyen iz → ObjectItem yarat
 *                                               • ReportingData'ya gözlem EKLE (geçmiş)
 *                                               • Location/Hostility son durumu UPSERT
 *
 * Verim'in geri kalanı (view'lar, motorlar, frontend) ingest'i hiç görmez;
 * watermark versiyonu reporting_data büyüdükçe kendiliğinden ilerler.
 *
 * Not: consumer offset'leri broker'da tutulur; broker kalıcı volume'suz
 * yeniden yaratılırsa kaynaklar zaten yeniden yayına başlar (demo kabulü).
 */

import { XMLParser } from 'fast-xml-parser';
import { CompressionCodecs, CompressionTypes, Kafka, logLevel } from 'kafkajs';
import SnappyCodec from 'kafkajs-snappy';
import { Pool } from 'pg';
import type { IntelMessage } from './intel-feed';
import { IngestMetrikleri } from './metrics';
import { gozlemNormalize, istihbaratNormalize } from './normalize';
import type { Observation } from './track-fleet';

// Snappy sıkıştırma desteği — gerçek Kafka üreticileri sık sık Snappy/lz4 kullanır;
// kafkajs Snappy'yi yerleşik ÇÖZEMEZ ve sıkıştırılmış bir mesaj tüketiciyi decode
// katmanında ÇÖKERTİR (poison-message crash-loop). Codec'i kaydederek dayanıklı kıl.
CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

const TOPIC_JSON = 'verim.gozlemler';
const TOPIC_XML = 'verim.mip4ies';
const TOPIC_INTEL = 'verim.istihbarat';
/** İstihbarat raporu saklama süresi (saniyede onlarca rapor birikir) */
const INTEL_RETENTION_HOURS = Number(process.env.INTEL_RETENTION_HOURS ?? 48);

// --- parse: kaynak formatı → HAM nesne (doğrulama normalize'da) --------------
// Parse yalnız sözdizimini çözer; alan/tip/sınır doğrulaması normalize.ts'in
// işidir (bozuk → karantina). Buradaki `unknown` kasıtlı: ham veriye `as` ile
// güvenmeyiz.

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

function parseJsonHam(value: string): unknown[] {
  return [JSON.parse(value)];
}

function parseMip4IesHam(value: string): unknown[] {
  const doc = xml.parse(value) as {
    ObjectItemReportSet?: { ObjectItemReport?: unknown };
  };
  const raw = doc.ObjectItemReportSet?.ObjectItemReport;
  if (!raw) return [];
  const reports = (Array.isArray(raw) ? raw : [raw]) as Array<Record<string, any>>;
  // XML attribute'larını ortak gözlem şekline eşle (sayısallar Number ile; eksik
  // alan NaN olur ve normalize aşamasında reddedilir — sessiz NaN yazımı yok).
  return reports.map((r) => ({
    izNo: String(r.AlternateIdentificationText),
    sensorNo: String(r.SourceAlternateIdentificationText),
    zaman: String(r.ReportingDatetime),
    domain: String(r.DimensionCode),
    hostilityCode: String(r.HostilityStatusCode),
    tehdit: Number(r.ThreatLevelCode),
    enlem: Number(r.Location?.latitude),
    boylam: Number(r.Location?.longitude),
    irtifaFt: Number(r.Location?.altitudeFeet),
    suratKnot: Number(r.Location?.speedKnots),
    rotaDerece: Number(r.Location?.bearingDegrees),
  }));
}

// --- ana akış ------------------------------------------------------------------

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://localhost/verim_mip',
    max: 4,
    options: '-c TimeZone=UTC',
  });

  const metrik = new IngestMetrikleri();
  metrik.sunucuBaslat(); // /saglik + /metrik (INGEST_HTTP_PORT=0 ile kapatılabilir)

  // Öz-migrasyon: mevcut volume'larda da çalışsın diye şema ekleri idempotent
  // olarak burada garanti edilir (schema.sql yeni kurulumların kanonik kaynağı).
  //   • ingest_karantina — ölü-mektup: bozuk/eşleşmeyen mesaj sessizce ATILMAZ
  //   • reporting_data dedup unique index — Kafka yeniden teslimi geçmişi çiftlemesin
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ingest_karantina (
      karantina_id bigserial PRIMARY KEY,
      topic        text NOT NULL,
      sebep        text NOT NULL,
      ham_payload  text NOT NULL,
      zaman        timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ingest_karantina_zaman_idx ON ingest_karantina (zaman DESC);
  `);
  // Dedup index'i mevcut yinelenen satırlar yüzünden ya da SIKIŞTIRMA açık bir
  // hypertable'da (CREATE UNIQUE INDEX desteklenmez) BAŞARISIZ olabilir. Kritik
  // olan index'in VAR OLMASI; yoksa ON CONFLICT eklemek anlamsız, ama zaten
  // varsa (ör. seed kurmuş, sonra sıkıştırma açılmış) ON CONFLICT'i mutlaka
  // kullan — yoksa Kafka yeniden teslimi ölümcül unique-violation crash-loop'una
  // döner (gözlem yazımı tamamen durur).
  let dedupAktif = false;
  try {
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS reporting_data_dedup_idx
         ON reporting_data (subject_object_item_id, reporting_datetime, source_materiel_id)`,
    );
    dedupAktif = true;
  } catch (e) {
    const varMi = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'reporting_data_dedup_idx'`,
    );
    if ((varMi.rowCount ?? 0) > 0) {
      dedupAktif = true;
      console.warn(
        `dedup index oluşturulamadı ama MEVCUT — ON CONFLICT aktif: ${(e as Error).message}`,
      );
    } else {
      console.error(`dedup index kurulamadı (dedup'suz devam) — ${(e as Error).message}`);
    }
  }

  /** Ölü-mektup: bozuk/eşleşmeyen mesajları sebebiyle sakla (asla sessiz kayıp) */
  async function writeQuarantine(
    kayitlar: Array<{ topic: string; sebep: string; ham: string }>,
  ): Promise<void> {
    if (kayitlar.length === 0) return;
    await pool.query(
      `INSERT INTO ingest_karantina (topic, sebep, ham_payload)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[])`,
      [kayitlar.map((k) => k.topic), kayitlar.map((k) => k.sebep), kayitlar.map((k) => k.ham.slice(0, 8000))],
    );
    for (const k of kayitlar) metrik.karantinaEkle(k.sebep);
  }

  // Kimlik cache'leri: alt kimlik → sayısal object_item_id.
  // DİKKAT: cache DB'nin yanında ikinci bir doğruluk kaynağıdır — DB bir
  // felaketten (disk bozulması, yedekten dönüş) ESKİ bir duruma dönerse
  // cache'teki id'ler fantomlaşır ve her reporting_data insert'i FK hatasıyla
  // düşer (05.07 crash-loop'unun kök nedeni). Bu yüzden cache'ler
  // TAZELENEBİLİR ve FK hatasında bir kez tazeleyip yeniden denenir.
  const sensorId = new Map<string, string>();
  const trackId = new Map<string, string>();

  async function warmCaches(): Promise<void> {
    sensorId.clear();
    trackId.clear();
    for (const r of (
      await pool.query<{ alt: string; id: string }>(
        `SELECT oi.alternate_identification_text AS alt, oi.object_item_id::text AS id
         FROM object_item oi JOIN materiel m ON m.materiel_id = oi.object_item_id
         WHERE m.materiel_category_code = 'SENSOR'`,
      )
    ).rows)
      sensorId.set(r.alt, r.id);
    for (const r of (
      await pool.query<{ alt: string; id: string }>(
        `SELECT alternate_identification_text AS alt, object_item_id::text AS id
         FROM object_item WHERE category_code = 'TRACK'`,
      )
    ).rows)
      trackId.set(r.alt, r.id);
  }

  await warmCaches();
  console.log(`Ingest başladı: ${trackId.size} bilinen iz, ${sensorId.size} sensör`);

  const kafka = new Kafka({
    clientId: 'verim-ingest',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
    retry: { retries: 30, initialRetryTime: 1000 },
  });
  const consumer = kafka.consumer({ groupId: 'verim-ingest' });
  await consumer.connect();
  await consumer.subscribe({
    topics: [TOPIC_JSON, TOPIC_XML, TOPIC_INTEL],
    fromBeginning: false,
  });

  /** İstihbarat raporları — FK'sız değer-bazlı yazım (iz referansı serbest) */
  async function writeIntel(reports: IntelMessage[]): Promise<void> {
    if (reports.length === 0) return;
    const col = <T>(f: (m: IntelMessage) => T) => reports.map(f);
    await pool.query(
      `INSERT INTO intel_report (report_code, intel_discipline_code, report_title,
         report_text, source_name, reliability_code, credibility_code, priority_code,
         threat_type_text, confidence_percent, related_track_code,
         latitude_coordinate, longitude_coordinate, reporting_datetime)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
                            $6::text[], $7::int[], $8::text[], $9::text[], $10::int[],
                            $11::text[], $12::float8[], $13::float8[], $14::timestamptz[])
       ON CONFLICT (report_code) DO NOTHING`,
      [
        col((m) => m.raporNo), col((m) => m.tur), col((m) => m.baslik),
        col((m) => m.ozet), col((m) => m.kaynak), col((m) => m.kaynakGuvenilirligi),
        col((m) => m.bilgiDogrulugu), col((m) => m.oncelik), col((m) => m.tehditTipi),
        col((m) => m.guvenYuzde), col((m) => m.ilgiliIzNo),
        col((m) => m.enlem), col((m) => m.boylam), col((m) => m.zaman),
      ],
    );
    metrik.yazilanIstihbarat += reports.length;
  }

  // Retention: sürekli akan raporlar sınırsız birikmesin (10 dk'da bir buda)
  setInterval(() => {
    pool
      .query(
        `DELETE FROM intel_report
         WHERE reporting_datetime < now() - make_interval(hours => $1)`,
        [INTEL_RETENTION_HOURS],
      )
      .then((r) => {
        if ((r.rowCount ?? 0) > 0)
          console.log(`retention: ${r.rowCount} eski istihbarat raporu budandı`);
      })
      .catch((e) => console.error('retention hatası (devam):', (e as Error).message));
  }, 600_000).unref();

  async function writeObservations(valid: Observation[]): Promise<number> {
      // --- bilinmeyen izleri yarat ---
      const unknown = [...new Set(valid.map((o) => o.izNo))].filter((n) => !trackId.has(n));
      if (unknown.length > 0) {
        const byNo = new Map(valid.map((o) => [o.izNo, o])); // ilk gözlem yeterli
        const rows = await pool.query<{ alt: string; id: string }>(
          `WITH yeni AS (
             SELECT nextval('object_item_ingest_seq') AS id, t.alt
             FROM unnest($1::text[]) AS t(alt)
           ),
           oi AS (
             INSERT INTO object_item
             SELECT id, 'TRACK', alt, NULL FROM yeni
             ON CONFLICT (alternate_identification_text) DO NOTHING
             RETURNING object_item_id, alternate_identification_text
           )
           SELECT alternate_identification_text AS alt, object_item_id::text AS id FROM oi`,
          [unknown],
        );
        for (const r of rows.rows) {
          trackId.set(r.alt, r.id);
          const o = byNo.get(r.alt)!;
          await pool.query(
            `INSERT INTO object_item_hostility_status VALUES ($1, $2)
             ON CONFLICT (object_item_id) DO NOTHING`,
            [r.id, o.hostilityCode],
          );
          await pool.query(
            `INSERT INTO object_item_location VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (object_item_id) DO NOTHING`,
            [r.id, o.enlem, o.boylam, o.irtifaFt, o.suratKnot, o.rotaDerece],
          );
          metrik.yaratilanIz++;
        }
      }

      const ready = valid.filter((o) => trackId.has(o.izNo));
      if (ready.length > 0) {
        // --- gözlem geçmişi (append) — tek multi-row insert ---
        // dedupAktif ise ON CONFLICT DO NOTHING: aynı (iz, an, sensör) yeniden
        // teslimi çiftlenmez. rowCount < gönderilen → aradaki fark yinelenendir.
        const col = <T>(f: (o: Observation) => T) => ready.map(f);
        const r = await pool.query(
          `INSERT INTO reporting_data (subject_object_item_id, source_materiel_id,
             reporting_datetime, dimension_code, threat_level_code,
             latitude_coordinate, longitude_coordinate, altitude_feet_quantity,
             speed_quantity_knots, bearing_angle_degrees)
           SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::timestamptz[], $4::text[], $5::int[],
                                $6::float8[], $7::float8[], $8::int[], $9::int[], $10::int[])
           ${dedupAktif ? 'ON CONFLICT (subject_object_item_id, reporting_datetime, source_materiel_id) DO NOTHING' : ''}`,
          [
            col((o) => trackId.get(o.izNo)),
            col((o) => sensorId.get(o.sensorNo)),
            col((o) => o.zaman),
            col((o) => o.domain),
            col((o) => o.tehdit),
            col((o) => o.enlem),
            col((o) => o.boylam),
            col((o) => o.irtifaFt),
            col((o) => o.suratKnot),
            col((o) => o.rotaDerece),
          ],
        );

        // --- son durum upsert'leri (iz başına EN SON gözlem; batch içi dedup) ---
        const latest = new Map<string, Observation>();
        for (const o of ready) latest.set(o.izNo, o); // sıralı — son kazanır
        const ls = [...latest.values()];
        const lcol = <T>(f: (o: Observation) => T) => ls.map(f);
        await pool.query(
          `INSERT INTO object_item_location
           SELECT * FROM unnest($1::bigint[], $2::float8[], $3::float8[], $4::int[], $5::int[], $6::int[])
           ON CONFLICT (object_item_id) DO UPDATE SET
             latitude_coordinate = EXCLUDED.latitude_coordinate,
             longitude_coordinate = EXCLUDED.longitude_coordinate,
             altitude_feet_quantity = EXCLUDED.altitude_feet_quantity,
             speed_quantity_knots = EXCLUDED.speed_quantity_knots,
             bearing_angle_degrees = EXCLUDED.bearing_angle_degrees`,
          [
            lcol((o) => trackId.get(o.izNo)),
            lcol((o) => o.enlem),
            lcol((o) => o.boylam),
            lcol((o) => o.irtifaFt),
            lcol((o) => o.suratKnot),
            lcol((o) => o.rotaDerece),
          ],
        );
        await pool.query(
          `INSERT INTO object_item_hostility_status
           SELECT * FROM unnest($1::bigint[], $2::text[])
           ON CONFLICT (object_item_id) DO UPDATE SET
             hostility_status_code = EXCLUDED.hostility_status_code`,
          [lcol((o) => trackId.get(o.izNo)), lcol((o) => o.hostilityCode)],
        );
        // track_current: iz-başına EN SON rapor özeti (v_iz bunu okur — LATERAL
        // yerine tek-satır JOIN). Kaynak sensör çözülemezse satır atlanır.
        await pool.query(
          `INSERT INTO track_current
             (object_item_id, reporting_datetime, source_materiel_id, dimension_code, threat_level_code)
           SELECT * FROM unnest($1::bigint[], $2::timestamptz[], $3::bigint[], $4::text[], $5::int[])
           ON CONFLICT (object_item_id) DO UPDATE SET
             reporting_datetime = EXCLUDED.reporting_datetime,
             source_materiel_id = EXCLUDED.source_materiel_id,
             dimension_code = EXCLUDED.dimension_code,
             threat_level_code = EXCLUDED.threat_level_code`,
          [
            lcol((o) => trackId.get(o.izNo)),
            lcol((o) => o.zaman),
            lcol((o) => sensorId.get(o.sensorNo)),
            lcol((o) => o.domain),
            lcol((o) => o.tehdit),
          ],
        );
        const yazilan = r.rowCount ?? ready.length;
        metrik.yazilanGozlem += yazilan;
        metrik.yinelenenAtlanan += ready.length - yazilan;
        for (const o of ready) if (o.bolge) metrik.bolgeEkle(o.bolge);
      }
      return ready.length;
  }

  await consumer.run({
    eachBatch: async ({ batch, heartbeat }) => {
      const t0 = Date.now();
      const karantina: Array<{ topic: string; sebep: string; ham: string }> = [];

      // İstihbarat topic'i ayrı yoldan akar (gözlem normalizasyonuna girmez)
      if (batch.topic === TOPIC_INTEL) {
        const oncekiIntel = metrik.yazilanIstihbarat;
        const reports: IntelMessage[] = [];
        for (const m of batch.messages) {
          if (!m.value) continue;
          metrik.tuketilen++;
          const s = m.value.toString();
          let ham: unknown;
          try {
            ham = JSON.parse(s);
          } catch (e) {
            karantina.push({ topic: batch.topic, sebep: `sözdizimi: ${(e as Error).message}`, ham: s });
            continue;
          }
          const n = istihbaratNormalize(ham);
          if (n.ok) reports.push(n.deger);
          else karantina.push({ topic: batch.topic, sebep: n.sebep, ham: s });
        }
        await writeIntel(reports);
        await writeQuarantine(karantina);
        metrik.sonBatchMs = Date.now() - t0;
        await heartbeat();
        if (Math.floor(metrik.yazilanIstihbarat / 1000) !== Math.floor(oncekiIntel / 1000)) {
          console.log(`yazılan istihbarat raporu=${metrik.yazilanIstihbarat}, karantina=${metrik.karantina}`);
        }
        return;
      }

      // Gözlem topic'leri: parse → normalize (doğrula) → sensör eşleşmesi.
      // Bozuk, sınır-dışı veya bilinmeyen-sensörlü mesajlar SESSIZCE atılmaz →
      // karantinaya sebebiyle yazılır.
      const oncekiGozlem = metrik.yazilanGozlem;
      const valid: Observation[] = [];
      for (const m of batch.messages) {
        if (!m.value) continue;
        metrik.tuketilen++;
        const s = m.value.toString();
        let hamlar: unknown[];
        try {
          hamlar = batch.topic === TOPIC_XML ? parseMip4IesHam(s) : parseJsonHam(s);
        } catch (e) {
          karantina.push({ topic: batch.topic, sebep: `sözdizimi: ${(e as Error).message}`, ham: s });
          continue;
        }
        for (const ham of hamlar) {
          const n = gozlemNormalize(ham);
          if (!n.ok) {
            karantina.push({ topic: batch.topic, sebep: n.sebep, ham: JSON.stringify(ham) });
            continue;
          }
          if (!sensorId.has(n.deger.sensorNo)) {
            karantina.push({
              topic: batch.topic,
              sebep: `bilinmeyen_sensor: ${n.deger.sensorNo}`,
              ham: JSON.stringify(ham),
            });
            continue;
          }
          valid.push(n.deger);
        }
      }

      try {
        await writeObservations(valid);
      } catch (e) {
        const code = (e as { code?: string }).code;
        metrik.sonHata = `${code ?? ''} ${(e as Error).message}`.trim();
        // FK ihlali = cache ile DB ayrışmış: cache'i tazele + bir kez yeniden dene
        if (code === '23503') {
          console.error('FK ihlali — kimlik cache\'leri DB\'den tazelenip yeniden deneniyor');
          await warmCaches();
          await writeObservations(valid.filter((o) => sensorId.has(o.sensorNo)));
        } else if (code === '40P01') {
          // TimescaleDB chunk-kısıt oluşumu eşzamanlı insert'lerle kısa süreli
          // deadlock verebilir (upsert'ler idempotent) — kısa bekle + yeniden dene
          console.error('Deadlock (TimescaleDB chunk) — kısa bekleyip yeniden deneniyor');
          await new Promise((r) => setTimeout(r, 200));
          await writeObservations(valid);
        } else {
          throw e;
        }
      }

      await writeQuarantine(karantina);
      metrik.sonBatchMs = Date.now() - t0;
      await heartbeat();
      if (Math.floor(metrik.yazilanGozlem / 2000) !== Math.floor(oncekiGozlem / 2000)) {
        console.log(
          `yazılan gözlem=${metrik.yazilanGozlem}, yaratılan iz=${metrik.yaratilanIz}, ` +
            `yinelenen=${metrik.yinelenenAtlanan}, karantina=${metrik.karantina}`,
        );
      }
    },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
