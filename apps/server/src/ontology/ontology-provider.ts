/**
 * OntologyProvider — ontoloji port'u.
 *
 * Bugün: dummy dataset'lerin üzerine statik tanım (DummyOntologyProvider).
 * Yarın: MIP information model adapter'ı bu portu implemente eder —
 * nesne tipleri, property'ler ve ilişkiler oradan gelir; controller ve
 * object set engine değişmez.
 */

import type { OntologyResponse } from '../contract/mercek';

export interface OntologyProvider {
  getOntology(): Promise<OntologyResponse>;
}

export const ONTOLOGY_PROVIDER = Symbol('ONTOLOGY_PROVIDER');
