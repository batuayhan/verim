import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Query service (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /datasets lists the seeded datasets', async () => {
    const res = await request(app.getHttpServer()).get('/datasets').expect(200);
    const ids = res.body.datasets.map((d: { id: string }) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining(['birlikler', 'platformlar', 'gorevler', 'sensorler', 'izler']),
    );
  });

  it('GET /datasets/:id/schema returns typed columns', async () => {
    const res = await request(app.getHttpServer())
      .get('/datasets/izler/schema')
      .expect(200);
    expect(res.body.rowCount).toBe(20000);
    expect(res.body.schema.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'tehdit_seviyesi', type: 'integer' }),
      ]),
    );
  });

  it('GET /datasets/:id/schema 404s with contract error shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/datasets/nope/schema')
      .expect(404);
    expect(res.body.code).toBe('DATASET_NOT_FOUND');
  });

  it('POST /query executes filter + histogram with a parameter', async () => {
    const res = await request(app.getHttpServer())
      .post('/query')
      .send({
        datasetId: 'izler',
        boards: [
          {
            type: 'filter',
            id: 'b1',
            action: 'keep',
            combinator: 'and',
            conditions: [
              {
                id: 'c1',
                column: 'siniflandirma',
                operator: 'eq',
                values: [{ kind: 'parameter', name: 'siniflandirma' }],
              },
            ],
          },
          {
            type: 'histogram',
            id: 'b2',
            groupColumn: 'domain',
            aggregate: { alias: 'toplam_surat', fn: 'sum', column: 'surat_knot' },
            sort: { by: 'value', direction: 'desc' },
            pivoted: true,
          },
        ],
        parameters: { siniflandirma: 'Düşman' },
        limit: 100,
      })
      .expect(201);

    expect(res.body.schema.columns.map((c: { name: string }) => c.name)).toEqual([
      'domain',
      'toplam_surat',
    ]);
    expect(res.body.totalRows).toBeGreaterThan(0);
    // sorted desc by value
    const values = res.body.rows.map((r: { toplam_surat: number }) => r.toplam_surat);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('POST /query reports missing parameters with boardIndex', async () => {
    const res = await request(app.getHttpServer())
      .post('/query')
      .send({
        datasetId: 'izler',
        boards: [
          {
            type: 'filter',
            id: 'b1',
            action: 'keep',
            combinator: 'and',
            conditions: [
              {
                id: 'c1',
                column: 'siniflandirma',
                operator: 'eq',
                values: [{ kind: 'parameter', name: 'siniflandirma' }],
              },
            ],
          },
        ],
        parameters: {},
      })
      .expect(400);
    expect(res.body).toMatchObject({ code: 'PARAMETER_MISSING', boardIndex: 0 });
  });

  it('PUT/GET/DELETE /analyses round-trips a document', async () => {
    const doc = { id: 'e2e-a1', name: 'E2E Analizi', paths: [{ id: 'p1', boards: [] }] };
    const saved = await request(app.getHttpServer())
      .put('/analyses/e2e-a1')
      .send(doc)
      .expect(200);
    expect(saved.body.id).toBe('e2e-a1');

    const list = await request(app.getHttpServer()).get('/analyses').expect(200);
    expect(list.body.analyses.map((a: { id: string }) => a.id)).toContain('e2e-a1');

    const fetched = await request(app.getHttpServer()).get('/analyses/e2e-a1').expect(200);
    expect(fetched.body).toEqual(doc);

    await request(app.getHttpServer()).delete('/analyses/e2e-a1').expect(204);
    await request(app.getHttpServer()).get('/analyses/e2e-a1').expect(404);
  });

  it('POST /query/materialize registers a derived dataset', async () => {
    const res = await request(app.getHttpServer())
      .post('/query/materialize')
      .send({
        label: 'E2E Derived',
        datasetId: 'platformlar',
        boards: [
          {
            type: 'filter',
            id: 'b1',
            action: 'keep',
            combinator: 'and',
            conditions: [
              {
                id: 'c1',
                column: 'yakit_orani',
                operator: 'gt',
                values: [{ kind: 'literal', value: 50 }],
              },
            ],
          },
        ],
        parameters: {},
      })
      .expect(201);

    const { dataset } = res.body;
    expect(dataset.rowCount).toBeGreaterThan(0);

    const schema = await request(app.getHttpServer())
      .get(`/datasets/${dataset.id}/schema`)
      .expect(200);
    expect(schema.body.rowCount).toBe(dataset.rowCount);
  });

  it('POST /objectsets/load resolves joinLinked with prefixed columns', async () => {
    const res = await request(app.getHttpServer())
      .post('/objectsets/load')
      .send({
        def: {
          type: 'joinLinked',
          linkType: 'sensor-platform',
          columns: ['tip', 'domain'],
          base: { type: 'base', objectType: 'sensor' },
        },
        parameters: {},
        limit: 3,
      })
      .expect(201);

    expect(res.body.objectType).toBe('sensor');
    const propNames = res.body.properties.map((p: { apiName: string }) => p.apiName);
    expect(propNames).toEqual(
      expect.arrayContaining(['sensor_no', 'platform__tip', 'platform__domain']),
    );
    expect(res.body.objects[0].platform__tip).toBeTruthy();
  });

  it('POST /query rejects malformed board configs at validation', async () => {
    const res = await request(app.getHttpServer())
      .post('/query')
      .send({
        datasetId: 'izler',
        boards: [{ type: 'filter', id: 'b1' }],
        parameters: {},
      })
      .expect(400);
    expect(res.body.code).toBe('INVALID_BOARD_CONFIG');
  });
});
