import { SenkronService } from './senkron.service';

/** Geri al / ileri al (undo-redo) — mutasyon öncesi anlık görüntü yığınları. */
function makeSvc(): SenkronService {
  const platforms = [
    { platform_no: 'P1', cagri_adi: 'ATMACA', tip: 'F16', domain: 'Hava', enlem: 39, boylam: 32, durum: null },
  ];
  const engine = { load: async () => ({ objects: platforms, totalCount: 1 }) } as never;
  const mem = new Map<string, { id: string }>();
  const store = {
    get: (id: string) => mem.get(id),
    upsert: (d: { id: string }) => (mem.set(d.id, d), ''),
    list: () => [],
    delete: () => true,
  } as never;
  return new SenkronService(engine, store, {} as never);
}

type Paket = { plan: { gorevler: Array<{ id: string; baslangicDk: number }> }; gecmis?: { geri: number; ileri: number } };
const basOf = (p: Paket, id: string) => p.plan.gorevler.find((g) => g.id === id)!.baslangicDk;

describe('geriAl / ileriAl', () => {
  it('topluKaydir → geri al eski konumu getirir; ileri al tekrar uygular', async () => {
    const svc = makeSvc();
    const once = (await svc.planPaketi('canli')) as Paket;
    const ilk = basOf(once, 'ew');

    const kaydi = (await svc.topluKaydir('canli', -15)) as Paket;
    expect(basOf(kaydi, 'ew')).toBe(ilk - 15);
    expect(kaydi.gecmis?.geri).toBe(1);

    const geri = (await svc.geriAl('canli')) as Paket;
    expect(basOf(geri, 'ew')).toBe(ilk);
    expect(geri.gecmis?.ileri).toBe(1);

    const ileri = (await svc.ileriAl('canli')) as Paket;
    expect(basOf(ileri, 'ew')).toBe(ilk - 15);
  });

  it('boş yığında güvenli hata; yeni mutasyon ileri yığınını temizler', async () => {
    const svc = makeSvc();
    await svc.planPaketi('canli');
    expect('hata' in ((await svc.geriAl('canli')) as object)).toBe(true);

    await svc.topluKaydir('canli', 10);
    await svc.geriAl('canli'); // ileri: 1
    await svc.topluKaydir('canli', 5); // yeni dal → ileri temizlenir
    expect('hata' in ((await svc.ileriAl('canli')) as object)).toBe(true);
  });

  it('reddedilen mutasyon geçmişe yazılmaz', async () => {
    const svc = makeSvc();
    await svc.planPaketi('canli');
    await svc.gorevSil('canli', 'boyle-bir-gorev-yok'); // hata döner
    expect('hata' in ((await svc.geriAl('canli')) as object)).toBe(true); // yığın boş kalmalı
  });
});
