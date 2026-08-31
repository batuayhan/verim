/**
 * Neo4j graf yükleyici — VARLIK AĞINI (birlik/platform/sensör/görev/personel
 * ve aralarındaki ilişkiler) gerçek graf veritabanına yükler. Bağlantı
 * analizi grafı Cypher ile bu depoyu sorgular (bellek-içi değil, gerçek
 * graf servisi — Palantir link store karşılığı).
 *
 * İz/gözlem telemetrisi (milyonlar, ingest'le akan) graf DB'ye konmaz;
 * o linkler zaman-serisi deposundan (Postgres) çözülür. Gerçek sistemlerde
 * de mimari böyle ayrışır: varlık grafı ≠ telemetri deposu.
 *
 * Kullanım (idempotent, tek seferlik):
 *   NEO4J_URL=bolt://graphdb:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=... \
 *     node dist/mim/graph-load.js
 */

import neo4j from 'neo4j-driver';
import { generateDatasets } from '../datasets/dummy/generators';
import { MIM_MODEL } from './mim-ontology';
import type { Row } from '../datasets/dataset-provider';

const ENTITY = new Set(['birlik', 'platform', 'sensor', 'gorev', 'personel']);
const PK: Record<string, string> = {
  birlik: 'birlik_no', platform: 'platform_no', sensor: 'sensor_no',
  gorev: 'gorev_no', personel: 'personel_no',
};
const nameOf = (t: string, r: Row): string =>
  String(r.ad ?? r.ad_soyad ?? r.cagri_adi ?? r[PK[t]] ?? '');

async function main() {
  const url = process.env.NEO4J_URL ?? 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER ?? 'neo4j';
  const password = process.env.NEO4J_PASSWORD ?? 'verim-graph';
  const driver = neo4j.driver(url, neo4j.auth.basic(user, password));

  const data = new Map(generateDatasets().map((d) => [d.summary.id, d.rows]));
  const rowsByType: Record<string, Row[]> = {
    birlik: data.get('birlikler')!, platform: data.get('platformlar')!,
    sensor: data.get('sensorler')!, gorev: data.get('gorevler')!,
    personel: data.get('personel')!,
  };

  const session = driver.session();
  try {
    // İdempotenlik: veri varsa atla (FORCE_GRAPH=1 ile sıfırla)
    if (process.env.FORCE_GRAPH !== '1') {
      const r = await session.run('MATCH (n:Entity) RETURN count(n) AS n');
      const n = r.records[0]?.get('n')?.toNumber?.() ?? 0;
      if (n > 0) {
        console.log(`Graf zaten dolu (${n} düğüm) — atlandı. Sıfırlamak için FORCE_GRAPH=1.`);
        return;
      }
    }
    console.log('Graf yükleniyor…');
    await session.run('MATCH (n:Entity) DETACH DELETE n');
    await session.run('CREATE INDEX entity_id IF NOT EXISTS FOR (n:Entity) ON (n.id)');

    // --- düğümler ---
    let toplamDugum = 0;
    for (const [tip, rows] of Object.entries(rowsByType)) {
      const nodes = rows.map((r) => ({
        id: `${tip}::${String(r[PK[tip]] ?? '')}`,
        pk: String(r[PK[tip]] ?? ''),
        tip,
        label: nameOf(tip, r),
      }));
      for (let off = 0; off < nodes.length; off += 5000) {
        await session.run(
          `UNWIND $batch AS n
           CREATE (:Entity {id: n.id, pk: n.pk, tip: n.tip, label: n.label})`,
          { batch: nodes.slice(off, off + 5000) },
        );
      }
      toplamDugum += nodes.length;
    }

    // --- kenarlar (varlık ilişkileri; ontoloji anahtar-join'i) ---
    let toplamKenar = 0;
    for (const link of MIM_MODEL.linkTypes) {
      if (!ENTITY.has(link.fromObjectType) || !ENTITY.has(link.toObjectType)) continue;
      const src = rowsByType[link.fromObjectType];
      const tgt = rowsByType[link.toObjectType];
      const idx = new Map<string, string[]>();
      for (const r of tgt) {
        const kv = String(r[link.toKey] ?? '');
        if (kv) (idx.get(kv) ?? idx.set(kv, []).get(kv)!).push(String(r[PK[link.toObjectType]] ?? ''));
      }
      const rels: Array<{ from: string; to: string }> = [];
      for (const r of src) {
        const kv = String(r[link.fromKey] ?? '');
        if (!kv) continue;
        const spk = String(r[PK[link.fromObjectType]] ?? '');
        for (const tpk of idx.get(kv) ?? []) {
          if (link.fromObjectType === link.toObjectType && tpk === spk) continue;
          rels.push({
            from: `${link.fromObjectType}::${spk}`,
            to: `${link.toObjectType}::${tpk}`,
          });
        }
      }
      for (let off = 0; off < rels.length; off += 10000) {
        await session.run(
          `UNWIND $batch AS e
           MATCH (a:Entity {id: e.from}), (b:Entity {id: e.to})
           CREATE (a)-[:LINK {tip: $lt, label: $ll}]->(b)`,
          { batch: rels.slice(off, off + 10000), lt: link.apiName, ll: link.displayName },
        );
      }
      toplamKenar += rels.length;
    }
    console.log(`Graf yüklendi: ${toplamDugum} düğüm, ${toplamKenar} kenar`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
