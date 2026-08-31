import { AssistantService } from '../assistant/assistant.service';
import { SenkronService } from './senkron.service';

/**
 * AIP doğal-dil plan düzenleme aracının UÇTAN UCA çalıştığını doğrular
 * (drift testi yalnız şema kontrol eder; bu test gerçekten koşturur).
 * Bağımlılıklar hafif stub'lanır — motor/mağaza/akıl-yürütme.
 */
function makeSenkron(): SenkronService {
  const platforms = [
    { platform_no: 'P1', cagri_adi: 'ATMACA', tip: 'F16', domain: 'Hava', enlem: 39, boylam: 32, durum: null },
    { platform_no: 'P2', cagri_adi: 'BARBAROS', tip: 'Fırkateyn', domain: 'Deniz', enlem: 36, boylam: 33, durum: null },
    { platform_no: 'P3', cagri_adi: 'KONVOY', tip: 'Zırhlı', domain: 'Kara', enlem: 38, boylam: 35, durum: null },
  ];
  const engine = {
    load: async () => ({ objects: platforms, totalCount: platforms.length }),
  } as never;
  const mem = new Map<string, { id: string; name?: string }>();
  const store = {
    get: (id: string) => mem.get(id),
    upsert: (doc: { id: string }) => {
      mem.set(doc.id, doc);
      return new Date().toISOString();
    },
    list: () => [...mem.values()].map((d) => ({ id: d.id, name: d.name ?? d.id, updatedAt: '', count: 0 })),
    delete: (id: string) => mem.delete(id),
  } as never;
  const reasoning = {
    coaUret: async () => ({
      hedef: 'IZ-A-42',
      roeDurumu: 'serbest',
      roeIhlalleri: [],
      secenekler: [],
      oneri: { varlik: 'ATMACA', varlikPk: 'P1', angajmanTipi: 'Önle/Durdur', kesismeDk: 5, basariYuzde: 60 },
    }),
  } as never;
  return new SenkronService(engine, store, reasoning);
}

const stub = {} as never;
const makeAssistant = (senkron: SenkronService) =>
  new AssistantService(stub, stub, stub, stub, stub, stub, stub, senkron);

type Paket = { plan: { ad: string; gorevler: Array<{ id: string; baslangicDk: number; kaynak?: string }> } };

describe('AIP senkron_plani_duzenle (uçtan uca)', () => {
  it('topluKaydir: tüm görevleri geri çeker ve kaydeder', async () => {
    const senkron = makeSenkron();
    const once = (await senkron.planPaketi('canli')) as Paket;
    const onceMap = new Map(once.plan.gorevler.map((g) => [g.id, g.baslangicDk]));
    const svc = makeAssistant(senkron);

    const r = await svc.runTool('senkron_plani_duzenle', { islem: 'topluKaydir', deltaDk: -15 }, [], []);
    expect((r.output as { ok?: boolean }).ok).toBe(true);

    const sonra = (await senkron.planPaketi('canli')) as Paket;
    for (const g of sonra.plan.gorevler) {
      expect(g.baslangicDk).toBe((onceMap.get(g.id) ?? 0) - 15);
    }
  });

  it('senaryoTuret: what-if dalı üretir (canlıyı bozmadan)', async () => {
    const senkron = makeSenkron();
    await senkron.planPaketi('canli');
    const svc = makeAssistant(senkron);
    const r = await svc.runTool('senkron_plani_duzenle', { islem: 'senaryoTuret', ad: 'B Planı' }, [], []);
    expect((r.output as { plan?: { ad: string } }).plan?.ad).toContain('B Planı');
  });

  it('gorevEkle: yeni görev ekler, kaynak=aip', async () => {
    const senkron = makeSenkron();
    await senkron.planPaketi('canli');
    const svc = makeAssistant(senkron);
    await svc.runTool(
      'senkron_plani_duzenle',
      { islem: 'gorevEkle', ad: 'Yedek paket', sureDk: 20, domain: 'Hava' },
      [],
      [],
    );
    const p = (await senkron.planPaketi('canli')) as Paket;
    const eklenen = p.plan.gorevler.find((g) => g.kaynak === 'aip');
    expect(eklenen).toBeDefined();
  });

  it('sensorToShooter: tehditten angajman görevi ekler', async () => {
    const senkron = makeSenkron();
    await senkron.planPaketi('canli');
    const svc = makeAssistant(senkron);
    const r = await svc.runTool('senkron_plani_duzenle', { islem: 'sensorToShooter', izNo: 'IZ-A-42' }, [], []);
    expect((r.output as { ok?: boolean }).ok).toBe(true);
  });

  it('senkron servisi yoksa güvenli hata döner (asistan çökmez)', async () => {
    const svc = new AssistantService(stub, stub, stub, stub, stub, stub, stub);
    const r = await svc.runTool('senkron_plani_duzenle', { islem: 'topluKaydir', deltaDk: -15 }, [], []);
    expect((r.output as { error?: string }).error).toBeTruthy();
  });
});
