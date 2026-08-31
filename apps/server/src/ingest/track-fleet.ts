/**
 * TrackFleet — bir kaynağın "gördüğü" izlerin bellek-içi filosu.
 * Kaynak üreticileri (sensör ağı, MIP4-IES) veritabanını BİLMEZ;
 * kendi filolarını simüle eder ve gözlemleri omurgaya yayınlar.
 * İzleri sisteme kazandıran tek yer ingest servisidir.
 */

const DOMAINS = ['Hava', 'Deniz', 'Kara'] as const;
const HOSTILITY = ['FR', 'HO', 'SUSPECT', 'UNK'] as const;

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(a: readonly T[]): T => a[rand(a.length)];

export interface Observation {
  izNo: string;
  sensorNo: string;
  zaman: string; // ISO
  domain: string;
  hostilityCode: string; // FR/HO/SUSPECT/UNK
  tehdit: number;
  enlem: number;
  boylam: number;
  irtifaFt: number;
  suratKnot: number;
  rotaDerece: number;
  bolge?: string; // geohash5 — ingest normalize aşamasında eklenir (geo-referans)
}

interface Track {
  izNo: string;
  domain: string;
  hostilityCode: string;
  tehdit: number;
  lat: number;
  lon: number;
  alt: number;
  spd: number;
  brg: number;
}

export class TrackFleet {
  private tracks: Track[] = [];
  private serial = 0;

  /**
   * @param prefix kaynak kimliği iz numarasına gömülür (IZ-A-000001 gibi) —
   *               kaynaklar arası çakışma imkânsız olur
   * @param sensorCount gözlemi raporlayan sensör havuzu (SNS-0001..)
   */
  constructor(
    private readonly prefix: string,
    initialCount: number,
    private readonly sensorCount = 250,
    /** Filo bu boyuta ulaşınca yeni iz doğmaz — sınırsız büyüme demoyu bozar */
    private readonly maxTracks = Number(process.env.MAX_TRACKS ?? 1500),
  ) {
    for (let i = 0; i < initialCount; i++) this.spawn();
  }

  private spawn(): Track {
    const domain = pick(DOMAINS);
    const hostilityCode = pick(HOSTILITY);
    const t: Track = {
      izNo: `IZ-${this.prefix}-${String(++this.serial).padStart(6, '0')}`,
      domain,
      hostilityCode,
      tehdit:
        hostilityCode === 'HO' ? 3 + rand(3) : hostilityCode === 'SUSPECT' ? 2 + rand(3) : 1 + rand(2),
      lat: 34 + Math.random() * 9,
      lon: 25 + Math.random() * 20,
      alt: domain === 'Hava' ? 500 + rand(44_500) : 0,
      spd: rand(domain === 'Hava' ? 900 : 45),
      brg: rand(360),
    };
    this.tracks.push(t);
    return t;
  }

  /** Bir tik: filo hareket eder, ara sıra büyür/sınıflandırma kayar; gözlemler döner. */
  tick(moves: number, spawns: number, tickSeconds: number): Observation[] {
    for (let s = 0; s < spawns && this.tracks.length < this.maxTracks; s++) this.spawn();

    const out: Observation[] = [];
    const count = Math.min(moves, this.tracks.length);
    for (let i = 0; i < count; i++) {
      const t = this.tracks[rand(this.tracks.length)];
      const dist = (t.spd * tickSeconds) / 3600; // deniz mili
      t.lat += (Math.cos((t.brg * Math.PI) / 180) * dist) / 60 + (Math.random() - 0.5) * 0.002;
      t.lon += (Math.sin((t.brg * Math.PI) / 180) * dist) / 54 + (Math.random() - 0.5) * 0.002;
      t.spd = Math.max(0, t.spd + rand(21) - 10);
      t.brg = (t.brg + rand(21) - 10 + 360) % 360;
      t.alt = Math.max(0, t.alt + rand(401) - 200);
      if (Math.random() < 0.002 && (t.hostilityCode === 'UNK' || t.hostilityCode === 'SUSPECT')) {
        t.hostilityCode = pick(['HO', 'FR', 'SUSPECT']);
        t.tehdit = t.hostilityCode === 'HO' ? 3 + rand(3) : 2 + rand(3);
      }
      out.push({
        izNo: t.izNo,
        sensorNo: `SNS-${String(1 + rand(this.sensorCount)).padStart(4, '0')}`,
        zaman: new Date().toISOString(),
        domain: t.domain,
        hostilityCode: t.hostilityCode,
        tehdit: t.tehdit,
        enlem: t.lat,
        boylam: t.lon,
        irtifaFt: t.alt,
        suratKnot: t.spd,
        rotaDerece: t.brg,
      });
    }
    return out;
  }

  get size(): number {
    return this.tracks.length;
  }
}
