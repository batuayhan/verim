/**
 * AKIL YÜRÜTME ENRICHER'ı (Sprint 2 writeback) — DİNAMİK + KİNETİK ontoloji.
 *
 * Ayrı süreç (ingest/seed gibi). Belirli aralıkla CANLI izleri çok-kaynak
 * bağlamıyla (dost varlık konumları + korelasyonlu istihbarat) skorlar ve
 * sonucu object_item_threat'e YAZAR (Palantir "Functions/Actions" deseni:
 * fonksiyon nesnenin durumunu günceller). v_iz bu yazımı LEFT JOIN ile gösterir.
 *
 * Neden ayrı süreç + writeback (okuma-anı skorlama değil):
 *   • PERFORMANS: skor önceden hesaplanıp indekslenir → okuma O(1), çok büyük
 *     veride bile "en yüksek tehdit" sorgusu index taramasıdır.
 *   • MOSA: skorlayıcı port'tur (THREAT_SCORER) — motoru sök-tak.
 *   • KİNETİK: yalnız SON PENCEREDE görülen izler skorlanır → iş sınırlı,
 *     akış hızına ölçeklenir.
 */

import http from 'node:http';
import { Pool } from 'pg';
import {
  HeuristicThreatScorer,
  type BaglamGirdi,
  type DostVarlik,
  type IstihbaratTeyit,
  type IzGirdi,
  type ThreatScorer,
} from './threat-scorer';

const INTERVAL_MS = Number(process.env.REASONING_INTERVAL_MS ?? 10_000);
const PENCERE_DK = Number(process.env.REASONING_WINDOW_MIN ?? 15);
const INTEL_PENCERE_DK = Number(process.env.REASONING_INTEL_WINDOW_MIN ?? 60);

interface AktifIz extends IzGirdi {
  id: string; // object_item_id
}

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://localhost/verim_mip',
    max: 4,
    options: '-c TimeZone=UTC',
  });
  const scorer: ThreatScorer = new HeuristicThreatScorer();

  // Öz-migrasyon (mevcut volume'lar için de) — schema.sql yeni kurulumların kaynağı
  await pool.query(`
    CREATE TABLE IF NOT EXISTS object_item_threat (
      object_item_id bigint PRIMARY KEY REFERENCES object_item,
      threat_score   int  NOT NULL,
      threat_level   int  NOT NULL,
      priority_text  text NOT NULL,
      approaching    boolean NOT NULL DEFAULT false,
      rationale      jsonb NOT NULL,
      scored_at      timestamptz NOT NULL DEFAULT now()
    );
    -- NOT: threat_score üzerinde AYRI index YOK (bilinçli). Enricher bu tabloyu
    -- 10 sn'de bir TÜM izler için update ediyor; indeksli kolon skor değişince
    -- UPDATE'i non-HOT yapıp tabloyu şişiriyordu (1.7k satır → 130MB). Minik
    -- tabloda seq-scan+sort <1ms; index HOT update'i (şişmesizlik) hak etmiyor.
  `);

  let sonSkorlanan = 0;
  let sonDonguMs = 0;
  let dongu = 0;

  // Sağlık/metrik HTTP (INGEST tarzı; REASONING_HTTP_PORT=0 ile kapatılır)
  const port = Number(process.env.REASONING_HTTP_PORT ?? 9465);
  if (port) {
    http
      .createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ durum: 'ayakta', dongu, sonSkorlanan, sonDonguMs }));
      })
      .listen(port, () => console.log(`reasoning sağlık HTTP :${port}`))
      .unref();
  }

  async function dostVarliklar(): Promise<DostVarlik[]> {
    const r = await pool.query<{ ad: string; enlem: number; boylam: number }>(
      `SELECT oi.alternate_identification_text AS ad,
              loc.latitude_coordinate AS enlem, loc.longitude_coordinate AS boylam
       FROM materiel m
       JOIN object_item oi ON oi.object_item_id = m.materiel_id
       JOIN object_item_location loc ON loc.object_item_id = m.materiel_id
       WHERE m.materiel_category_code = 'PLATFORM'
         AND loc.latitude_coordinate IS NOT NULL AND loc.longitude_coordinate IS NOT NULL`,
    );
    return r.rows;
  }

  /** Korelasyonlu istihbarat: iz_no → teyit raporları (çok-kaynak füzyonu) */
  async function istihbaratHaritasi(): Promise<Map<string, IstihbaratTeyit[]>> {
    const r = await pool.query<{
      iz: string;
      guv: string;
      dog: number;
      yuzde: number | null;
    }>(
      `SELECT related_track_code AS iz, reliability_code AS guv,
              credibility_code AS dog, confidence_percent AS yuzde
       FROM intel_report
       WHERE related_track_code IS NOT NULL
         AND reporting_datetime > now() - make_interval(mins => $1)`,
      [INTEL_PENCERE_DK],
    );
    const m = new Map<string, IstihbaratTeyit[]>();
    for (const x of r.rows) {
      const l = m.get(x.iz) ?? [];
      l.push({ kaynakGuvenilirligi: x.guv, bilgiDogrulugu: x.dog, guvenYuzde: x.yuzde });
      m.set(x.iz, l);
    }
    return m;
  }

  async function aktifIzler(): Promise<AktifIz[]> {
    // Son pencerede gözlem üreten izler (reporting_data zaman index'i) → sınırlı iş
    const r = await pool.query<{
      id: string;
      iz_no: string;
      hostility: string;
      enlem: number;
      boylam: number;
      surat: number;
      irtifa: number;
      rota: number;
      domain: string;
    }>(
      `WITH aktif AS (
         SELECT DISTINCT subject_object_item_id AS id
         FROM reporting_data
         WHERE reporting_datetime > now() - make_interval(mins => $1)
       )
       SELECT oi.object_item_id AS id, oi.alternate_identification_text AS iz_no,
              hs.hostility_status_code AS hostility,
              loc.latitude_coordinate AS enlem, loc.longitude_coordinate AS boylam,
              COALESCE(loc.speed_quantity_knots, 0) AS surat,
              COALESCE(loc.altitude_feet_quantity, 0) AS irtifa,
              COALESCE(loc.bearing_angle_degrees, 0) AS rota,
              r.dimension_code AS domain
       FROM aktif a
       JOIN object_item oi ON oi.object_item_id = a.id
       JOIN object_item_hostility_status hs ON hs.object_item_id = oi.object_item_id
       JOIN object_item_location loc ON loc.object_item_id = oi.object_item_id
       JOIN LATERAL (
         SELECT dimension_code FROM reporting_data rd
         WHERE rd.subject_object_item_id = oi.object_item_id
         ORDER BY rd.reporting_datetime DESC, rd.reporting_data_id DESC LIMIT 1
       ) r ON true
       WHERE loc.latitude_coordinate IS NOT NULL AND loc.longitude_coordinate IS NOT NULL`,
      [PENCERE_DK],
    );
    return r.rows.map((x) => ({
      id: x.id,
      izNo: x.iz_no,
      domain: x.domain,
      hostilityCode: x.hostility,
      suratKnot: Number(x.surat),
      irtifaFt: Number(x.irtifa),
      rotaDerece: Number(x.rota),
      enlem: Number(x.enlem),
      boylam: Number(x.boylam),
    }));
  }

  async function donguCalistir(): Promise<void> {
    const t0 = Date.now();
    const [izler, dostlar, intel] = await Promise.all([
      aktifIzler(),
      dostVarliklar(),
      istihbaratHaritasi(),
    ]);
    // BUDAMA her döngüde, iz olmasa da: writeback CANLI resimdir. Aktif izler
    // her turda (10 sn) upsert ile tazelenir → tazelenmeyen satır artık aktif
    // değildir; kısa bir toleransla (90 sn) düşürülür. Akış tamamen durursa
    // tablo boşalır (dogru: aktif iz yok) — sayaç tavana yapışıp kalmaz.
    await pool.query(`DELETE FROM object_item_threat WHERE scored_at < now() - interval '90 seconds'`);
    if (izler.length === 0) {
      sonSkorlanan = 0;
      sonDonguMs = Date.now() - t0;
      return;
    }
    const ids: string[] = [];
    const skorlar: number[] = [];
    const seviyeler: number[] = [];
    const oncelikler: string[] = [];
    const yaklasan: boolean[] = [];
    const gerekceler: string[] = [];
    for (const iz of izler) {
      const baglam: BaglamGirdi = { dostVarliklar: dostlar, istihbarat: intel.get(iz.izNo) };
      const s = scorer.skorla(iz, baglam);
      ids.push(iz.id);
      skorlar.push(s.skor);
      seviyeler.push(s.seviye);
      oncelikler.push(s.oncelik);
      yaklasan.push(s.yaklasiyor);
      gerekceler.push(JSON.stringify(s.gerekce));
    }
    // Tek batch upsert — writeback (dinamik ontoloji)
    await pool.query(
      `INSERT INTO object_item_threat
         (object_item_id, threat_score, threat_level, priority_text, approaching, rationale)
       SELECT id, score, lvl, prio, appr, rat::jsonb
       FROM unnest($1::bigint[], $2::int[], $3::int[], $4::text[], $5::boolean[], $6::text[])
            AS t(id, score, lvl, prio, appr, rat)
       ON CONFLICT (object_item_id) DO UPDATE SET
         threat_score = EXCLUDED.threat_score, threat_level = EXCLUDED.threat_level,
         priority_text = EXCLUDED.priority_text, approaching = EXCLUDED.approaching,
         rationale = EXCLUDED.rationale, scored_at = now()`,
      [ids, skorlar, seviyeler, oncelikler, yaklasan, gerekceler],
    );
    sonSkorlanan = izler.length;
    sonDonguMs = Date.now() - t0;
  }

  console.log(
    `reasoning-enricher başladı (aralık ${INTERVAL_MS}ms, pencere ${PENCERE_DK}dk)`,
  );
  // Sürekli döngü — bir tur hatası tüm süreci düşürmesin (bir sonraki tur dener)
  for (;;) {
    try {
      await donguCalistir();
      if (dongu % 6 === 0) {
        console.log(`skorlanan iz=${sonSkorlanan}, döngü=${sonDonguMs}ms`);
      }
    } catch (e) {
      console.error('reasoning döngü hatası (devam):', (e as Error).message);
    }
    dongu++;
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
