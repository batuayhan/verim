/**
 * Kaynak 2 — "MIP4-IES" simülatörü: gözlemleri MIP4-IES tarzı XML rapor
 * setleri halinde `verim.mip4ies` topic'ine yayınlar (IZ-B-... filosu).
 * XML şekli gerçek IES şemasının SADELEŞTİRİLMİŞ bir temsilcisidir —
 * amaç, ingest'in çok-formatlı normalizasyonunu gerçekçi kılmak. Gerçek
 * MIP4-IES şeması elimize geçtiğinde yalnızca bu üretici ve ingest'teki
 * parse fonksiyonu ona uyarlanır.
 *
 *   KAFKA_BROKERS=redpanda:9092 BATCH_MS=3000 REPORTS_PER_BATCH=40
 */

import { Kafka, logLevel } from 'kafkajs';
import { TrackFleet, type Observation } from './track-fleet';

const BATCH_MS = Number(process.env.BATCH_MS ?? 3000);
const REPORTS = Number(process.env.REPORTS_PER_BATCH ?? 40);
const TOPIC = process.env.TOPIC ?? 'verim.mip4ies';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toXml(batch: Observation[]): string {
  const reports = batch
    .map(
      (o) => `  <ObjectItemReport>
    <AlternateIdentificationText>${esc(o.izNo)}</AlternateIdentificationText>
    <HostilityStatusCode>${o.hostilityCode}</HostilityStatusCode>
    <ReportingDatetime>${o.zaman}</ReportingDatetime>
    <SourceAlternateIdentificationText>${esc(o.sensorNo)}</SourceAlternateIdentificationText>
    <DimensionCode>${esc(o.domain)}</DimensionCode>
    <ThreatLevelCode>${o.tehdit}</ThreatLevelCode>
    <Location latitude="${o.enlem.toFixed(5)}" longitude="${o.boylam.toFixed(5)}"
              altitudeFeet="${o.irtifaFt}" speedKnots="${o.suratKnot}" bearingDegrees="${o.rotaDerece}"/>
  </ObjectItemReport>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ObjectItemReportSet xmlns="urn:verim:mip4ies:sim">
${reports}
</ObjectItemReportSet>`;
}

async function main() {
  const kafka = new Kafka({
    clientId: 'verim-mip4ies-sim',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
    retry: { retries: 30, initialRetryTime: 1000 },
  });
  const producer = kafka.producer();
  await producer.connect();

  const fleet = new TrackFleet('B', Number(process.env.INITIAL_TRACKS ?? 150));
  console.log(`MIP4-IES kaynağı başladı → ${TOPIC} (${fleet.size} iz, batch=${BATCH_MS}ms)`);

  let batchNo = 0;
  for (;;) {
    const t0 = Date.now();
    try {
      const obs = fleet.tick(REPORTS, batchNo % 5 === 0 ? 1 : 0, BATCH_MS / 1000);
      await producer.send({
        topic: TOPIC,
        messages: [{ key: `batch-${batchNo}`, value: toXml(obs) }],
      });
    } catch (e) {
      console.error('yayın hatası (devam):', (e as Error).message);
    }
    if (++batchNo % 10 === 0) console.log(`batch ${batchNo}: filo=${fleet.size}`);
    await new Promise((r) => setTimeout(r, Math.max(0, BATCH_MS - (Date.now() - t0))));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
