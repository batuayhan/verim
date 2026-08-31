import type { HarekatPlani } from './plan-model';
import {
  bagimlilikDonguYaratir,
  hesaplaCpm,
  klampBaslangic,
  kaynakCakismalari,
  planBitisDk,
  planFarki,
  topluKaydir,
  yenidenPlanla,
} from './sync-engine';

// Müşterek hava harekâtı: EW → Taarruz → BDA zinciri + paralel (bollüklu) lojistik.
const g = (
  id: string,
  ad: string,
  baslangicDk: number,
  sureDk: number,
  tur: HarekatPlani['gorevler'][number]['tur'] = 'gorev',
): HarekatPlani['gorevler'][number] => ({ id, ad, domain: 'Hava', tur, baslangicDk, sureDk, durum: 'planli' });

const plan = (): HarekatPlani => ({
  id: 'p1',
  ad: 'Taarruz',
  tur: 'canli',
  gorevler: [
    g('ew', 'SEAD/EW', 0, 30, 'elektronik_harp'),
    g('strike', 'Taarruz paketi', 30, 20, 'gorev'),
    g('bda', 'BDA keşif', 50, 15, 'kesif'),
    g('loj', 'İkmal', 0, 10, 'lojistik'),
  ],
  bagimliliklar: [
    { oncekiId: 'ew', sonrakiId: 'strike', tur: 'FS', gecikmeDk: 0 },
    { oncekiId: 'strike', sonrakiId: 'bda', tur: 'FS', gecikmeDk: 0 },
  ],
});

describe('hesaplaCpm', () => {
  it('kritik yolu ve proje süresini doğru bulur', () => {
    const r = hesaplaCpm(plan());
    expect(r.dongu).toBe(false);
    expect(r.projeSuresiDk).toBe(65); // ew30 + strike20 + bda15
    expect(r.kritikYol).toEqual(['ew', 'strike', 'bda']);
    expect(r.hesaplar.ew.kritik).toBe(true);
    expect(r.hesaplar.loj.kritik).toBe(false);
    expect(r.hesaplar.loj.bolluk).toBe(55); // 65 - 10
  });

  it('operatör bloğu ön koşuldan önce yerleştirirse İHLAL üretir', () => {
    const p = plan();
    p.gorevler.find((x) => x.id === 'strike')!.baslangicDk = 20; // EW (0-30) bitmeden
    const r = hesaplaCpm(p);
    expect(r.ihlaller.length).toBe(1);
    expect(r.ihlaller[0].oncekiId).toBe('ew');
    expect(r.ihlaller[0].sonrakiId).toBe('strike');
    expect(r.ihlaller[0].gerekenBaslangicDk).toBe(30);
  });

  it('gecikme (lag) ihlal eşiğine yansır', () => {
    const p = plan();
    p.bagimliliklar[0].gecikmeDk = 10; // EW bitince +10 dk sonra taarruz
    // strike 30'da; gereken 0+30+10=40 → ihlal
    const r = hesaplaCpm(p);
    expect(r.ihlaller.some((i) => i.sonrakiId === 'strike' && i.gerekenBaslangicDk === 40)).toBe(true);
  });

  it('döngüyü tespit eder (dongu=true)', () => {
    const p = plan();
    p.bagimliliklar.push({ oncekiId: 'bda', sonrakiId: 'ew', tur: 'FS', gecikmeDk: 0 });
    expect(hesaplaCpm(p).dongu).toBe(true);
  });
});

describe('yenidenPlanla — dinamik zaman kaydırma', () => {
  it('bir blok kayınca bağlı sonraki adımlar zincirleme ileri kayar', () => {
    const r = yenidenPlanla(plan(), 'ew', 20); // EW 20 dk gecikti
    const by = new Map(r.plan.gorevler.map((x) => [x.id, x]));
    expect(by.get('ew')!.baslangicDk).toBe(20);
    expect(by.get('strike')!.baslangicDk).toBe(50); // 20+30
    expect(by.get('bda')!.baslangicDk).toBe(70); // 50+20
    expect(by.get('loj')!.baslangicDk).toBe(0); // bağımsız — kaymaz
    expect(r.kaydirilanlar.map((k) => k.id).sort()).toEqual(['bda', 'ew', 'strike']);
    expect(by.get('strike')!.durum).toBe('gecikme'); // yayılan gecikme işaretlenir
  });

  it('erken çekiş bağlıları geri ÇEKMEZ (yalnız ileri yayılır)', () => {
    const r = yenidenPlanla(plan(), 'ew', -10); // EW erken başladı
    const by = new Map(r.plan.gorevler.map((x) => [x.id, x]));
    expect(by.get('ew')!.baslangicDk).toBe(-10);
    expect(by.get('strike')!.baslangicDk).toBe(30); // kısıt hâlâ sağlanıyor → değişmez
  });
});

describe('planFarki — what-if', () => {
  it('gecikmeyi ve proje bitiş kaymasını raporlar', () => {
    const baz = plan();
    const senaryo = yenidenPlanla(plan(), 'ew', 20).plan;
    const fark = planFarki(baz, senaryo);
    expect(planBitisDk(baz)).toBe(65);
    expect(fark.yeniSureDk).toBe(85); // bda 70..85
    expect(fark.eskiSureDk).toBe(65);
    const ids = fark.degisiklikler.filter((d) => d.tur === 'kaydirildi').map((d) => d.id).sort();
    expect(ids).toEqual(['bda', 'ew', 'strike']);
  });

  it('eklenen/silinen görevleri yakalar', () => {
    const baz = plan();
    const senaryo = plan();
    senaryo.gorevler = senaryo.gorevler.filter((x) => x.id !== 'loj');
    senaryo.gorevler.push(g('yeni', 'Yedek paket', 40, 20));
    const fark = planFarki(baz, senaryo);
    expect(fark.degisiklikler.find((d) => d.id === 'yeni')?.tur).toBe('eklendi');
    expect(fark.degisiklikler.find((d) => d.id === 'loj')?.tur).toBe('silindi');
  });
});

describe('kaynakCakismalari', () => {
  const withVarlik = (over: Partial<HarekatPlani['gorevler'][number]>) => ({
    ...g('x', 'X', 0, 10),
    varlikId: 'PLT-1',
    varlikAd: 'ATMACA',
    ...over,
  });
  it('aynı varlığın çakışan iki görevini yakalar', () => {
    const p: HarekatPlani = {
      ...plan(),
      gorevler: [
        withVarlik({ id: 'a', ad: 'Görev A', baslangicDk: 0, sureDk: 30 }),
        withVarlik({ id: 'b', ad: 'Görev B', baslangicDk: 15, sureDk: 20 }), // 15<30 çakışır
      ],
      bagimliliklar: [],
    };
    const c = kaynakCakismalari(p);
    expect(c.length).toBe(1);
    expect([c[0].aId, c[0].bId].sort()).toEqual(['a', 'b']);
  });
  it('çakışmayan (art arda) görevlerde çakışma yok', () => {
    const p: HarekatPlani = {
      ...plan(),
      gorevler: [
        withVarlik({ id: 'a', baslangicDk: 0, sureDk: 30 }),
        withVarlik({ id: 'b', baslangicDk: 30, sureDk: 20 }), // tam bitişte başlar
      ],
      bagimliliklar: [],
    };
    expect(kaynakCakismalari(p).length).toBe(0);
  });
  it('farklı varlıklar çakışmaz', () => {
    const p: HarekatPlani = {
      ...plan(),
      gorevler: [
        withVarlik({ id: 'a', varlikId: 'PLT-1', baslangicDk: 0, sureDk: 30 }),
        withVarlik({ id: 'b', varlikId: 'PLT-2', baslangicDk: 0, sureDk: 30 }),
      ],
      bagimliliklar: [],
    };
    expect(kaynakCakismalari(p).length).toBe(0);
  });
});

describe('topluKaydir', () => {
  it('tüm görevleri delta dk kaydırır', () => {
    const p = topluKaydir(plan(), -15);
    expect(p.gorevler.find((x) => x.id === 'ew')!.baslangicDk).toBe(-15);
    expect(p.gorevler.find((x) => x.id === 'bda')!.baslangicDk).toBe(35);
  });
  it('domain filtresiyle yalnız o domaini kaydırır', () => {
    const p = plan();
    p.gorevler.find((x) => x.id === 'loj')!.domain = 'Kara';
    const r = topluKaydir(p, 10, 'Kara');
    expect(r.gorevler.find((x) => x.id === 'loj')!.baslangicDk).toBe(10); // Kara → kaydı
    expect(r.gorevler.find((x) => x.id === 'ew')!.baslangicDk).toBe(0); // Hava → sabit
  });
});

describe('CPM yerleşime duyarlı + gerçek kritik yol', () => {
  it('ES H-eksenli (yerleştirilen zamanı yansıtır), drag proje bitişini uzatır', () => {
    const r1 = hesaplaCpm(plan());
    expect(r1.hesaplar.ew.esBaslangic).toBe(0); // ew H+0'a yerleşik
    const moved = yenidenPlanla(plan(), 'ew', 40).plan; // ew→40, zincir: strike 70, bda 90
    const r2 = hesaplaCpm(moved);
    expect(r2.hesaplar.bda.esBitis).toBeGreaterThan(r1.hesaplar.bda.esBitis);
  });
  it('kritikYol gerçek bağımlılık zinciridir (uydurma kenar yok)', () => {
    // loj bağımsız & kritik değil → yola girmez; ew→strike→bda binding zinciri
    expect(hesaplaCpm(plan()).kritikYol).toEqual(['ew', 'strike', 'bda']);
  });
});

describe('klampBaslangic — NaN/aralık koruması (CPM poisoning engeli)', () => {
  it('NaN/∞ → güvenli değer, aralık dışını kırpar', () => {
    expect(klampBaslangic(NaN)).toBe(0);
    expect(klampBaslangic(Infinity)).toBe(10080);
    expect(klampBaslangic(-99999)).toBe(-720);
    expect(klampBaslangic(12.7)).toBe(13);
  });
  it('yenidenPlanla NaN girdisini yutar; CPM sonlu kalır', () => {
    const r = yenidenPlanla(plan(), 'ew', NaN);
    expect(Number.isFinite(r.plan.gorevler.find((g) => g.id === 'ew')!.baslangicDk)).toBe(true);
    expect(Number.isFinite(hesaplaCpm(r.plan).projeSuresiDk)).toBe(true);
  });
});

describe('bagimlilikDonguYaratir', () => {
  it('geri-kenar döngü yaratır', () => {
    expect(bagimlilikDonguYaratir(plan(), { oncekiId: 'bda', sonrakiId: 'ew', tur: 'FS', gecikmeDk: 0 })).toBe(true);
  });
  it('ileri kenar döngü yaratmaz', () => {
    expect(bagimlilikDonguYaratir(plan(), { oncekiId: 'loj', sonrakiId: 'bda', tur: 'FS', gecikmeDk: 0 })).toBe(false);
  });
  it('kendine bağımlılık döngüdür', () => {
    expect(bagimlilikDonguYaratir(plan(), { oncekiId: 'ew', sonrakiId: 'ew', tur: 'FS', gecikmeDk: 0 })).toBe(true);
  });
});
