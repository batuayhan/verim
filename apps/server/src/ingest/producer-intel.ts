/**
 * Kaynak 3 — Multi-INT istihbarat akışı: SIGINT/IMINT/OSINT/HUMINT
 * raporlarını `verim.istihbarat` topic'ine SANİYEDE ONLARCA mesaj hızında
 * yayınlayan sürekli servis. Veritabanını bilmez.
 *
 * Korelasyon için omurganın kendi gözlem topic'lerine SUB olur: yakın
 * zamanda gözlenen izlerin kayan bir örneklemini tutar; SIGINT/IMINT
 * raporları bu gerçek izlere bağlanır (çok kaynaklı füzyonun temeli).
 * Gerçek sistemde bu üreticinin yerini gerçek istihbarat füzyon hattı
 * alır — topic ve mesaj şekli aynı kalır.
 *
 *   KAFKA_BROKERS=redpanda:9092 INTEL_PER_SEC=25
 */

import { Kafka, logLevel } from 'kafkajs';
import { buildIntel, type IntelTrackRef, type Rnd } from './intel-feed';
import type { Observation } from './track-fleet';

const PER_SEC = Number(process.env.INTEL_PER_SEC ?? 25);
const TICK_MS = 500; // yarım saniyelik tiklerle akıcı yayın
const TOPIC = process.env.TOPIC ?? 'verim.istihbarat';
const TRACK_SAMPLE_MAX = 3_000;

/** Math.random tabanlı Rnd sürücüsü (canlı akışta determinizm gerekmez) */
const rnd: Rnd = {
  int: (min, max) => min + Math.floor(Math.random() * (max - min + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  weighted: (entries) => {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const e of entries) {
      r -= e.weight;
      if (r <= 0) return e.value;
    }
    return entries[entries.length - 1].value;
  },
};

async function main() {
  const kafka = new Kafka({
    clientId: 'verim-intel-feed',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
    retry: { retries: 30, initialRetryTime: 1000 },
  });

  // --- gözlem aboneliği: canlı iz örneklemi (korelasyon için) ---------------
  const tracks = new Map<string, IntelTrackRef>();
  const consumer = kafka.consumer({ groupId: 'verim-intel-feed' });
  await consumer.connect();
  await consumer.subscribe({ topics: ['verim.gozlemler'], fromBeginning: false });
  void consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const o = JSON.parse(message.value.toString()) as Observation;
        if (o.izNo && Number.isFinite(o.enlem) && Number.isFinite(o.boylam)) {
          tracks.set(o.izNo, { izNo: o.izNo, enlem: o.enlem, boylam: o.boylam });
          // kayan örneklem: tavanı aşınca en eski girişleri düş
          if (tracks.size > TRACK_SAMPLE_MAX) {
            const fazla = tracks.size - TRACK_SAMPLE_MAX;
            let i = 0;
            for (const k of tracks.keys()) {
              tracks.delete(k);
              if (++i >= fazla) break;
            }
          }
        }
      } catch {
        /* bozuk gözlem mesajı örneklemi etkilemesin */
      }
    },
  });

  const producer = kafka.producer();
  await producer.connect();
  console.log(`İstihbarat akışı başladı → ${TOPIC} (${PER_SEC} rapor/sn)`);

  let seq = 0;
  let sent = 0;
  let tick = 0;
  const trackList = () => [...tracks.values()];
  for (;;) {
    const t0 = Date.now();
    try {
      const n = Math.max(1, Math.round(PER_SEC * (TICK_MS / 1000)));
      const list = trackList();
      const msgs = Array.from({ length: n }, () => {
        const track = list.length > 0 && Math.random() < 0.6 ? rnd.pick(list) : null;
        const m = buildIntel(
          rnd,
          `RPT-C-${String(++seq).padStart(8, '0')}`,
          new Date().toISOString(),
          track,
        );
        return { key: m.raporNo, value: JSON.stringify(m) };
      });
      await producer.send({ topic: TOPIC, messages: msgs });
      sent += msgs.length;
    } catch (e) {
      console.error('yayın hatası (devam):', (e as Error).message);
    }
    if (++tick % 30 === 0)
      console.log(`tik ${tick}: yayınlanan=${sent}, iz örneklemi=${tracks.size}`);
    await new Promise((r) => setTimeout(r, Math.max(0, TICK_MS - (Date.now() - t0))));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
