import type { ObjectSetDef } from '../contract/mercek';
import type { CoaSonuc } from '../reasoning/coa-engine';
import { SenkronService } from './senkron.service';

/**
 * Sensörden-atıcıya: istenen etki + öncelik ROE hiyerarşisi ve COA angajman
 * tipinden TÜRETİLİR (koşulsuz P1·imha DEĞİL — JP 3-60 + ROE saygısı).
 */
function makeSvc(coa: CoaSonuc): { svc: SenkronService } {
  const platforms = [
    { platform_no: 'P1', cagri_adi: 'ATMACA', tip: 'F16', domain: 'Hava', enlem: 39, boylam: 32, durum: null },
  ];
  const izler = [{ iz_no: 'IZ-X-1', enlem: 40, boylam: 30 }];
  const engine = {
    load: async (req: { def: ObjectSetDef }) => {
      const base = req.def.type === 'base' ? req.def : (req.def as { base: { objectType: string } }).base;
      const t = (base as { objectType: string }).objectType;
      return t === 'iz' ? { objects: izler, totalCount: 1 } : { objects: platforms, totalCount: 1 };
    },
  } as never;
  const mem = new Map<string, { id: string }>();
  const store = {
    get: (id: string) => mem.get(id),
    upsert: (d: { id: string }) => (mem.set(d.id, d), ''),
    list: () => [],
    delete: () => true,
  } as never;
  const reasoning = { coaUret: async () => coa } as never;
  return { svc: new SenkronService(engine, store, reasoning) };
}

const temelCoa = (
  roeDurumu: CoaSonuc['roeDurumu'],
  angajmanTipi: string,
): CoaSonuc =>
  ({
    hedef: 'IZ-X-1',
    roeDurumu,
    roeIhlalleri: [],
    secenekler: [],
    oneri: { varlik: 'ATMACA', varlikPk: 'P1', angajmanTipi, kesismeDk: 5, basariYuzde: 60 },
  }) as unknown as CoaSonuc;

async function yeniGorev(coa: CoaSonuc) {
  const { svc } = makeSvc(coa);
  await svc.planPaketi('canli');
  const r = (await svc.sensorToShooter('IZ-X-1')) as { yeniGorev: { istenenEtki?: string; oncelik?: number } };
  return r.yeniGorev;
}

describe('sensorToShooter — ROE hiyerarşisi', () => {
  it('serbest ROE + Etkisiz Hale Getir → imha, P1', async () => {
    const g = await yeniGorev(temelCoa('serbest', 'Etkisiz Hale Getir'));
    expect(g.istenenEtki).toBe('imha');
    expect(g.oncelik).toBe(1);
  });

  it('kısıtlı ROE → etkisizleştirme, P2 (imha DEĞİL)', async () => {
    const g = await yeniGorev(temelCoa('kısıtlı', 'Etkisiz Hale Getir'));
    expect(g.istenenEtki).toBe('etkisizlestirme');
    expect(g.oncelik).toBe(2);
  });

  it('Önle/Durdur → etkisizleştirme, P2', async () => {
    const g = await yeniGorev(temelCoa('serbest', 'Önle/Durdur'));
    expect(g.istenenEtki).toBe('etkisizlestirme');
    expect(g.oncelik).toBe(2);
  });

  it('yasak ROE → yalnız tespit, P3 (kinetik yetki yok)', async () => {
    const g = await yeniGorev(temelCoa('yasak', 'İzle-Takip'));
    expect(g.istenenEtki).toBe('tespit');
    expect(g.oncelik).toBe(3);
  });
});
