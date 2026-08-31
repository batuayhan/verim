import { geohash, gozlemNormalize, istihbaratNormalize } from './normalize';

const gecerliGozlem = {
  izNo: 'IZ-A-000123',
  sensorNo: 'SNS-0007',
  zaman: '2026-07-07T08:30:00.000Z',
  domain: 'Hava',
  hostilityCode: 'HO',
  tehdit: 4,
  enlem: 39.9,
  boylam: 32.85,
  irtifaFt: 24000,
  suratKnot: 420,
  rotaDerece: 135,
};

const gecerliIntel = {
  raporNo: 'RPT-C-00000042',
  tur: 'SIGINT',
  baslik: 'Emisyon',
  ozet: 'X-Bant radar emisyonu',
  kaynak: 'ED-3 Kiti',
  kaynakGuvenilirligi: 'B',
  bilgiDogrulugu: 2,
  oncelik: 'Yüksek',
  tehditTipi: 'Atış Kontrol Radarı',
  guvenYuzde: 88,
  ilgiliIzNo: 'IZ-A-000123',
  enlem: 39.9,
  boylam: 32.85,
  zaman: '2026-07-07T08:30:00.000Z',
};

describe('gozlemNormalize — yapısal doğrulama', () => {
  it('geçerli gözlemi kabul eder ve bölge (geohash) ekler', () => {
    const r = gozlemNormalize(gecerliGozlem);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.deger.bolge).toHaveLength(5);
  });

  // ONTOLOJİDEN BAĞIMSIZLIK: bilinmeyen domain/hostility DEĞERLERİ ingest'i
  // BOZMAZ — değer kümesi ontolojinindir, ingest dayatmaz. Ontoloji yarın yeni
  // bir domain eklerse bu dosyaya dokunmadan akış devam eder.
  it('ontolojiye ait enum değerlerini DAYATMAZ (bilinmeyen domain geçer)', () => {
    expect(gozlemNormalize({ ...gecerliGozlem, domain: 'Uzay' }).ok).toBe(true);
    expect(gozlemNormalize({ ...gecerliGozlem, hostilityCode: 'YENI_KOD' }).ok).toBe(true);
    expect(gozlemNormalize({ ...gecerliGozlem, tehdit: 42 }).ok).toBe(true);
  });

  it('koordinat DÜNYA sınırını aşarsa karantina (evrensel kural)', () => {
    const r = gozlemNormalize({ ...gecerliGozlem, enlem: 95 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.sebep).toContain('enlem');
  });

  it('eksik/NaN sayısal alanı reddeder (MIP4-IES eksik attribute senaryosu)', () => {
    expect(gozlemNormalize({ ...gecerliGozlem, boylam: Number('yok') }).ok).toBe(false);
    expect(gozlemNormalize({ ...gecerliGozlem, irtifaFt: -5 }).ok).toBe(false);
  });

  it('ISO olmayan zamanı ve boş kimliği reddeder', () => {
    expect(gozlemNormalize({ ...gecerliGozlem, zaman: 'dün' }).ok).toBe(false);
    expect(gozlemNormalize({ ...gecerliGozlem, izNo: '' }).ok).toBe(false);
  });
});

describe('istihbaratNormalize', () => {
  it('geçerli raporu kabul eder; bilinmeyen disiplin de geçer (ontoloji)', () => {
    expect(istihbaratNormalize(gecerliIntel).ok).toBe(true);
    expect(istihbaratNormalize({ ...gecerliIntel, tur: 'CYBINT' }).ok).toBe(true);
  });
  it('yüzde 0..100 evrensel sınırını uygular', () => {
    expect(istihbaratNormalize({ ...gecerliIntel, guvenYuzde: 150 }).ok).toBe(false);
  });
  it('null konum ve null ilgili iz kabul edilir', () => {
    const r = istihbaratNormalize({ ...gecerliIntel, enlem: null, boylam: null, ilgiliIzNo: null });
    expect(r.ok).toBe(true);
  });
});

describe('geohash', () => {
  it('klasik referans değerini üretir (42.6, -5.6 → ezs42)', () => {
    expect(geohash(42.6, -5.6)).toBe('ezs42');
  });
  it('istenen uzunlukta üretir', () => {
    expect(geohash(39.9, 32.85, 7)).toHaveLength(7);
  });
});
