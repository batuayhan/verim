/**
 * SPRINT 4 — ETKİ ANALİZİ + YÖNETİŞİM TESTİ
 *
 * Bugünkü derleyicinin YAPAMADIĞINI kanıtlar: (a) DÖRT-GÖZ — yükleyen kendi
 * uzantısını onaylayamaz; (b) REFERANSLI SİLME reddi — kayıtlı bir analiz bir
 * tipe referans veriyorsa o tipi düşüren sürüm aktifleştirilemez;
 * (c) ROLLBACK — bir önceki aktif sürüme tek çağrıda dönüş; (d) denetim izi tam.
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { DummyDatasetProvider } from '../src/datasets/dummy/dummy-dataset-provider';
import { SqlClient } from '../src/mim/sql-client';
import { AdmissionService } from '../src/ontology/admission/admission.service';
import { GovernanceService } from '../src/ontology/admission/governance.service';
import { DummyOntologyProvider } from '../src/ontology/dummy-ontology-provider';
import { OntologyAudit } from '../src/ontology/ontology-audit';
import { OntologyExtStore } from '../src/ontology/ontology-ext-store';
import { DummySchemaIntrospector } from '../src/ontology/schema-introspector';

const DATA = join(process.cwd(), '.data');
const temizle = () => {
  for (const f of ['ontology-extensions.json', 'ontology-audit.jsonl']) {
    rmSync(join(DATA, f), { force: true });
  }
};

// 'birlikler'e bağlı geçerli tesis uzantısı
const TESIS = {
  aciklama: 'tesis v1',
  objectTypes: [{
    apiName: 'tesis', displayName: 'Tesis', pluralName: 'Tesisler',
    primaryKey: 'birlik_no', datasetId: 'birlikler',
    properties: [
      { apiName: 'birlik_no', displayName: 'No', type: 'string' },
      { apiName: 'ad', displayName: 'Ad', type: 'string' },
    ],
  }],
  linkTypes: [],
};
// tesis'i düşüren boş sürüm
const BOS = { aciklama: 'tesis silindi', objectTypes: [], linkTypes: [] };

/** Sahte artefakt store (list/get/upsert) */
function fakeStore(docs: Record<string, unknown> = {}) {
  return {
    list: () => Object.keys(docs).map((id) => ({ id, name: id })),
    get: (id: string) => docs[id],
    upsert: (id: string, doc: unknown) => { docs[id] = doc; },
  };
}

function kurGov(mercekDocs: Record<string, unknown> = {}) {
  const datasets = new DummyDatasetProvider();
  const admission = new AdmissionService(
    new DummyOntologyProvider(), datasets, new DummySchemaIntrospector(datasets), new SqlClient(),
  );
  const store = new OntologyExtStore();
  const audit = new OntologyAudit();
  const gov = new GovernanceService(
    admission, store, audit,
    fakeStore(mercekDocs) as never, // mercek
    fakeStore() as never,           // harman
    fakeStore() as never,           // alarm
    fakeStore() as never,           // dashboard
  );
  return { gov, store, audit, datasets };
}

describe('Yönetişim (Sprint 4)', () => {
  beforeEach(temizle);
  afterAll(temizle);

  it('geçerli uzantı yüklenince dogrulandi olur + denetim yazılır', async () => {
    const { gov, store, audit, datasets } = kurGov();
    await datasets.onModuleInit();
    const r = await gov.yukle(TESIS, 'ali');
    expect(r.rapor.gecti).toBe(true);
    expect(store.surum(r.surum!)?.durum).toBe('dogrulandi');
    expect(audit.oku().some((k) => k.eylem === 'yukle')).toBe(true);
  });

  it('DÖRT-GÖZ: yükleyen kendi uzantısını onaylayamaz', async () => {
    const { gov, datasets } = kurGov();
    await datasets.onModuleInit();
    const { surum } = await gov.yukle(TESIS, 'ali');
    const kendi = gov.onayla(surum!, 'ali');
    expect(kendi.ok).toBe(false);
    expect(kendi.hata).toMatch(/dört-göz/i);
    const baskasi = gov.onayla(surum!, 'veli');
    expect(baskasi.ok).toBe(true);
  });

  it('tam akış: yükle→onayla→aktifleştir; sonra REFERANSLI SİLME reddi', async () => {
    // v1 tesis aktif; bir Mercek analizi tesis'e referans versin
    const mercek = { 'analiz-1': { def: { type: 'base', objectType: 'tesis' } } };
    const { gov, store, datasets } = kurGov(mercek);
    await datasets.onModuleInit();

    const v1 = await gov.yukle(TESIS, 'ali');
    expect(gov.onayla(v1.surum!, 'veli').ok).toBe(true);
    expect(gov.aktiflestir(v1.surum!, 'ali').ok).toBe(true);
    expect(store.aktif()?.surum).toBe(v1.surum);

    // v2 tesis'i düşürüyor → referanslı silme, kademe 4 reddi
    const v2 = await gov.yukle(BOS, 'ali');
    expect(v2.rapor.gecti).toBe(false);
    expect(v2.rapor.durduranKademe).toBe(4);
    expect(v2.etkilenen.some((e) => e.silinen === 'tesis' && e.tur === 'mercek')).toBe(true);
    expect(store.surum(v2.surum!)?.durum).toBe('taslak'); // aktifleşemez
  });

  it('ROLLBACK: önceki aktif sürüme döner', async () => {
    // referans olmadan iki sürüm aktifleştir, sonra geri dön
    const { gov, store, datasets } = kurGov();
    await datasets.onModuleInit();
    const v1 = await gov.yukle(TESIS, 'ali');
    gov.onayla(v1.surum!, 'veli'); gov.aktiflestir(v1.surum!, 'ali');
    const v2 = await gov.yukle({ ...TESIS, aciklama: 'v2' }, 'ali'); // yeni sürüm (tesis korunur)
    gov.onayla(v2.surum!, 'veli'); gov.aktiflestir(v2.surum!, 'ali');
    expect(store.aktif()?.surum).toBe(v2.surum);

    const geri = gov.geriDon('ali');
    expect(geri.ok).toBe(true);
    expect(store.aktif()?.surum).toBe(v1.surum);
  });

  it('ROLLBACK (ilk sürüm): uzantısız çekirdeğe döner', async () => {
    const { gov, store, datasets } = kurGov();
    await datasets.onModuleInit();
    const v1 = await gov.yukle(TESIS, 'ali');
    gov.onayla(v1.surum!, 'veli'); gov.aktiflestir(v1.surum!, 'ali');
    expect(store.aktif()?.surum).toBe(v1.surum);
    const geri = gov.geriDon('ali');
    expect(geri.ok).toBe(true);
    expect(store.aktif()).toBeUndefined(); // aktif yok → composite saf çekirdek
  });
});
