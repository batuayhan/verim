/**
 * Eşdeğerlik denetimi: aynı ObjectSet sorguları in-memory (dummy) motorda
 * ve SQL pushdown (mim) motorunda koşturulur, sonuçlar karşılaştırılır.
 * Seed IZ_SCALE'siz yapılmış olmalı (iki taraf aynı 20k izi görür).
 *
 *   DATABASE_URL=postgres://localhost/verim_mip npx ts-node src/mim/equivalence-check.ts
 */

import { DummyDatasetProvider } from '../datasets/dummy/dummy-dataset-provider';
import { ObjectSetEngine } from '../ontology/object-set-engine';
import { DummyOntologyProvider } from '../ontology/dummy-ontology-provider';
import type { ObjectSetDef } from '../contract/mercek';
import type { QueryRequest } from '../contract/api';
import { InMemoryQueryEngine } from '../query/in-memory/engine';
import { MimDatasetProvider } from './mim-dataset-provider';
import { MimOntologyProvider } from './mim-ontology';
import { SqlClient } from './sql-client';
import { SqlObjectSetEngine } from './sql-object-set-engine';
import { SqlPushdownQueryEngine } from './sql-query-engine';

type Json = unknown;

function sortRows<T extends { group?: unknown; segment?: unknown }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    `${String(a.group)}|${String(a.segment ?? '')}`.localeCompare(
      `${String(b.group)}|${String(b.segment ?? '')}`,
    ),
  );
}

function diff(name: string, a: Json, b: Json): string | null {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  return sa === sb ? null : `${name}:\n  dummy: ${sa.slice(0, 400)}\n  mim  : ${sb.slice(0, 400)}`;
}

async function main() {
  const datasets = new DummyDatasetProvider();
  await datasets.onModuleInit();
  const mem = new ObjectSetEngine(datasets, new DummyOntologyProvider());
  const sql = new SqlObjectSetEngine(new SqlClient(), new MimOntologyProvider());

  const izDusman: ObjectSetDef = {
    type: 'filter',
    base: { type: 'base', objectType: 'iz' },
    combinator: 'and',
    conditions: [
      { id: 'c', column: 'siniflandirma', operator: 'eq', values: [{ kind: 'literal', value: 'Düşman' }] },
    ],
  };
  const joined: ObjectSetDef = {
    type: 'joinLinked',
    base: { type: 'base', objectType: 'sensor' },
    linkType: 'sensor-platform',
    columns: ['cagri_adi', 'tip'],
  };
  const joinedFiltered: ObjectSetDef = {
    type: 'filter',
    base: joined,
    combinator: 'and',
    conditions: [
      { id: 'c', column: 'durum', operator: 'eq', values: [{ kind: 'parameter', name: 'durum' }] },
    ],
  };

  const failures: string[] = [];
  const check = (name: string, a: Json, b: Json) => {
    const d = diff(name, a, b);
    if (d) failures.push(d);
    else console.log(`✓ ${name}`);
  };

  // 1. base load — sayım + pk kümesi
  {
    const [a, b] = await Promise.all([
      mem.load({ def: { type: 'base', objectType: 'sensor' }, parameters: {}, limit: 500 }),
      sql.load({ def: { type: 'base', objectType: 'sensor' }, parameters: {}, limit: 500 }),
    ]);
    check('base sensor: totalCount', a.totalCount, b.totalCount);
    check(
      'base sensor: pk kümesi',
      a.objects.map((o) => o.sensor_no).sort(),
      b.objects.map((o) => o.sensor_no).sort(),
    );
  }

  // 2. joinLinked + $param filtre — sayım, şema, örnek satır
  for (const durum of ['Pasif', 'Aktif']) {
    const [a, b] = await Promise.all([
      mem.load({ def: joinedFiltered, parameters: { durum }, limit: 500 }),
      sql.load({ def: joinedFiltered, parameters: { durum }, limit: 500 }),
    ]);
    check(`joinLinked $durum=${durum}: totalCount`, a.totalCount, b.totalCount);
    check(`joinLinked $durum=${durum}: properties`, a.properties, b.properties);
    const rowA = a.objects.find((o) => o.sensor_no === a.objects[0].sensor_no);
    const rowB = b.objects.find((o) => o.sensor_no === a.objects[0].sensor_no);
    check(`joinLinked $durum=${durum}: örnek satır`, rowA, rowB);
  }

  // 3. searchAround: düşman izleri → tespit eden sensörler
  {
    const def: ObjectSetDef = { type: 'searchAround', base: izDusman, linkType: 'iz-sensor' };
    const [a, b] = await Promise.all([
      mem.load({ def, parameters: {}, limit: 500 }),
      sql.load({ def, parameters: {}, limit: 500 }),
    ]);
    check('searchAround düşman→sensör: totalCount', a.totalCount, b.totalCount);
    check(
      'searchAround düşman→sensör: pk kümesi',
      a.objects.map((o) => o.sensor_no).sort(),
      b.objects.map((o) => o.sensor_no).sort(),
    );
  }

  // 4. aggregate: iz × sınıflandırma
  {
    const req = {
      def: { type: 'base', objectType: 'iz' } as ObjectSetDef,
      parameters: {},
      groupBy: 'siniflandirma',
      metric: { fn: 'count' as const },
    };
    const [a, b] = await Promise.all([mem.aggregate(req), sql.aggregate(req)]);
    check('aggregate iz×sınıflandırma', sortRows(a.rows), sortRows(b.rows));
    check('aggregate iz×sınıflandırma: totalGroups', a.totalGroups, b.totalGroups);
  }

  // 5. aggregate segmentli: platform domain × durum
  {
    const req = {
      def: { type: 'base', objectType: 'platform' } as ObjectSetDef,
      parameters: {},
      groupBy: 'domain',
      segmentBy: 'durum',
      metric: { fn: 'count' as const },
    };
    const [a, b] = await Promise.all([mem.aggregate(req), sql.aggregate(req)]);
    check('aggregate platform domain×durum', sortRows(a.rows), sortRows(b.rows));
  }

  // 6. aggregate sum/avg: iz tehdit toplamı, menzil ortalaması
  {
    const req = {
      def: izDusman,
      parameters: {},
      groupBy: 'domain',
      metric: { fn: 'sum' as const, property: 'tehdit_seviyesi' },
    };
    const [a, b] = await Promise.all([mem.aggregate(req), sql.aggregate(req)]);
    check('aggregate düşman izleri domain×sum(tehdit)', sortRows(a.rows), sortRows(b.rows));
  }

  // 7. timeseries: iz aylık sayım
  {
    const req = {
      def: izDusman,
      parameters: {},
      dateProperty: 'tespit_zamani',
      metric: { fn: 'count' as const },
      granularity: 'month' as const,
    };
    const [a, b] = await Promise.all([mem.timeseries(req), sql.timeseries(req)]);
    check('timeseries düşman izleri aylık', a.points, b.points);
  }

  // 8. operatör çeşitleri: between + in + contains
  {
    const def: ObjectSetDef = {
      type: 'filter',
      base: { type: 'base', objectType: 'iz' },
      combinator: 'and',
      conditions: [
        { id: '1', column: 'tehdit_seviyesi', operator: 'between', values: [{ kind: 'literal', value: 3 }, { kind: 'literal', value: 5 }] },
        { id: '2', column: 'domain', operator: 'in', values: [{ kind: 'literal', value: 'Hava' }, { kind: 'literal', value: 'Deniz' }] },
        { id: '3', column: 'sensor_no', operator: 'contains', values: [{ kind: 'literal', value: 'sns-00' }] },
      ],
    };
    const [a, b] = await Promise.all([
      mem.load({ def, parameters: {}, limit: 1 }),
      sql.load({ def, parameters: {}, limit: 1 }),
    ]);
    check('between+in+contains: totalCount', a.totalCount, b.totalCount);
  }

  // 9. fromPrimaryKeys
  {
    const def: ObjectSetDef = {
      type: 'fromPrimaryKeys',
      objectType: 'platform',
      keys: ['PLT-0001', 'PLT-0199', 'PLT-0400'],
    };
    const [a, b] = await Promise.all([
      mem.load({ def, parameters: {}, limit: 10 }),
      sql.load({ def, parameters: {}, limit: 10 }),
    ]);
    check(
      'fromPrimaryKeys: satırlar',
      [...a.objects].sort((x, y) => String(x.platform_no).localeCompare(String(y.platform_no))),
      [...b.objects].sort((x, y) => String(x.platform_no).localeCompare(String(y.platform_no))),
    );
  }

  // 10. istihbarat: SIGINT raporları + tür aggregate + ize searchAround
  {
    const sigint: ObjectSetDef = {
      type: 'filter',
      base: { type: 'base', objectType: 'istihbarat_raporu' },
      combinator: 'and',
      conditions: [{ id: '1', column: 'tur', operator: 'eq', values: [{ kind: 'literal', value: 'SIGINT' }] }],
    };
    const [a, b] = await Promise.all([
      mem.load({ def: sigint, parameters: {}, limit: 500 }),
      sql.load({ def: sigint, parameters: {}, limit: 500 }),
    ]);
    check('istihbarat SIGINT: totalCount', a.totalCount, b.totalCount);
    check(
      'istihbarat SIGINT: rapor kümesi',
      a.objects.map((o) => o.rapor_no).sort(),
      b.objects.map((o) => o.rapor_no).sort(),
    );

    const aggReq = {
      def: { type: 'base', objectType: 'istihbarat_raporu' } as ObjectSetDef,
      parameters: {},
      groupBy: 'tur',
      metric: { fn: 'count' as const },
    };
    const [ag, bg] = await Promise.all([mem.aggregate(aggReq), sql.aggregate(aggReq)]);
    check('aggregate istihbarat×tür', sortRows(ag.rows), sortRows(bg.rows));

    // ize bağlı istihbarat (değer-bazlı link searchAround)
    const around: ObjectSetDef = { type: 'searchAround', base: izDusman, linkType: 'iz-raporlar' };
    const [ar, br] = await Promise.all([
      mem.load({ def: around, parameters: {}, limit: 500 }),
      sql.load({ def: around, parameters: {}, limit: 500 }),
    ]);
    check('searchAround düşman→istihbarat: totalCount', ar.totalCount, br.totalCount);
  }

  // 11. Harman QUERY motoru: in-memory ≡ SQL pushdown (filtre öneki + histogram)
  {
    const sqlClient = new SqlClient();
    const mimDs = new MimDatasetProvider(sqlClient);
    const memQ = new InMemoryQueryEngine(datasets);
    const sqlQ = new SqlPushdownQueryEngine(sqlClient, new InMemoryQueryEngine(mimDs), mimDs);

    // Canlı ingest'in eklediği izleri (IZ-A/IZ-B) dışla — iki taraf da yalnız
    // seed izlerini (IZ-0…) görsün; bu koruyucu filtre de pushdown'a girer.
    const seedGuard = {
      type: 'filter' as const, id: 'seed', action: 'keep' as const, combinator: 'and' as const,
      conditions: [{ id: 's', column: 'iz_no', operator: 'startsWith' as const, values: [{ kind: 'literal' as const, value: 'IZ-0' }] }],
    };
    const boardCases: Array<{ ad: string; boards: QueryRequest['boards'] }> = [
      {
        ad: 'filter(Düşman)+filter(tehdit≥4)',
        boards: [
          seedGuard,
          { type: 'filter', id: 'f1', action: 'keep', combinator: 'and', conditions: [
            { id: 'a', column: 'siniflandirma', operator: 'eq', values: [{ kind: 'literal', value: 'Düşman' }] }] },
          { type: 'filter', id: 'f2', action: 'keep', combinator: 'and', conditions: [
            { id: 'b', column: 'tehdit_seviyesi', operator: 'gte', values: [{ kind: 'literal', value: 4 }] }] },
        ],
      },
      {
        ad: 'filter(Hava)+histogram(sınıflandırma count)',
        boards: [
          seedGuard,
          { type: 'filter', id: 'f1', action: 'keep', combinator: 'and', conditions: [
            { id: 'a', column: 'domain', operator: 'eq', values: [{ kind: 'literal', value: 'Hava' }] }] },
          { type: 'histogram', id: 'h1', groupColumn: 'siniflandirma',
            aggregate: { alias: 'n', fn: 'count' }, sort: { by: 'label', direction: 'asc' }, pivoted: true },
        ],
      },
      {
        ad: 'filter(remove Dost)+editColumns(drop enlem)',
        boards: [
          seedGuard,
          { type: 'filter', id: 'f1', action: 'remove', combinator: 'and', conditions: [
            { id: 'a', column: 'siniflandirma', operator: 'eq', values: [{ kind: 'literal', value: 'Dost' }] }] },
          { type: 'editColumns', id: 'e1', operations: [{ op: 'drop', column: 'enlem' }] },
        ],
      },
    ];

    for (const tc of boardCases) {
      const req = (boards: QueryRequest['boards']): QueryRequest => ({
        datasetId: 'izler', boards, parameters: {}, limit: 500,
      });
      const [a, b] = await Promise.all([memQ.execute(req(tc.boards)), sqlQ.execute(req(tc.boards))]);
      check(`query ${tc.ad}: totalRows`, a.totalRows, b.totalRows);
      check(`query ${tc.ad}: şema`, a.schema, b.schema);
      const key = (r: Record<string, unknown>) => JSON.stringify(r);
      check(`query ${tc.ad}: satır kümesi`, a.rows.map(key).sort(), b.rows.map(key).sort());
    }
    await sqlClient.onModuleDestroy();
  }

  if (failures.length) {
    console.error(`\n✗ ${failures.length} eşdeğerlik hatası:\n` + failures.join('\n\n'));
    process.exit(1);
  }
  console.log('\nTüm eşdeğerlik denetimleri geçti.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
