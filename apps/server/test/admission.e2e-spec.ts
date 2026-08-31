/**
 * SPRINT 3 — KABUL HATTI TESTİ (kademe 1-3)
 *
 * "Yüklenmez" güvencesi: geçerli görünüp ZARARLI/ÇALIŞMAYAN aday uzantı,
 * DOĞRU kademede, DOĞRU kodla yakalanmalı. 1 geçerli + 6 bozuk vaka.
 * Dummy çekirdek üzerinde koşar (DB yok); doğrulama salt-okunur.
 */

import { DummyDatasetProvider } from '../src/datasets/dummy/dummy-dataset-provider';
import { SqlClient } from '../src/mim/sql-client';
import { AdmissionService } from '../src/ontology/admission/admission.service';
import { DummyOntologyProvider } from '../src/ontology/dummy-ontology-provider';
import { DummySchemaIntrospector } from '../src/ontology/schema-introspector';

// Geçerli aday: 'birlikler' dataset'ine bağlı (kolonları gerçek), link iki uçta anahtarlı
const GECERLI = {
  aciklama: 'geçerli tesis',
  objectTypes: [
    {
      apiName: 'tesis',
      displayName: 'Tesis',
      pluralName: 'Tesisler',
      primaryKey: 'birlik_no',
      datasetId: 'birlikler',
      properties: [
        { apiName: 'birlik_no', displayName: 'No', type: 'string' },
        { apiName: 'ad', displayName: 'Ad', type: 'string' },
      ],
    },
  ],
  linkTypes: [
    {
      apiName: 'birlik-tesis',
      displayName: 'Birliğin tesisleri',
      fromObjectType: 'birlik',
      toObjectType: 'tesis',
      cardinality: 'many',
      fromKey: 'birlik_no',
      toKey: 'birlik_no',
    },
  ],
};

const clone = () => JSON.parse(JSON.stringify(GECERLI));

describe('Kabul hattı (kademe 1-3)', () => {
  let admission: AdmissionService;

  beforeAll(async () => {
    const datasets = new DummyDatasetProvider();
    await datasets.onModuleInit();
    admission = new AdmissionService(
      new DummyOntologyProvider(),
      datasets,
      new DummySchemaIntrospector(datasets),
      new SqlClient(),
    );
  });

  it('GEÇERLİ aday tüm kademelerden geçer', async () => {
    const r = await admission.dogrula(GECERLI);
    expect(r.gecti).toBe(true);
    expect(r.kademeler).toHaveLength(3);
  });

  it('(a) olmayan dataset → kademe 2 DATASET_YOK', async () => {
    const c = clone();
    c.objectTypes[0].datasetId = 'yok_boyle_bir_dataset';
    const r = await admission.dogrula(c);
    expect(r.durduranKademe).toBe(2);
    expect(r.kademeler[1].bulgular.some((b: { kod: string }) => b.kod === 'DATASET_YOK')).toBe(true);
  });

  it('(b) eksik kolon → kademe 2 KOLON_YOK', async () => {
    const c = clone();
    c.objectTypes[0].properties.push({ apiName: 'yok_kolon', displayName: 'Yok', type: 'string' });
    const r = await admission.dogrula(c);
    expect(r.durduranKademe).toBe(2);
    expect(r.kademeler[1].bulgular.some((b: { kod: string }) => b.kod === 'KOLON_YOK')).toBe(true);
  });

  it('(c) tip uyumsuzluğu → kademe 2 TIP_UYUMSUZ', async () => {
    const c = clone();
    // 'ad' kaynakta string; integer bildir
    c.objectTypes[0].properties[1].type = 'integer';
    const r = await admission.dogrula(c);
    expect(r.durduranKademe).toBe(2);
    expect(r.kademeler[1].bulgular.some((b: { kod: string }) => b.kod === 'TIP_UYUMSUZ')).toBe(true);
  });

  it('(d) kırık link ucu → kademe 2 LINK_*KEY_YOK', async () => {
    const c = clone();
    c.linkTypes[0].fromKey = 'yok_anahtar';
    const r = await admission.dogrula(c);
    expect(r.durduranKademe).toBe(2);
    expect(r.kademeler[1].bulgular.some((b: { kod: string }) => b.kod === 'LINK_FROMKEY_YOK')).toBe(true);
  });

  it('(e) çekirdek apiName çakışması → kademe 2 BIRLESTIRME', async () => {
    const c = clone();
    c.objectTypes[0].apiName = 'birlik'; // çekirdekte var
    const r = await admission.dogrula(c);
    expect(r.durduranKademe).toBe(2);
    expect(r.kademeler[1].bulgular.some((b: { kod: string }) => b.kod === 'BIRLESTIRME')).toBe(true);
  });

  it('(f) boş primaryKey → kademe 1 SEMA_HATA', async () => {
    const c = clone();
    c.objectTypes[0].primaryKey = '';
    const r = await admission.dogrula(c);
    expect(r.durduranKademe).toBe(1);
    expect(r.kademeler[0].bulgular.some((b: { kod: string }) => b.kod === 'SEMA_HATA')).toBe(true);
  });
});
