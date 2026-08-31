import { kerteriz } from './geo';
import {
  HeuristicCoaEngine,
  VARSAYILAN_ROE,
  type CoaBaglam,
  type Hedef,
} from './coa-engine';

const US = { enlem: 39.93, boylam: 32.85 };

// Üsse doğru gelen, hızlı, düşman, yüksek tehditli hava hedefi
const dusmanHedef: Hedef = {
  izNo: 'IZ-A-9',
  domain: 'Hava',
  hostilityCode: 'HO',
  siniflandirmaGuveni: 0.9,
  tehditSkoru: 82,
  suratKnot: 480,
  rotaDerece: kerteriz({ enlem: 39.0, boylam: 32.0 }, US),
  enlem: 39.0,
  boylam: 32.0,
};

const baglam: CoaBaglam = {
  varliklar: [
    { ad: 'SAM-1', tip: 'HİSAR-A', domain: 'Hava', menzilKm: 120, hazir: true, ...US },
    { ad: 'Deniz-1', tip: 'Korvet', domain: 'Deniz', menzilKm: 40, hazir: true, enlem: 36, boylam: 33 },
  ],
};

describe('HeuristicCoaEngine', () => {
  const e = new HeuristicCoaEngine();

  it('düşman + yüksek tehdit + menzilde varlık → ROE serbest, angajman önerir', () => {
    const r = e.uret(dusmanHedef, baglam);
    expect(r.roeDurumu).toBe('serbest');
    expect(r.oneri).not.toBeNull();
    expect(r.oneri!.angajmanTipi).toBe('Etkisiz Hale Getir');
    expect(r.oneri!.varlik).toBe('SAM-1'); // domain uyumlu + menzilde
    expect(r.oneri!.basariYuzde).toBeGreaterThan(0);
  });

  it('DOST hedef → ROE yasak, öneri yalnız İzle-Takip (insan-döngü güvenliği)', () => {
    const r = e.uret({ ...dusmanHedef, hostilityCode: 'FR' }, baglam);
    expect(r.roeDurumu).toBe('yasak');
    expect(r.oneri!.angajmanTipi).toBe('İzle-Takip');
    expect(r.roeIhlalleri.join(' ')).toContain('dost');
  });

  it('düşük tehdit skoru → angajman eşiği altında, İzle-Takip önerilir', () => {
    const r = e.uret({ ...dusmanHedef, tehditSkoru: 30 }, baglam);
    expect(r.oneri!.angajmanTipi).toBe('İzle-Takip');
    expect(r.roeIhlalleri.join(' ')).toContain('eşiği');
  });

  it('düşük pozitif kimlik → ROE kısıtlı, etkisiz kılma roeUygun=false', () => {
    const r = e.uret({ ...dusmanHedef, siniflandirmaGuveni: 0.3 }, baglam);
    expect(r.roeDurumu).toBe('kısıtlı');
    const etkisiz = r.secenekler.find((s) => s.angajmanTipi === 'Etkisiz Hale Getir');
    expect(etkisiz?.roeUygun).toBe(false);
  });

  it('korumalı bölgeye yakın → yüksek risk + ROE ihlali', () => {
    // korumalı bölge hedefin YAKININDA (yan hasar riski)
    const r = e.uret(dusmanHedef, {
      ...baglam,
      korumaliBolgeler: [{ ad: 'Sivil Yerleşim', enlem: 39.0, boylam: 32.05, yaricapKm: 10 }],
    });
    expect(r.roeIhlalleri.join(' ')).toContain('Korumalı');
    expect(r.oneri!.risk).toBe('Yüksek');
  });

  it('DETERMİNİST + varsayılan ROE config dışarıdan verilebilir (MOSA)', () => {
    const a = e.uret(dusmanHedef, baglam);
    const b = e.uret(dusmanHedef, baglam, VARSAYILAN_ROE);
    expect(a).toEqual(b);
  });
});
