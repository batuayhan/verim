import { aciFarki, kerteriz, mesafeKm, yaklasmaKatsayisi } from './geo';
import { HeuristicThreatScorer, type BaglamGirdi, type IzGirdi } from './threat-scorer';

const ANKARA = { enlem: 39.93, boylam: 32.85 };
const ISTANBUL = { enlem: 41.01, boylam: 28.98 };

describe('geo', () => {
  it('mesafeKm ~ Ankara-İstanbul 350 km civarı', () => {
    const d = mesafeKm(ANKARA, ISTANBUL);
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(400);
  });
  it('kerteriz Ankara→İstanbul kuzeybatı (270..320)', () => {
    const b = kerteriz(ANKARA, ISTANBUL);
    expect(b).toBeGreaterThan(270);
    expect(b).toBeLessThan(320);
  });
  it('aciFarki dairesel (350 vs 10 → 20)', () => {
    expect(aciFarki(350, 10)).toBe(20);
  });
  it('yaklasmaKatsayisi: hedefe doğru rota → ~1, ters → 0', () => {
    const b = kerteriz(ANKARA, ISTANBUL);
    expect(yaklasmaKatsayisi({ ...ANKARA, rotaDerece: b }, ISTANBUL)).toBeCloseTo(1, 1);
    expect(yaklasmaKatsayisi({ ...ANKARA, rotaDerece: (b + 180) % 360 }, ISTANBUL)).toBe(0);
  });
});

const dusmanHizli: IzGirdi = {
  izNo: 'IZ-A-1',
  domain: 'Hava',
  hostilityCode: 'HO',
  suratKnot: 600,
  irtifaFt: 500,
  rotaDerece: kerteriz({ enlem: 39.0, boylam: 32.0 }, ANKARA),
  enlem: 39.0,
  boylam: 32.0,
};

const baglamAnkara: BaglamGirdi = {
  dostVarliklar: [{ ad: 'Ana Üs', ...ANKARA }],
};

describe('HeuristicThreatScorer', () => {
  const s = new HeuristicThreatScorer();

  it('düşman + hızlı + alçak + üsse yaklaşan iz → yüksek skor, yaklaşıyor=true', () => {
    const r = s.skorla(dusmanHizli, baglamAnkara);
    expect(r.skor).toBeGreaterThan(55);
    expect(['Kritik', 'Yüksek']).toContain(r.oncelik);
    expect(r.yaklasiyor).toBe(true);
    expect(r.gerekce).toHaveLength(4); // açıklanabilir: 4 etken
  });

  it('dost + yavaş + uzak iz → düşük skor', () => {
    const dost: IzGirdi = {
      izNo: 'IZ-A-2',
      domain: 'Deniz',
      hostilityCode: 'FR',
      suratKnot: 12,
      irtifaFt: 0,
      rotaDerece: 90,
      enlem: 36.0,
      boylam: 33.0,
    };
    const r = s.skorla(dost, baglamAnkara);
    expect(r.skor).toBeLessThan(20);
    expect(['Düşük', 'Asgari']).toContain(r.oncelik);
  });

  it('ONTOLOJİDEN BAĞIMSIZ: bilinmeyen hostility kodu çökmez, nötr taban kullanır', () => {
    const r = s.skorla({ ...dusmanHizli, hostilityCode: 'YENI_KOD_2030' }, baglamAnkara);
    expect(r.skor).toBeGreaterThan(0);
    expect(r.gerekce[0].aciklama).toContain('YENI_KOD_2030');
  });

  it('istihbarat teyidi skoru YÜKSELTİR (çok-kaynak füzyonu)', () => {
    const temel = s.skorla(dusmanHizli, baglamAnkara).skor;
    const teyitli = s.skorla(dusmanHizli, {
      ...baglamAnkara,
      istihbarat: [
        { kaynakGuvenilirligi: 'A', bilgiDogrulugu: 1, guvenYuzde: 95 },
        { kaynakGuvenilirligi: 'B', bilgiDogrulugu: 2, guvenYuzde: 85 },
      ],
    }).skor;
    expect(teyitli).toBeGreaterThan(temel);
  });

  it('DETERMİNİST: aynı girdi → aynı skor + gerekçe toplamı ≈ skor', () => {
    const a = s.skorla(dusmanHizli, baglamAnkara);
    const b = s.skorla(dusmanHizli, baglamAnkara);
    expect(a).toEqual(b);
    const toplam = a.gerekce.reduce((x, f) => x + f.katki, 0);
    expect(Math.abs(toplam - a.skor)).toBeLessThan(1.5); // yuvarlama payı
  });
});
