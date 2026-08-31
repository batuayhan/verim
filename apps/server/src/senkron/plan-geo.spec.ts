import type { ObjectSetDef } from '../contract/mercek';
import { SenkronService } from './senkron.service';

/** planGeo: görev→varlık noktası, angajman→atıcı-hedef rotası (Kairos↔Gaia). */
function makeSvc(): SenkronService {
  const platforms = [
    { platform_no: 'P1', cagri_adi: 'ATMACA', tip: 'F16', domain: 'Hava', enlem: 39, boylam: 32, durum: null },
    { platform_no: 'P2', cagri_adi: 'BARBAROS', tip: 'Fırkateyn', domain: 'Deniz', enlem: 36, boylam: 33, durum: null },
    { platform_no: 'P3', cagri_adi: 'KONVOY', tip: 'Zırhlı', domain: 'Kara', enlem: 38, boylam: 35, durum: null },
  ];
  const izler = [{ iz_no: 'IZ-X-1', enlem: 40, boylam: 30 }];
  const engine = {
    load: async (req: { def: ObjectSetDef }) => {
      const base = req.def.type === 'base' ? req.def : (req.def as { base: { objectType: string } }).base;
      const t = (base as { objectType: string }).objectType;
      return t === 'iz' ? { objects: izler, totalCount: 1 } : { objects: platforms, totalCount: 3 };
    },
  } as never;
  const mem = new Map<string, { id: string }>();
  const store = {
    get: (id: string) => mem.get(id),
    upsert: (d: { id: string }) => (mem.set(d.id, d), ''),
    list: () => [],
    delete: () => true,
  } as never;
  const reasoning = {
    coaUret: async () => ({
      hedef: 'IZ-X-1',
      roeDurumu: 'serbest',
      roeIhlalleri: [],
      secenekler: [],
      oneri: { varlik: 'ATMACA', varlikPk: 'P1', angajmanTipi: 'Önle/Durdur', kesismeDk: 5, basariYuzde: 60 },
    }),
  } as never;
  return new SenkronService(engine, store, reasoning);
}

describe('planGeo', () => {
  it('varlıklı görevler nokta, angajman atıcı→hedef rotası üretir', async () => {
    const svc = makeSvc();
    await svc.planPaketi('canli'); // seed
    await svc.sensorToShooter('IZ-X-1'); // hedefIz'li angajman görevi
    const geo = (await svc.planGeo('canli')) as unknown as { features: Array<{ geometry: { type: string }; properties: { rol: string; hedefIz?: string } }> };
    expect('features' in geo).toBe(true);
    const rota = geo.features.filter((f) => f.properties.rol === 'rota');
    const hedef = geo.features.filter((f) => f.properties.rol === 'hedef');
    const gorevler = geo.features.filter((f) => f.properties.rol === 'gorev');
    expect(gorevler.length).toBeGreaterThan(0); // seed görevleri varlık konumunda
    // İZ hedefi: sensörden-atıcıya görevinin canlı iz hedefi
    const izHedef = hedef.filter((f) => f.properties.hedefIz === 'IZ-X-1');
    expect(izHedef.length).toBe(1);
    const izRota = rota.filter((f) => f.properties.hedefIz === 'IZ-X-1');
    expect(izRota.length).toBe(1); // atıcı → hedef çizgisi
    expect(izRota[0].geometry.type).toBe('LineString');
    // SABİT hedef koordinatı (DMPI): seed'in taarruz/deniz/bda görevleri
    expect(hedef.some((f) => f.properties.hedefIz == null)).toBe(true);
  });

  it('taktik alanlar geo özelliklerine iner: bölge çemberi + etiket + görev no', async () => {
    const svc = makeSvc();
    await svc.planPaketi('canli'); // seed
    const geo = (await svc.planGeo('canli')) as unknown as {
      features: Array<{ geometry: { type: string }; properties: Record<string, unknown> }>;
    };
    const bolgeler = geo.features.filter((f) => f.properties.rol === 'bolge');
    expect(bolgeler.length).toBeGreaterThan(0); // ISR/SEAD görev bölgesi çemberleri
    expect(bolgeler[0].geometry.type).toBe('Polygon');
    expect(Number(bolgeler[0].properties.yaricapKm)).toBeGreaterThan(0);
    const noktali = geo.features.find((f) => f.properties.rol === 'gorev' && f.properties.gorevNo);
    expect(noktali).toBeDefined();
    expect(String(noktali!.properties.etiket)).toContain(String(noktali!.properties.gorevNo)); // "SEAD-301 · ad"
  });
});
