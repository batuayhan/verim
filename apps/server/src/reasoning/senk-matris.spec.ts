import {
  pencereSec,
  senkronizasyonKur,
  VARSAYILAN_PENCERELER,
  type GorevGirdi,
  type VarlikOzet,
} from './senk-matris';

const varliklar: VarlikOzet[] = [
  { ad: 'ATMACA-72', pk: '131', tip: 'F-16', domain: 'Hava', hazir: true },
  { ad: 'YILDIRIM-3', pk: '208', tip: 'HİSAR-A', domain: 'Hava', hazir: true },
  { ad: 'BARBAROS', pk: '540', tip: 'Fırkateyn', domain: 'Deniz', hazir: true },
  { ad: 'BOŞTA-9', pk: '999', tip: 'F-16', domain: 'Hava', hazir: true }, // hiç görev almayacak
];

const g = (over: Partial<GorevGirdi>): GorevGirdi => ({
  izNo: 'IZ-X',
  oncelik: 'Yüksek',
  skor: 70,
  angajmanTipi: 'Etkisiz Hale Getir',
  roeDurumu: 'serbest',
  basariYuzde: 80,
  kesismeDk: 10,
  varlikAd: 'ATMACA-72',
  varlikPk: '131',
  ...over,
});

describe('pencereSec', () => {
  it('kesişme süresine göre doğru pencereyi seçer', () => {
    expect(pencereSec(3, 'Etkisiz Hale Getir', VARSAYILAN_PENCERELER)).toBe('simdi');
    expect(pencereSec(12, 'Etkisiz Hale Getir', VARSAYILAN_PENCERELER)).toBe('h15');
    expect(pencereSec(25, 'Etkisiz Hale Getir', VARSAYILAN_PENCERELER)).toBe('h30');
  });
  it('İzle-Takip veya kesişme yoksa İzleme penceresine düşer', () => {
    expect(pencereSec(3, 'İzle-Takip', VARSAYILAN_PENCERELER)).toBe('izleme');
    expect(pencereSec(null, 'Etkisiz Hale Getir', VARSAYILAN_PENCERELER)).toBe('izleme');
  });
  it('tüm zamanlı pencerelerden uzaksa en geniş zamanlı pencereye koyar (İzleme değil)', () => {
    expect(pencereSec(999, 'Önle/Durdur', VARSAYILAN_PENCERELER)).toBe('h60');
  });
});

describe('senkronizasyonKur', () => {
  it('görevlendirilen varlıkları satır, zamanı sütun yapar; boştayı özet\'te sayar', () => {
    const m = senkronizasyonKur(varliklar, [
      g({ izNo: 'IZ-A', varlikAd: 'ATMACA-72', varlikPk: '131', kesismeDk: 3 }),
      g({ izNo: 'IZ-B', varlikAd: 'BARBAROS', varlikPk: '540', kesismeDk: 20, oncelik: 'Kritik', skor: 90 }),
    ]);
    // iki farklı varlık görevlendirildi
    expect(m.satirlar.map((s) => s.baslik).sort()).toEqual(['ATMACA-72', 'BARBAROS']);
    // domain grupları taşınıyor
    expect(m.satirlar.find((s) => s.baslik === 'BARBAROS')?.grup).toBe('Deniz');
    // hücreler doğru pencerede
    const atmaca = m.hucreler.find((h) => h.satirId === '131');
    expect(atmaca?.sutunId).toBe('simdi');
    expect(atmaca?.gorevler[0].izNo).toBe('IZ-A');
    // özet: 2 görevli (ATMACA-72, BARBAROS); boştaki hazır 2 (YILDIRIM-3, BOŞTA-9)
    expect(m.ozet.gorevlendirilen_varlik).toBe(2);
    expect(m.ozet.bosta_varlik).toBe(2);
    expect(m.ozet.kapsanan_tehdit).toBe(2);
    expect(m.ozet.planlanan_angajman).toBe(2);
  });

  it('aynı varlık+pencereye düşen çok tehdit tek hücrede skora göre sıralanır', () => {
    const m = senkronizasyonKur(varliklar, [
      g({ izNo: 'IZ-LO', varlikPk: '131', kesismeDk: 3, skor: 60 }),
      g({ izNo: 'IZ-HI', varlikPk: '131', kesismeDk: 4, skor: 95 }),
    ]);
    const h = m.hucreler.find((c) => c.satirId === '131' && c.sutunId === 'simdi');
    expect(h?.gorevler.map((x) => x.izNo)).toEqual(['IZ-HI', 'IZ-LO']); // yüksek skor önce
  });

  it('İzle-Takip görevleri İzleme sütununa gider ve kinetik sayılmaz', () => {
    const m = senkronizasyonKur(varliklar, [
      g({ izNo: 'IZ-W', angajmanTipi: 'İzle-Takip', kesismeDk: null, varlikPk: '208', varlikAd: 'YILDIRIM-3' }),
    ]);
    const h = m.hucreler.find((c) => c.satirId === '208');
    expect(h?.sutunId).toBe('izleme');
    expect(m.ozet.planlanan_angajman).toBe(0);
  });

  it('varlık önerilemeyen tehdit atanamayan olarak sayılır, satır üretmez', () => {
    const m = senkronizasyonKur(varliklar, [
      g({ izNo: 'IZ-N', varlikAd: null, varlikPk: null }),
    ]);
    expect(m.satirlar.length).toBe(0);
    expect(m.ozet.atanamayan_tehdit).toBe(1);
    expect(m.ozet.kapsanan_tehdit).toBe(1);
  });
});
