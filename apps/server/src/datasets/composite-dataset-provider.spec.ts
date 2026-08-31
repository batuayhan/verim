import type { ModuleRef } from '@nestjs/core';
import { ApiError } from '../common/api-error';
import type { QueryError } from '../contract/api';
import { InMemoryQueryEngine } from '../query/in-memory/engine';
import { CompositeDatasetProvider } from './composite-dataset-provider';
import type { DatasetProvider, DatasetRecord, Row } from './dataset-provider';
import type { LiveDatasetDef, LiveDatasetsStore } from './live-dataset-store';

/**
 * Canlı dataset çözücüsünün birim testleri — kalıcılığa (disk/GCS) ve NestJS
 * DI'a dokunmadan: sahte backend + sahte store + gerçek InMemoryQueryEngine.
 * Motor, composite'in KENDİSİ üzerinden veri okur (canlı-üstüne-canlı yolunun
 * gerçek kablolamasıyla aynı).
 */

/** Kaynak verisi ve sürümü DEĞİŞTİRİLEBİLEN sahte backend (canlılık testi). */
class FakeBackend implements DatasetProvider {
  version = 'v1';
  rows: Row[] = [
    { ad: 'Alfa', puan: 10 },
    { ad: 'Bravo', puan: 40 },
    { ad: 'Charlie', puan: 90 },
  ];

  private record(): DatasetRecord {
    return {
      summary: {
        id: 'kaynak',
        label: 'Kaynak',
        rowCount: this.rows.length,
        lastUpdated: '2026-01-01T00:00:00Z',
        version: this.version,
      },
      schema: {
        columns: [
          { name: 'ad', type: 'string', nullable: false },
          { name: 'puan', type: 'integer', nullable: false },
        ],
      },
      rows: this.rows,
    };
  }

  list(): Promise<DatasetRecord['summary'][]> {
    return Promise.resolve([this.record().summary]);
  }
  get(id: string): Promise<DatasetRecord | undefined> {
    return Promise.resolve(id === 'kaynak' ? this.record() : undefined);
  }
  add(): Promise<void> {
    return Promise.resolve();
  }
}

function makeStore(defs: LiveDatasetDef[] = []): LiveDatasetsStore {
  const map = new Map(defs.map((d) => [d.id, d]));
  return {
    // Gerçek store gibi: def() bozuk kaydı undefined'a indirger; defs() ise
    // burada bilerek HAM döner ki composite'in kendi savunması da test edilsin
    def: (id: string) => {
      const d = map.get(id);
      return d && Array.isArray(d.boards) ? d : undefined;
    },
    defs: () => [...map.values()],
    upsert: (d: LiveDatasetDef) => {
      map.set(d.id, d);
      return new Date().toISOString();
    },
    delete: (id: string) => map.delete(id),
  } as unknown as LiveDatasetsStore;
}

function makeDef(partial: Partial<LiveDatasetDef>): LiveDatasetDef {
  return {
    id: 'live_test_1',
    name: 'Test',
    sourceDatasetId: 'kaynak',
    boards: [],
    parameters: {},
    createdAt: '2026-01-01T00:00:00Z',
    cachedSchema: { columns: [] },
    cachedRowCount: 0,
    ...partial,
  };
}

function wire(defs: LiveDatasetDef[] = []): {
  backend: FakeBackend;
  provider: CompositeDatasetProvider;
} {
  const backend = new FakeBackend();
  // Motor referansı kablolamadan SONRA oluşur — ModuleRef'in tembel get'i
  // gibi, closure üzerinden çözülür.
  let engine: InMemoryQueryEngine | null = null;
  const moduleRef = { get: () => engine } as unknown as ModuleRef;
  const provider = new CompositeDatasetProvider(
    backend,
    makeStore(defs),
    moduleRef,
  );
  engine = new InMemoryQueryEngine(provider);
  return { backend, provider };
}

const filtreBoard = (kolon: string, deger: string | number) => ({
  type: 'filter' as const,
  id: 'f1',
  action: 'keep' as const,
  combinator: 'and' as const,
  conditions: [
    {
      id: 'c1',
      column: kolon,
      operator: 'gte' as const,
      values: [{ kind: 'literal' as const, value: deger }],
    },
  ],
});

function apiCode(err: unknown): QueryError['code'] {
  return (err as ApiError).getResponse() !== undefined
    ? ((err as ApiError).getResponse() as QueryError).code
    : 'INTERNAL';
}

describe('CompositeDatasetProvider (canlı dataset çözücüsü)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 1_000_000, doNotFake: ['nextTick'] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('canlı dataset kaydedilmiş sorgunun DİNAMİK sonucudur — kaynak değişince sonuç değişir', async () => {
    const def = makeDef({ boards: [filtreBoard('puan', 50)] });
    const { backend, provider } = wire([def]);

    const once = await provider.get('live_test_1');
    expect(once?.rows.map((r) => r.ad)).toEqual(['Charlie']);
    const eskiSurum = once?.summary.version;

    // Kaynağa yeni satır gelir, sürüm ilerler (mim'de watermark karşılığı)
    backend.rows = [...backend.rows, { ad: 'Delta', puan: 70 }];
    backend.version = 'v2';
    jest.advanceTimersByTime(2_100); // backend.list memo süresi dolsun

    const sonra = await provider.get('live_test_1');
    expect(sonra?.rows.map((r) => r.ad)).toEqual(['Charlie', 'Delta']);
    expect(sonra?.summary.version).not.toBe(eskiSurum);
  });

  it('sürüm değişmediyse zincir yeniden koşulmaz (önbellek aynı kaydı döner)', async () => {
    const def = makeDef({ boards: [filtreBoard('puan', 50)] });
    const { provider } = wire([def]);

    const a = await provider.get('live_test_1');
    const b = await provider.get('live_test_1');
    expect(b).toBe(a); // referans eşitliği — yeniden hesap yok
  });

  it('boş zincir kaynağın canlı takma adı gibi davranır', async () => {
    const def = makeDef({ boards: [] });
    const { provider } = wire([def]);
    const rec = await provider.get('live_test_1');
    expect(rec?.rows).toHaveLength(3);
    expect(rec?.schema.columns.map((c) => c.name)).toEqual(['ad', 'puan']);
  });

  it('kernel dataset canlı tanımla GÖLGELENEMEZ', async () => {
    const golge = makeDef({ id: 'kaynak', boards: [filtreBoard('puan', 999)] });
    const { provider } = wire([golge]);
    const rec = await provider.get('kaynak');
    expect(rec?.rows).toHaveLength(3); // backend kaydı döndü, canlı tanım değil
  });

  it('döngüsel referans sonsuz özyineleme yerine açık hatayla reddedilir', async () => {
    // Normal akışta kurulamaz (tanımlar değişmez) — savunma katmanı testi:
    // store'a elle iki karşılıklı tanım yerleştiriyoruz.
    const a = makeDef({ id: 'live_a', sourceDatasetId: 'live_b' });
    const b = makeDef({ id: 'live_b', sourceDatasetId: 'live_a' });
    const { provider } = wire([a, b]);

    await expect(provider.get('live_a')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVALID_BOARD_CONFIG',
        message: expect.stringContaining('döngü'),
      }),
    });
  });

  it('FAIL-CLOSED: tavana takılan çözüm kısmi sonuç yerine RESULT_TOO_LARGE fırlatır', async () => {
    const def = makeDef({ boards: [] });
    const { backend, provider } = wire([def]);
    // Tavanın (100k) bir fazlası — kırpılmadan dönemez
    backend.rows = Array.from({ length: 100_001 }, (_, i) => ({
      ad: `x${i}`,
      puan: i,
    }));

    let hata: unknown;
    await provider.get('live_test_1').catch((e: unknown) => (hata = e));
    expect(hata).toBeInstanceOf(ApiError);
    expect(apiCode(hata)).toBe('RESULT_TOO_LARGE');
  });

  it('kaynak yoksa DATASET_NOT_FOUND aynen yüzeye çıkar', async () => {
    const def = makeDef({ sourceDatasetId: 'yok_boyle_dataset' });
    const { provider } = wire([def]);
    await expect(provider.get('live_test_1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DATASET_NOT_FOUND' }),
    });
  });

  it('canlı-üstüne-canlı: zincirler uç uca, sonuç iki filtrenin kesişimi', async () => {
    const alt = makeDef({
      id: 'live_alt',
      boards: [filtreBoard('puan', 30)], // Bravo(40), Charlie(90)
    });
    const ust = makeDef({
      id: 'live_ust',
      sourceDatasetId: 'live_alt',
      boards: [filtreBoard('puan', 80)], // Charlie(90)
    });
    const { provider } = wire([alt, ust]);

    const rec = await provider.get('live_ust');
    expect(rec?.rows.map((r) => r.ad)).toEqual(['Charlie']);
  });

  it('canlı id üzerine anlık görüntü (materialize) yazılamaz', async () => {
    const def = makeDef({ id: 'live_dolu' });
    const { provider } = wire([def]);
    await expect(
      provider.add({
        summary: {
          id: 'live_dolu',
          label: 'x',
          rowCount: 0,
          lastUpdated: '',
          version: '',
        },
        schema: { columns: [] },
        rows: [],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_BOARD_CONFIG' }),
    });
  });

  it('K1: göreli-zamanlı ("son 1 saat") tarif, kaynak değişmese de duvar saatiyle tazelenir', async () => {
    // Zaman kolonu taşıyan tek-seferlik backend: 30 dk önce SABİT bir olay
    // (closure her okumada yeniden hesaplamasın — pencereyi kaydırmak
    // testin işi, olayın değil)
    const olayZamani = new Date(Date.now() - 30 * 60_000).toISOString();
    const olaylar = () => ({
      summary: {
        id: 'olaylar',
        label: 'Olaylar',
        rowCount: 1,
        lastUpdated: '2026-01-01T00:00:00Z',
        version: 'sabit', // kaynak sürümü ASLA değişmiyor — kritik nokta
      },
      schema: {
        columns: [
          { name: 'zaman', type: 'timestamp' as const, nullable: false },
        ],
      },
      rows: [{ zaman: olayZamani }],
    });
    const backend = {
      list: () => Promise.resolve([olaylar().summary]),
      get: (id: string) =>
        Promise.resolve(id === 'olaylar' ? olaylar() : undefined),
      add: () => Promise.resolve(),
    };
    const def = makeDef({
      sourceDatasetId: 'olaylar',
      boards: [
        {
          type: 'filter' as const,
          id: 'f1',
          action: 'keep' as const,
          combinator: 'and' as const,
          conditions: [
            {
              id: 'c1',
              column: 'zaman',
              operator: 'gte' as const,
              values: [
                { kind: 'relative' as const, unit: 'hour' as const, amount: 1 },
              ],
            },
          ],
        },
      ],
    });
    let engine: InMemoryQueryEngine | null = null;
    const provider = new CompositeDatasetProvider(backend, makeStore([def]), {
      get: () => engine,
    } as unknown as ModuleRef);
    engine = new InMemoryQueryEngine(provider);

    const once = await provider.get('live_test_1');
    expect(once?.rows).toHaveLength(1); // olay pencerede

    // 3 saat ilerle: kaynak sürümü hâlâ 'sabit' ama pencere kaydı —
    // zaman kovası sürümü değiştirmeli, önbellek bayat sonucu DÖNEMEMELİ
    jest.advanceTimersByTime(3 * 60 * 60_000);
    const sonra = await provider.get('live_test_1');
    expect(sonra?.rows).toHaveLength(0);
    expect(sonra?.summary.version).not.toBe(once?.summary.version);
  });

  it('K2: enrich SAĞ tarafı tavana takıksa çözüm fail-closed reddedilir', async () => {
    const tam = {
      summary: {
        id: 'kaynak',
        label: 'Kaynak',
        rowCount: 2,
        lastUpdated: '',
        version: 'v1',
      },
      schema: {
        columns: [{ name: 'k', type: 'string' as const, nullable: false }],
      },
      rows: [{ k: 'a' }, { k: 'b' }],
    };
    const kirpik = {
      summary: {
        id: 'kirpik',
        label: 'Kırpık',
        rowCount: 5, // gerçekte 5 satır var...
        lastUpdated: '',
        version: 'v1',
      },
      schema: {
        columns: [
          { name: 'k', type: 'string' as const, nullable: false },
          { name: 'ek', type: 'string' as const, nullable: true },
        ],
      },
      rows: [{ k: 'a', ek: 'x' }], // ...ama tarama tavanı 1 tanesini getirdi
    };
    const backend = {
      list: () => Promise.resolve([tam.summary, kirpik.summary]),
      get: (id: string) =>
        Promise.resolve(
          id === 'kaynak' ? tam : id === 'kirpik' ? kirpik : undefined,
        ),
      add: () => Promise.resolve(),
    };
    const def = makeDef({
      boards: [
        {
          type: 'enrich' as const,
          id: 'e1',
          rightDatasetId: 'kirpik',
          joinType: 'left' as const,
          conditions: [{ leftColumn: 'k', rightColumn: 'k' }],
          selectedColumns: [{ name: 'ek', type: 'string' as const }],
        },
      ],
    });
    let engine: InMemoryQueryEngine | null = null;
    const provider = new CompositeDatasetProvider(backend, makeStore([def]), {
      get: () => engine,
    } as unknown as ModuleRef);
    engine = new InMemoryQueryEngine(provider);

    let hata: unknown;
    await provider.get('live_test_1').catch((e: unknown) => (hata = e));
    expect(apiCode(hata)).toBe('RESULT_TOO_LARGE');
  });

  it('bozuk kalıcı tanım (boards eksik) listeyi/okumayı düşürmez — sessizce elenir', async () => {
    const saglam = makeDef({ id: 'live_saglam' });
    const bozuk = { id: 'live_bozuk', name: 'Bozuk' } as LiveDatasetDef; // boards yok
    const { provider } = wire([saglam, bozuk]);

    const list = await provider.list();
    expect(list.some((s) => s.id === 'live_saglam')).toBe(true);
    expect(list.some((s) => s.id === 'live_bozuk')).toBe(false);
    expect(await provider.get('live_bozuk')).toBeUndefined();
  });

  it('listede canlı dataset dürüst sürümle görünür; kaynak ilerleyince sürüm değişir', async () => {
    const def = makeDef({ boards: [filtreBoard('puan', 50)] });
    const { backend, provider } = wire([def]);

    const l1 = await provider.list();
    const once = l1.find((s) => s.id === 'live_test_1');
    expect(once).toBeDefined();

    backend.version = 'v2';
    jest.advanceTimersByTime(2_100);

    const l2 = await provider.list();
    const sonra = l2.find((s) => s.id === 'live_test_1');
    expect(sonra?.version).not.toBe(once?.version);
  });
});
