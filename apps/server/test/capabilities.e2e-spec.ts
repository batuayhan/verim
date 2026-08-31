/**
 * YETENEK SÖZLEŞMESİ DRIFT TESTİ
 *
 * Derleyici, katalogların contract union'larını kapsamasını zaten zorlar
 * (Record<Union, string>). Bu test kalan sapma yüzeylerini kapatır:
 *  1. Üretilen yetenek promptu her katalog girdisini gerçekten içeriyor mu
 *     (üretici fonksiyon bir bölümü unutursa burada patlar),
 *  2. Araç şemaları zod'dan GERÇEKTEN üretilebiliyor mu (sessizce serbest
 *     nesneye düşmek = LLM'in şema bilgisini kaybetmesi — kabul edilmez),
 *  3. Registry'deki araç seti bilinen küme; yeni araç eklenince bu liste
 *     bilinçli güncellenmek zorunda (asistan yüzeyinin farkında olma testi).
 */

import { buildCapabilityPrompt, FILTER_OPERATORS, GADGETS, HARMAN_AGGREGATION_FNS, HARMAN_BOARDS, MERCEK_CARDS, OBJECT_SET_NODES, MERCEK_METRIC_FNS } from '../src/capabilities/catalog';
import { toToolJsonSchema } from '../src/capabilities/tool-schemas';
import {
  AssistantService,
  TOOL_REGISTRY,
  type AssistantAction,
  type AssistantPanel,
} from '../src/assistant/assistant.service';
import { dashboardSchema } from '../src/dashboards/dashboard-schema';
import { sistemDashboard } from '../src/dashboards/sistem-dashboard';
import { DummyOntologyProvider } from '../src/ontology/dummy-ontology-provider';
import { MimOntologyProvider } from '../src/mim/mim-ontology';
import { DummyDatasetProvider } from '../src/datasets/dummy/dummy-dataset-provider';
import { ObjectSetEngine } from '../src/ontology/object-set-engine';
import { buildAnalysis } from '../src/assistant/analysis-builder';
import { lintObjectSetDef } from '../src/capabilities/def-lint';
import { injectRuntimeEnums } from '../src/capabilities/tool-schemas';

/** Gerçek dummy motor + bellek-içi store stub'larıyla asistan servisi */
async function makeService(): Promise<AssistantService> {
  const datasets = new DummyDatasetProvider();
  await datasets.onModuleInit();
  const ontologyProvider = new DummyOntologyProvider();
  const engine = new ObjectSetEngine(datasets, ontologyProvider);
  const store = { upsert: () => undefined } as never;
  return new AssistantService(ontologyProvider, engine, datasets, store, store, store, store);
}

describe('Yetenek sözleşmesi (asistan ↔ sistem)', () => {
  it('dummy ve MIM ontolojileri birebir aynıdır (frontend fark görmez)', async () => {
    const a = await new DummyOntologyProvider().getOntology();
    const b = await new MimOntologyProvider().getOntology();
    expect(b).toEqual(a);
  });

  it('üretilen prompt her katalog girdisini içerir', async () => {
    const ontology = await new DummyOntologyProvider().getOntology();
    const prompt = buildCapabilityPrompt(ontology, [
      { id: 'izler', label: 'İzler', rowCount: 1, lastUpdated: '', version: 'v' },
    ]);
    const anahtarlar = [
      ...Object.keys(OBJECT_SET_NODES),
      ...Object.keys(FILTER_OPERATORS),
      ...Object.keys(MERCEK_METRIC_FNS),
      ...Object.keys(MERCEK_CARDS),
      ...Object.keys(HARMAN_BOARDS),
      ...Object.keys(HARMAN_AGGREGATION_FNS),
      ...Object.keys(GADGETS),
      ...ontology.objectTypes.map((t) => t.apiName),
      ...ontology.linkTypes.map((l) => l.apiName),
    ];
    for (const k of anahtarlar) {
      expect(prompt).toContain(k);
    }
  });

  it('her araç şeması zod\'dan üretilebilir (serbest nesneye düşmez)', () => {
    for (const t of TOOL_REGISTRY) {
      const schema = toToolJsonSchema(t.input);
      // fallback {type:'object'} tek anahtarlıdır; gerçek üretimde
      // properties/anyOf/$defs gibi yapı bulunur
      expect(Object.keys(schema).length).toBeGreaterThan(1);
    }
  });

  it('her araç kullanıcıya belgelenmiştir (başlık + en az 2 örnek komut)', () => {
    for (const t of TOOL_REGISTRY) {
      expect(t.title.length).toBeGreaterThan(3);
      expect(t.category).toBeTruthy();
      expect(t.examples.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('her aracın fikstürü şemadan geçer VE gerçekten çalışır (örnekler yetenekten fazlasını vaat edemez)', async () => {
    const datasets = new DummyDatasetProvider();
    await datasets.onModuleInit();
    const ontologyProvider = new DummyOntologyProvider();
    const ontology = await ontologyProvider.getOntology();
    const engine = new ObjectSetEngine(datasets, ontologyProvider);

    for (const tool of TOOL_REGISTRY) {
      expect(tool.fixtures.length).toBeGreaterThanOrEqual(1);
      for (const fx of tool.fixtures) {
        const parsed = tool.input.safeParse(fx);
        if (!parsed.success) {
          throw new Error(
            `${tool.name} fikstürü şemadan geçmedi: ${parsed.error.issues[0]?.message}`,
          );
        }
        const d = parsed.data as Record<string, unknown>;
        // Semantik çalıştırma: sorgular motora, kurucular derleyiciye gider
        if (tool.name === 'nesne_yukle') {
          const r = await engine.load({ def: d.def as never, parameters: {}, limit: 1 });
          expect(r.totalCount).toBeGreaterThanOrEqual(0);
        } else if (tool.name === 'nesne_grupla') {
          const r = await engine.aggregate({
            def: d.def as never,
            parameters: {},
            groupBy: d.groupBy as string | undefined,
            metric: d.metric as never,
          });
          expect(r.rows.length).toBeGreaterThan(0);
        } else if (tool.name === 'zaman_serisi') {
          const r = await engine.timeseries({
            def: d.def as never,
            parameters: {},
            dateProperty: d.dateProperty as string,
            metric: d.metric as never,
            granularity: d.granularity as never,
          });
          expect(r.points.length).toBeGreaterThan(0);
        } else if (tool.name === 'mercek_analiz_olustur') {
          const analysis = buildAnalysis(d as never, ontology);
          expect(analysis.cards.length).toBeGreaterThan(0);
          for (const k of d.kumeler as Array<{ def: unknown }>) {
            expect(lintObjectSetDef(k.def as never, ontology)).toEqual([]);
          }
        } else if (tool.name === 'harman_analiz_olustur') {
          const ds = await datasets.get(String(d.datasetId));
          expect(ds).toBeDefined();
        } else if (tool.name === 'alarm_kurali_olustur') {
          expect(lintObjectSetDef(d.def as never, ontology)).toEqual([]);
        } else if (tool.name === 'dashboard_olustur') {
          for (const g of d.gadgets as Array<{ def?: unknown }>) {
            if (g.def) expect(lintObjectSetDef(g.def as never, ontology)).toEqual([]);
          }
        }
      }
    }
  });

  it('LLM şemalarında objectType/linkType/datasetId kapalı listedir (halüsinasyon engeli)', async () => {
    const ontology = await new DummyOntologyProvider().getOntology();
    const nesneYukle = TOOL_REGISTRY.find((t) => t.name === 'nesne_yukle')!;
    const injected = injectRuntimeEnums(toToolJsonSchema(nesneYukle.input), {
      objectTypes: ontology.objectTypes.map((o) => o.apiName),
      linkTypes: ontology.linkTypes.map((l) => l.apiName),
      datasetIds: ['izler'],
    });
    const json = JSON.stringify(injected);
    expect(json).toContain('"iz_gozlem"');       // objectType enum'u
    expect(json).toContain('"sensor-platform"'); // linkType enum'u
  });

  it('sorgu araçları API şemalarından türer (segmentBy dahil — dar şema sapması kapalı)', () => {
    const grupla = TOOL_REGISTRY.find((t) => t.name === 'nesne_grupla')!;
    expect(
      grupla.input.safeParse({
        def: { type: 'base', objectType: 'iz' },
        groupBy: 'siniflandirma',
        segmentBy: 'domain',
        metric: { fn: 'count' },
      }).success,
    ).toBe(true);
    const mercek = TOOL_REGISTRY.find((t) => t.name === 'mercek_analiz_olustur')!;
    // bar grafiğe granularity yazılamaz (katı şema anlamsız kombinasyonu reddeder)
    expect(
      mercek.input.safeParse({
        isim: 'x',
        kumeler: [{ def: { type: 'base', objectType: 'iz' } }],
        gorseller: [
          { tip: 'grafik', kume: 0, groupBy: 'domain', metricFn: 'count', granularity: 'day' },
        ],
      }).success,
    ).toBe(false);
  });

  it('def linter yanlış adları önerilerle yakalar', async () => {
    const ontology = await new DummyOntologyProvider().getOntology();
    const issues = lintObjectSetDef(
      { type: 'base', objectType: 'izler' } as never,
      ontology,
    );
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("belki: 'iz'");
  });

  it('araç seti bilinçli olarak bilinen kümedir', () => {
    expect(TOOL_REGISTRY.map((t) => t.name).sort()).toEqual(
      [
        'alarm_kurali_olustur',
        'dashboard_olustur',
        'graf_ac',
        'haritaya_git',
        'harman_analiz_olustur',
        'mercek_analiz_olustur',
        'nesne_grupla',
        'nesne_incele',
        'nesne_yukle',
        'senkron_plani_duzenle',
        'zaman_serisi',
      ].sort(),
    );
  });

  it('sorgu araçları sohbete INLINE PANEL üretir (cevap kara kutu değildir)', async () => {
    const service = await makeService();
    const fx = (name: string, i = 0) =>
      TOOL_REGISTRY.find((t) => t.name === name)!.fixtures[i];

    // nesne_yukle → tablo paneli (iz'de enlem/boylam var → konumlu)
    let paneller: AssistantPanel[] = [];
    await service.runTool('nesne_yukle', fx('nesne_yukle'), [], paneller);
    expect(paneller).toHaveLength(1);
    const tablo = paneller[0] as Extract<AssistantPanel, { tip: 'tablo' }>;
    expect(tablo.tip).toBe('tablo');
    expect(tablo.konumlu).toBe(true);
    expect(tablo.totalCount).toBeGreaterThan(0);
    expect(tablo.def).toBeDefined();

    // nesne_grupla (segmentli fikstür) → grafik paneli
    paneller = [];
    await service.runTool('nesne_grupla', fx('nesne_grupla', 1), [], paneller);
    const grafik = paneller[0] as Extract<AssistantPanel, { tip: 'grafik' }>;
    expect(grafik.tip).toBe('grafik');
    expect(grafik.segmentBy).toBe('domain');
    expect(grafik.rows.length).toBeGreaterThan(0);

    // groupBy'sız grupla → metrik paneli
    paneller = [];
    await service.runTool(
      'nesne_grupla',
      { def: { type: 'base', objectType: 'iz' }, metric: { fn: 'count' } },
      [],
      paneller,
    );
    expect(paneller[0].tip).toBe('metrik');

    // zaman_serisi → zaman paneli
    paneller = [];
    await service.runTool('zaman_serisi', fx('zaman_serisi'), [], paneller);
    const zaman = paneller[0] as Extract<AssistantPanel, { tip: 'zaman' }>;
    expect(zaman.tip).toBe('zaman');
    expect(zaman.points.length).toBeGreaterThan(0);
  });

  it('haritaya_git merkez ile konum-odaklı harita aksiyonu üretir', async () => {
    const service = await makeService();
    const actions: AssistantAction[] = [];
    await service.runTool(
      'haritaya_git',
      TOOL_REGISTRY.find((t) => t.name === 'haritaya_git')!.fixtures[1],
      actions,
      [],
    );
    expect(actions).toHaveLength(1);
    const a = actions[0] as Extract<AssistantAction, { type: 'harita_goster' }>;
    expect(a.type).toBe('harita_goster');
    expect(a.params.lat).toBe('39.92');
    expect(a.params.lon).toBe('32.85');
    expect(a.params.etiket).toBe('IZ-0042');
  });

  it('createMercekAnalysis panel→Mercek yolunda da lint zorlar (tek yol ilkesi)', async () => {
    const service = await makeService();
    await expect(
      service.createMercekAnalysis({
        isim: 'Bozuk',
        kumeler: [{ def: { type: 'base', objectType: 'izler' } as never }],
      }),
    ).rejects.toThrow(/belki: 'iz'/);

    const ok = await service.createMercekAnalysis({
      isim: 'Panelden',
      kumeler: [{ def: { type: 'base', objectType: 'iz' } as never }],
      gorseller: [{ tip: 'grafik', kume: 0, groupBy: 'domain', metricFn: 'count' }],
    });
    expect(ok.id).toBeTruthy();
    expect(ok.kartSayisi).toBeGreaterThan(0);
  });

  it('dashboard_olustur gadget fikstürünü otomatik yerleşimle kurar', async () => {
    const service = await makeService();
    const actions: AssistantAction[] = [];
    const { output } = await service.runTool(
      'dashboard_olustur',
      TOOL_REGISTRY.find((t) => t.name === 'dashboard_olustur')!.fixtures[0],
      actions,
      [],
    );
    expect((output as { gadgetSayisi: number }).gadgetSayisi).toBe(5);
    expect(actions[0].type).toBe('dashboard_ac');

    // Sistem dashboard'u koddan üretilir ve şemadan geçer (sanal doküman
    // sözleşmeye uymak zorunda — gadget şeması değişirse burada patlar)
    const parsed = dashboardSchema.safeParse(sistemDashboard());
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  });

  it('araç girdi şemaları geçersiz girdiyi reddeder (props sözleşmesi)', () => {
    const mercek = TOOL_REGISTRY.find((t) => t.name === 'mercek_analiz_olustur')!;
    expect(mercek.input.safeParse({ isim: 'x', kumeler: [] }).success).toBe(false);
    expect(
      mercek.input.safeParse({
        isim: 'x',
        kumeler: [{ def: { type: 'base', objectType: 'iz' } }],
      }).success,
    ).toBe(true);
    const harman = TOOL_REGISTRY.find((t) => t.name === 'harman_analiz_olustur')!;
    expect(
      harman.input.safeParse({
        isim: 'x',
        datasetId: 'izler',
        boards: [{ type: 'olmayanBoard', id: 'b1' }],
      }).success,
    ).toBe(false);
  });
});
