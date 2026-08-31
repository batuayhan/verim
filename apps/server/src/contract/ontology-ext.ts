import { z } from 'zod';
import { columnTypeSchema } from './zod';
import type { LinkTypeDef, ObjectTypeDef, OntologyResponse } from './mercek';

/**
 * Ontoloji UZANTI sözleşmesi (Sprint 2, ADR K3 — iki katmanlı model).
 *
 * Çekirdek MIM ontolojisi (iz/sensör/platform…) KODDA kalır (derleyici+drift
 * korumalı). Uzantı, dosyadan/arayüzden yüklenen YENİ tip ve linklerdir; asla
 * çekirdeği yeniden tanımlayamaz (çakışma reddi — `mergeExtension`).
 *
 * v1 kısıtı: uzantı tipi MEVCUT bir dataset/view'a bağlanmak zorunda
 * (`datasetId`); yeni depolama üretimi kapsam dışıdır. Bağlama bütünlüğü
 * (view/kolon gerçekten var mı) Sprint 3'ün kabul hattında denetlenir.
 */

// --- zod şemaları (contract şekillerinin alt kümesi) ------------------------

const propertyDefSchema = z.object({
  apiName: z.string().min(1),
  displayName: z.string().min(1),
  type: columnTypeSchema,
});

const objectTypeDefSchema = z.object({
  apiName: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, 'apiName: küçük harf/rakam/alt-çizgi'),
  displayName: z.string().min(1),
  pluralName: z.string().min(1),
  icon: z.string().optional(),
  primaryKey: z.string().min(1),
  properties: z.array(propertyDefSchema).min(1),
  datasetId: z.string().min(1),
});

const linkTypeDefSchema = z.object({
  apiName: z.string().min(1).regex(/^[a-z][a-z0-9_-]*$/, 'apiName: küçük harf/rakam/tire'),
  displayName: z.string().min(1),
  fromObjectType: z.string().min(1),
  toObjectType: z.string().min(1),
  cardinality: z.enum(['one', 'many']),
  fromKey: z.string().min(1),
  toKey: z.string().min(1),
});

export const ontologyExtensionSchema = z.object({
  aciklama: z.string().max(500).optional(),
  objectTypes: z.array(objectTypeDefSchema).default([]),
  linkTypes: z.array(linkTypeDefSchema).default([]),
});

export type OntologyExtension = z.infer<typeof ontologyExtensionSchema>;

// --- çekirdek koruması + birleştirme ----------------------------------------

export class OntologyMergeError extends Error {}

/**
 * Çekirdek (kod) ontolojisi ⊕ uzantı → tek OntologyResponse.
 * Çakışma = HATA (uzantı çekirdeği ezemez):
 *  - uzantı tipi apiName'i çekirdekte varsa
 *  - uzantı link apiName'i çekirdekte varsa
 *  - uzantı özelliği kendi tipinde tekrar ederse
 *  - uzantı linkinin iki ucu da (çekirdek+uzantı) tanımlı değilse
 */
export function mergeExtension(
  kernel: OntologyResponse,
  ext: OntologyExtension,
): OntologyResponse {
  const kernelTypes = new Set(kernel.objectTypes.map((t) => t.apiName));
  const kernelLinks = new Set(kernel.linkTypes.map((l) => l.apiName));

  for (const t of ext.objectTypes) {
    if (kernelTypes.has(t.apiName)) {
      throw new OntologyMergeError(`Uzantı tipi çekirdekle çakışıyor: '${t.apiName}'`);
    }
    const kolonlar = new Set<string>();
    for (const p of t.properties) {
      if (kolonlar.has(p.apiName)) {
        throw new OntologyMergeError(`'${t.apiName}' tipinde tekrarlı özellik: '${p.apiName}'`);
      }
      kolonlar.add(p.apiName);
    }
    if (!kolonlar.has(t.primaryKey)) {
      throw new OntologyMergeError(
        `'${t.apiName}' primaryKey '${t.primaryKey}' özelliklerde yok`,
      );
    }
  }

  const tumTipler = new Set([...kernelTypes, ...ext.objectTypes.map((t) => t.apiName)]);
  for (const l of ext.linkTypes) {
    if (kernelLinks.has(l.apiName)) {
      throw new OntologyMergeError(`Uzantı linki çekirdekle çakışıyor: '${l.apiName}'`);
    }
    if (!tumTipler.has(l.fromObjectType) || !tumTipler.has(l.toObjectType)) {
      throw new OntologyMergeError(
        `Link '${l.apiName}' bilinmeyen tipe bağlanıyor (${l.fromObjectType}→${l.toObjectType})`,
      );
    }
  }

  return {
    objectTypes: [...kernel.objectTypes, ...(ext.objectTypes as ObjectTypeDef[])],
    linkTypes: [...kernel.linkTypes, ...(ext.linkTypes as LinkTypeDef[])],
  };
}
