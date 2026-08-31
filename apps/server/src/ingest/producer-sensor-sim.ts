/**
 * Kaynak 1 — "Sensör Ağı" simülatörü: gözlemleri JSON olarak
 * `verim.gozlemler` topic'ine yayınlar. Veritabanını bilmez; kendi
 * filosunu (IZ-A-...) simüle eder. Gerçek sistemde bu üreticinin yerini
 * gerçek sensör/veri-linki akışı alır — topic ve mesaj şekli aynı kalır.
 *
 *   KAFKA_BROKERS=redpanda:9092 TICK_MS=1000 MOVES_PER_TICK=150
 */

import { Kafka, logLevel } from 'kafkajs';
import { TrackFleet } from './track-fleet';

const TICK_MS = Number(process.env.TICK_MS ?? 1000);
const MOVES = Number(process.env.MOVES_PER_TICK ?? 150);
const SPAWNS = Number(process.env.SPAWN_PER_TICK ?? 1);
const TOPIC = process.env.TOPIC ?? 'verim.gozlemler';

async function main() {
  const kafka = new Kafka({
    clientId: 'verim-sensor-sim',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
    retry: { retries: 30, initialRetryTime: 1000 },
  });
  const producer = kafka.producer();
  await producer.connect();

  const fleet = new TrackFleet('A', Number(process.env.INITIAL_TRACKS ?? 300));
  console.log(`Sensör ağı kaynağı başladı → ${TOPIC} (${fleet.size} iz, tik=${TICK_MS}ms)`);

  let tick = 0;
  let sent = 0;
  for (;;) {
    const t0 = Date.now();
    try {
      const obs = fleet.tick(MOVES, SPAWNS, TICK_MS / 1000);
      await producer.send({
        topic: TOPIC,
        messages: obs.map((o) => ({ key: o.izNo, value: JSON.stringify(o) })),
      });
      sent += obs.length;
    } catch (e) {
      console.error('yayın hatası (devam):', (e as Error).message);
    }
    if (++tick % 15 === 0) console.log(`tik ${tick}: filo=${fleet.size}, yayınlanan=${sent}`);
    await new Promise((r) => setTimeout(r, Math.max(0, TICK_MS - (Date.now() - t0))));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
