/**
 * SPRINT 5 — OWL İÇE AKTARIM TESTİ
 *
 * (1) Round-trip: export → import → aynı uzantı (bağlama korunur).
 * (2) Bağlama manifesti eksik OWL reddedilir (verim:datasetId yoksa).
 */

import type { OntologyResponse } from '../src/contract/mercek';
import { ontologyToTurtle } from '../src/ontology/owl-export';
import { OwlImportError, turtleToExtension } from '../src/ontology/owl-import';

const MINI: OntologyResponse = {
  objectTypes: [
    {
      apiName: 'tesis',
      displayName: 'Tesis',
      pluralName: 'Tesisler',
      icon: '🏭',
      primaryKey: 'tesis_no',
      datasetId: 'tesisler',
      properties: [
        { apiName: 'tesis_no', displayName: 'Tesis No', type: 'string' },
        { apiName: 'kapasite', displayName: 'Kapasite', type: 'integer' },
        { apiName: 'aktif_mi', displayName: 'Aktif', type: 'boolean' },
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

describe('OWL import', () => {
  it('round-trip: export → import bağlamayı korur', () => {
    const ttl = ontologyToTurtle(MINI);
    const ext = turtleToExtension(ttl);

    expect(ext.objectTypes).toHaveLength(1);
    const t = ext.objectTypes[0];
    expect(t.apiName).toBe('tesis');
    expect(t.datasetId).toBe('tesisler'); // VERİ-BAĞLAMA korundu
    expect(t.primaryKey).toBe('tesis_no');
    expect(t.icon).toBe('🏭');
    // özellikler + tipleri (xsd round-trip)
    expect([...t.properties].sort((a, b) => a.apiName.localeCompare(b.apiName))).toEqual(
      [
        { apiName: 'aktif_mi', displayName: 'Aktif', type: 'boolean' },
        { apiName: 'kapasite', displayName: 'Kapasite', type: 'integer' },
        { apiName: 'tesis_no', displayName: 'Tesis No', type: 'string' },
      ],
    );
    expect(ext.linkTypes).toHaveLength(1);
    expect(ext.linkTypes[0]).toMatchObject({
      apiName: 'birlik-tesis',
      fromObjectType: 'birlik',
      toObjectType: 'tesis',
      cardinality: 'many',
      fromKey: 'birlik_no',
      toKey: 'birlik_no',
    });
  });

  it('bağlama manifesti eksik → reddedilir', () => {
    const eksik = `
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix verim: <https://verim.local/ontoloji#> .
verim:tesis a owl:Class ; rdfs:label "Tesis" ; verim:apiName "tesis" .
`; // verim:datasetId + verim:primaryKey YOK
    expect(() => turtleToExtension(eksik)).toThrow(OwlImportError);
    expect(() => turtleToExtension(eksik)).toThrow(/manifesti eksik/);
  });
});
