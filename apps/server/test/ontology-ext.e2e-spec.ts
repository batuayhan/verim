/**
 * SPRINT 2 — İKİ KATMANLI ONTOLOJİ TESTİ
 *
 * En kritik güvence: bayrak KAPALIYKEN dışa görünen ontoloji ÇEKİRDEKLE
 * BİT-EŞ olmalı (uzantı altyapısı sisteme sızmamalı). Ayrıca çekirdek
 * koruması (çakışma reddi) ve uzantı birleştirme doğrulanır.
 */

import { CompositeOntologyProvider, KERNEL_ONTOLOGY_PROVIDER as _K } from '../src/ontology/composite-ontology-provider';
import { OntologyMergeError, mergeExtension, type OntologyExtension } from '../src/contract/ontology-ext';
import { DummyOntologyProvider } from '../src/ontology/dummy-ontology-provider';
import { MimOntologyProvider } from '../src/mim/mim-ontology';
import type { OntologyExtStore, StoredExtVersion } from '../src/ontology/ontology-ext-store';
import type { OntologyProvider } from '../src/ontology/ontology-provider';

void _K;

/** Sadece aktif()'i olan sahte store */
function fakeStore(aktifIcerik?: OntologyExtension): OntologyExtStore {
  return {
    aktif: () =>
      aktifIcerik
        ? ({ surum: 1, durum: 'aktif', icerik: aktifIcerik } as StoredExtVersion)
        : undefined,
  } as unknown as OntologyExtStore;
}

const ORNEK_UZANTI: OntologyExtension = {
  aciklama: 'test tesisi',
  objectTypes: [
    {
      apiName: 'tesis',
      displayName: 'Tesis',
      pluralName: 'Tesisler',
      icon: '🏭',
      primaryKey: 'tesis_no',
      datasetId: 'birlikler', // v1: mevcut bir dataset'e bağlı (bütünlük Sprint 3'te)
      properties: [
        { apiName: 'tesis_no', displayName: 'Tesis No', type: 'string' },
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

describe.each<[string, OntologyProvider]>([
  ['dummy', new DummyOntologyProvider()],
  ['mim', new MimOntologyProvider()],
])('İki katmanlı ontoloji (%s çekirdek)', (_ad, kernel) => {
  const withFlag = (v: string | undefined, fn: () => Promise<void>) => async () => {
    const prev = process.env.ONTOLOGY_EXTENSIONS;
    if (v === undefined) delete process.env.ONTOLOGY_EXTENSIONS;
    else process.env.ONTOLOGY_EXTENSIONS = v;
    try {
      await fn();
    } finally {
      if (prev === undefined) delete process.env.ONTOLOGY_EXTENSIONS;
      else process.env.ONTOLOGY_EXTENSIONS = prev;
    }
  };

  it('bayrak KAPALI → çekirdekle bit-eş (parite)', withFlag('off', async () => {
    const comp = new CompositeOntologyProvider(kernel, fakeStore(ORNEK_UZANTI));
    const cikti = await comp.getOntology();
    const cekirdek = await kernel.getOntology();
    expect(cikti).toEqual(cekirdek); // aktif uzantı OLSA BİLE bayrak kapalıysa uygulanmaz
  }));

  it('bayrak AÇIK ama aktif uzantı yok → çekirdekle eş', withFlag('on', async () => {
    const comp = new CompositeOntologyProvider(kernel, fakeStore(undefined));
    expect(await comp.getOntology()).toEqual(await kernel.getOntology());
  }));

  it('bayrak AÇIK + aktif uzantı → tip/link eklenir', withFlag('on', async () => {
    const comp = new CompositeOntologyProvider(kernel, fakeStore(ORNEK_UZANTI));
    const cekirdek = await kernel.getOntology();
    const cikti = await comp.getOntology();
    expect(cikti.objectTypes.length).toBe(cekirdek.objectTypes.length + 1);
    expect(cikti.linkTypes.length).toBe(cekirdek.linkTypes.length + 1);
    expect(cikti.objectTypes.some((t) => t.apiName === 'tesis')).toBe(true);
    expect(cikti.linkTypes.some((l) => l.apiName === 'birlik-tesis')).toBe(true);
  }));

  it('geçersiz aktif uzantı → çekirdeğe güvenli düşer (çökmez)', withFlag('on', async () => {
    // birlik zaten çekirdekte → çakışma; composite hatayı yakalayıp çekirdeğe döner
    const cakisan: OntologyExtension = {
      objectTypes: [{ ...ORNEK_UZANTI.objectTypes[0], apiName: 'birlik' }],
      linkTypes: [],
    };
    const comp = new CompositeOntologyProvider(kernel, fakeStore(cakisan));
    expect(await comp.getOntology()).toEqual(await kernel.getOntology());
  }));
});

describe('mergeExtension — çekirdek koruması', () => {
  const kernel = { objectTypes: [{ apiName: 'iz' } as never], linkTypes: [{ apiName: 'iz-sensor' } as never] };

  it('tip apiName çakışması reddedilir', () => {
    expect(() =>
      mergeExtension(kernel as never, { objectTypes: [{ ...ORNEK_UZANTI.objectTypes[0], apiName: 'iz' }], linkTypes: [] }),
    ).toThrow(OntologyMergeError);
  });

  it('link apiName çakışması reddedilir', () => {
    expect(() =>
      mergeExtension(kernel as never, {
        objectTypes: [],
        linkTypes: [{ ...ORNEK_UZANTI.linkTypes[0], apiName: 'iz-sensor', fromObjectType: 'iz', toObjectType: 'iz' }],
      }),
    ).toThrow(/çekirdekle çakışıyor/);
  });

  it('bilinmeyen tipe bağlanan link reddedilir', () => {
    expect(() =>
      mergeExtension(kernel as never, {
        objectTypes: [],
        linkTypes: [{ ...ORNEK_UZANTI.linkTypes[0], fromObjectType: 'yokk', toObjectType: 'iz' }],
      }),
    ).toThrow(/bilinmeyen tipe/);
  });

  it('tekrarlı özellik reddedilir', () => {
    expect(() =>
      mergeExtension(kernel as never, {
        objectTypes: [{
          ...ORNEK_UZANTI.objectTypes[0],
          properties: [
            { apiName: 'x', displayName: 'X', type: 'string' },
            { apiName: 'x', displayName: 'X2', type: 'string' },
          ],
          primaryKey: 'x',
        }],
        linkTypes: [],
      }),
    ).toThrow(/tekrarlı özellik/);
  });
});
