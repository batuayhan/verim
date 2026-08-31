import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * Canlı dataset ("kaydedilmiş sorgunun dinamik sonucu") uçtan uca testleri.
 *
 * Kalıcılık gerçek store üzerinden (.data/live-datasets.json) — her test
 * kendi oluşturduğunu siler; ayrıca açılışta eski koşulardan artık kalmışsa
 * temizlenir (etiket 'E2E ' öneklidir).
 */
describe('Canlı dataset (e2e)', () => {
  let app: INestApplication<App>;
  const olusanlar: string[] = [];

  const filtre = (column: string, value: string) => ({
    type: 'filter',
    id: 'f1',
    action: 'keep',
    combinator: 'and',
    conditions: [
      {
        id: 'c1',
        column,
        operator: 'eq',
        values: [{ kind: 'literal', value }],
      },
    ],
  });

  async function temizle(id: string): Promise<void> {
    await request(app.getHttpServer()).delete(`/query/live/${id}`);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    // Önceki yarım kalmış koşulardan artıkları süpür
    const res = await request(app.getHttpServer()).get('/query/live');
    for (const d of res.body.liveDatasets as Array<{
      id: string;
      label: string;
    }>) {
      if (d.label.startsWith('E2E ')) await temizle(d.id);
    }
  });

  afterAll(async () => {
    for (const id of [...olusanlar].reverse()) await temizle(id);
    await app.close();
  });

  it('oluşturur, /datasets listesinde ve şema ucunda görünür', async () => {
    const created = await request(app.getHttpServer())
      .post('/query/live')
      .send({
        label: 'E2E Canlı Düşman İzleri',
        datasetId: 'izler',
        boards: [filtre('siniflandirma', 'Düşman')],
        parameters: {},
      })
      .expect(201);

    const id = created.body.dataset.id as string;
    olusanlar.push(id);
    expect(id).toMatch(/^live_/);
    expect(created.body.dataset.rowCount).toBeGreaterThan(0);

    const list = await request(app.getHttpServer())
      .get('/datasets')
      .expect(200);
    const summary = list.body.datasets.find((d: { id: string }) => d.id === id);
    expect(summary).toBeDefined();
    expect(summary.version).toMatch(/^live-/);

    const schema = await request(app.getHttpServer())
      .get(`/datasets/${id}/schema`)
      .expect(200);
    expect(schema.body.schema.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'siniflandirma' }),
      ]),
    );
  });

  it('canlı dataset üzerinde sorgu, aynı zincirin doğrudan koşulmasıyla BİREBİR aynı sonucu verir', async () => {
    const created = await request(app.getHttpServer())
      .post('/query/live')
      .send({
        label: 'E2E Eşdeğerlik',
        datasetId: 'izler',
        boards: [filtre('siniflandirma', 'Düşman')],
        parameters: {},
      })
      .expect(201);
    const id = created.body.dataset.id as string;
    olusanlar.push(id);

    const histogram = {
      type: 'histogram',
      id: 'h1',
      groupColumn: 'domain',
      aggregate: { alias: 'adet', fn: 'count' },
      sort: { by: 'label', direction: 'asc' },
      pivoted: true,
    };

    const canli = await request(app.getHttpServer())
      .post('/query')
      .send({ datasetId: id, boards: [histogram], parameters: {}, limit: 100 })
      .expect(201);

    const dogrudan = await request(app.getHttpServer())
      .post('/query')
      .send({
        datasetId: 'izler',
        boards: [filtre('siniflandirma', 'Düşman'), histogram],
        parameters: {},
        limit: 100,
      })
      .expect(201);

    expect(canli.body.rows).toEqual(dogrudan.body.rows);
    expect(canli.body.schema).toEqual(dogrudan.body.schema);
  });

  it('canlı-üstüne-canlı zincirleme çalışır ve silme koruması bağımlıyı bekler', async () => {
    const alt = await request(app.getHttpServer())
      .post('/query/live')
      .send({
        label: 'E2E Alt Küme',
        datasetId: 'izler',
        boards: [filtre('siniflandirma', 'Düşman')],
        parameters: {},
      })
      .expect(201);
    const altId = alt.body.dataset.id as string;

    const ust = await request(app.getHttpServer())
      .post('/query/live')
      .send({
        label: 'E2E Üst Küme',
        datasetId: altId,
        boards: [filtre('domain', 'Hava')],
        parameters: {},
      })
      .expect(201);
    const ustId = ust.body.dataset.id as string;

    // Üstteki sonuç = iki filtrenin doğrudan zinciriyle aynı sayım
    const dogrudan = await request(app.getHttpServer())
      .post('/query')
      .send({
        datasetId: 'izler',
        boards: [filtre('siniflandirma', 'Düşman'), filtre('domain', 'Hava')],
        parameters: {},
        limit: 1,
      })
      .expect(201);
    expect(ust.body.dataset.rowCount).toBe(dogrudan.body.totalRows);

    // Bağımlı varken kaynak silinemez — referanslı silme koruması
    const red = await request(app.getHttpServer())
      .delete(`/query/live/${altId}`)
      .expect(400);
    expect(red.body.code).toBe('INVALID_BOARD_CONFIG');
    expect(red.body.message).toContain(ustId);

    // Doğru sıra: önce bağımlı, sonra kaynak
    await request(app.getHttpServer())
      .delete(`/query/live/${ustId}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/query/live/${altId}`)
      .expect(204);

    const list = await request(app.getHttpServer())
      .get('/datasets')
      .expect(200);
    const kalan = list.body.datasets.map((d: { id: string }) => d.id);
    expect(kalan).not.toContain(altId);
    expect(kalan).not.toContain(ustId);
  });

  it('enrich içeren tarif çalışır (platform + birlik adı)', async () => {
    const created = await request(app.getHttpServer())
      .post('/query/live')
      .send({
        label: 'E2E Platform Birlik',
        datasetId: 'platformlar',
        boards: [
          {
            type: 'enrich',
            id: 'e1',
            rightDatasetId: 'birlikler',
            joinType: 'left',
            conditions: [{ leftColumn: 'birlik_no', rightColumn: 'birlik_no' }],
            selectedColumns: [{ name: 'ad', type: 'string' }],
          },
        ],
        parameters: {},
      })
      .expect(201);
    const id = created.body.dataset.id as string;
    olusanlar.push(id);

    const schema = await request(app.getHttpServer())
      .get(`/datasets/${id}/schema`)
      .expect(200);
    expect(schema.body.schema.columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'ad' })]),
    );
  });

  it('kabul hattı: bozuk tarif (bilinmeyen kolon) SAKLANMADAN reddedilir', async () => {
    const onceki = await request(app.getHttpServer()).get('/query/live');
    const oncekiSayi = onceki.body.liveDatasets.length as number;

    const res = await request(app.getHttpServer())
      .post('/query/live')
      .send({
        label: 'E2E Bozuk',
        datasetId: 'izler',
        boards: [filtre('olmayan_kolon', 'x')],
        parameters: {},
      })
      .expect(400);
    expect(res.body.code).toBe('INVALID_BOARD_CONFIG');
    expect(res.body.message).toContain('olmayan_kolon');

    const sonraki = await request(app.getHttpServer()).get('/query/live');
    expect(sonraki.body.liveDatasets.length).toBe(oncekiSayi);
  });

  it('kabul hattı: bağlanmamış $parametre PARAMETER_MISSING ile reddedilir', async () => {
    const res = await request(app.getHttpServer())
      .post('/query/live')
      .send({
        label: 'E2E Parametresiz',
        datasetId: 'izler',
        boards: [
          {
            type: 'filter',
            id: 'f1',
            action: 'keep',
            combinator: 'and',
            conditions: [
              {
                id: 'c1',
                column: 'siniflandirma',
                operator: 'eq',
                values: [{ kind: 'parameter', name: 'sinif' }],
              },
            ],
          },
        ],
        parameters: {},
      })
      .expect(400);
    expect(res.body.code).toBe('PARAMETER_MISSING');
  });

  it('bilinmeyen kaynak 404, bilinmeyen canlı id silme 404', async () => {
    const res = await request(app.getHttpServer())
      .post('/query/live')
      .send({
        label: 'E2E Kayıp Kaynak',
        datasetId: 'boyle_dataset_yok',
        boards: [],
        parameters: {},
      })
      .expect(404);
    expect(res.body.code).toBe('DATASET_NOT_FOUND');

    await request(app.getHttpServer())
      .delete('/query/live/live_olmayan_id')
      .expect(404);
  });

  it('anlık görüntü (derived) kaynak olamaz — oturumluk kaynağa kalıcı tarif bağlanmaz', async () => {
    const mat = await request(app.getHttpServer())
      .post('/query/materialize')
      .send({
        label: 'E2E Snapshot',
        datasetId: 'birlikler',
        boards: [],
        parameters: {},
      })
      .expect(201);
    const derivedId = mat.body.dataset.id as string;
    expect(derivedId).toMatch(/^derived_/);

    const res = await request(app.getHttpServer())
      .post('/query/live')
      .send({
        label: 'E2E Snapshot Üstü',
        datasetId: derivedId,
        boards: [],
        parameters: {},
      })
      .expect(400);
    expect(res.body.message).toContain('anlık görüntü');
  });

  it("kayıtlı bir analiz canlı dataset'e başvuruyorsa silme reddedilir (yönetişim çıtası)", async () => {
    const created = await request(app.getHttpServer())
      .post('/query/live')
      .send({
        label: 'E2E Korunan',
        datasetId: 'birlikler',
        boards: [],
        parameters: {},
      })
      .expect(201);
    const id = created.body.dataset.id as string;

    // Bu id'ye başvuran bir Harman analizi kaydet
    await request(app.getHttpServer())
      .put('/analyses/e2e-canli-koruma')
      .send({
        id: 'e2e-canli-koruma',
        name: 'E2E Koruma',
        paths: [{ id: 'p1', source: { kind: 'dataset', datasetId: id } }],
      })
      .expect(200);

    const red = await request(app.getHttpServer())
      .delete(`/query/live/${id}`)
      .expect(400);
    expect(red.body.message).toContain('Harman analizi');

    // Analiz silinince canlı dataset de silinebilir
    await request(app.getHttpServer())
      .delete('/analyses/e2e-canli-koruma')
      .expect(204);
    await request(app.getHttpServer()).delete(`/query/live/${id}`).expect(204);
  });

  it('boş zincir kaynağın canlı takma adıdır; tarif ucu tanımı aynen döner', async () => {
    const created = await request(app.getHttpServer())
      .post('/query/live')
      .send({
        label: 'E2E Takma Ad',
        datasetId: 'birlikler',
        boards: [],
        parameters: {},
      })
      .expect(201);
    const id = created.body.dataset.id as string;
    olusanlar.push(id);
    expect(created.body.dataset.rowCount).toBe(120); // birlikler sabit boyu

    const def = await request(app.getHttpServer())
      .get(`/query/live/${id}`)
      .expect(200);
    expect(def.body.sourceDatasetId).toBe('birlikler');
    expect(def.body.boards).toEqual([]);
  });
});
