import { Injectable } from '@nestjs/common';
import type {
  LinkTypeDef,
  ObjectTypeDef,
  OntologyResponse,
  PropertyDef,
} from '../contract/mercek';
import type { OntologyProvider } from '../ontology/ontology-provider';

/**
 * MIM (MIP Information Model) eşleme katmanı.
 *
 * Verim'in nesne tipleri, özellikleri ve ilişkileri burada MIM
 * entity/attribute/association'larına deklaratif olarak bağlanır;
 * MimOntologyProvider Verim ontolojisini bu eşlemeden TÜRETİR — elle
 * yazılmış ikinci bir ontoloji tanımı yoktur. Gerçek MIM modeli
 * (MIP4-IES / UML-OWL temsili) devreye girdiğinde bu eşleme onun
 * üzerinden doğrulanır/üretilir; Verim contract'ı sabit kalır.
 *
 * `mim` alanları belgeleme + izlenebilirlik içindir; /ontology yanıtına
 * girmez (contract değişmez).
 */

interface MimProperty extends PropertyDef {
  /** Kaynak MIM attribute'u (Entity.attribute) */
  mim: string;
}

interface MimObjectType extends Omit<ObjectTypeDef, 'properties'> {
  /** Kaynak MIM entity'si (+ ayrıştırıcı kategori) */
  mim: string;
  properties: MimProperty[];
}

interface MimLink extends LinkTypeDef {
  /** Kaynak MIM association'ı */
  mim: string;
}

export const MIM_MODEL: { objectTypes: MimObjectType[]; linkTypes: MimLink[] } = {
  objectTypes: [
    {
      apiName: 'birlik',
      mim: 'Organisation',
      displayName: 'Birlik',
      pluralName: 'Birlikler',
      icon: '🎖️',
      primaryKey: 'birlik_no',
      datasetId: 'birlikler',
      properties: [
        { apiName: 'birlik_no', mim: 'ObjectItem.alternateIdentificationText', displayName: 'Birlik No', type: 'string' },
        { apiName: 'ad', mim: 'ObjectItem.nameText', displayName: 'Ad', type: 'string' },
        { apiName: 'domain', mim: 'Organisation.domainCode', displayName: 'Domain', type: 'string' },
        { apiName: 'kademe', mim: 'Organisation.echelonCode', displayName: 'Kademe', type: 'string' },
        { apiName: 'bolge', mim: 'Organisation.regionText', displayName: 'Bölge', type: 'string' },
        { apiName: 'durum', mim: 'OrganisationStatus.operationalStatusCode', displayName: 'Durum', type: 'string' },
        { apiName: 'personel', mim: 'OrganisationStatus.personnelStrengthQuantity', displayName: 'Personel', type: 'integer' },
        { apiName: 'hazirlik_orani', mim: 'OrganisationStatus.readinessRateQuantity', displayName: 'Hazırlık Oranı', type: 'integer' },
        { apiName: 'komutan_no', mim: 'CommandAndControl.commanderPerson', displayName: 'Komutan', type: 'string' },
        { apiName: 'us_adi', mim: 'Facility.nameText', displayName: 'Üs / Garnizon', type: 'string' },
      ],
    },
    {
      apiName: 'platform',
      mim: 'Materiel[categoryCode=PLATFORM]',
      displayName: 'Platform',
      pluralName: 'Platformlar',
      icon: '🛩️',
      primaryKey: 'platform_no',
      datasetId: 'platformlar',
      properties: [
        { apiName: 'platform_no', mim: 'ObjectItem.alternateIdentificationText', displayName: 'Platform No', type: 'string' },
        { apiName: 'cagri_adi', mim: 'ObjectItem.nameText', displayName: 'Çağrı Adı', type: 'string' },
        { apiName: 'tip', mim: 'Materiel.typeText', displayName: 'Tip', type: 'string' },
        { apiName: 'domain', mim: 'Materiel.domainCode', displayName: 'Domain', type: 'string' },
        { apiName: 'birlik_no', mim: 'Holding.organisation', displayName: 'Bağlı Birlik', type: 'string' },
        { apiName: 'durum', mim: 'MaterielStatus.operationalStatusCode', displayName: 'Durum', type: 'string' },
        { apiName: 'yakit_orani', mim: 'MaterielStatus.fuelRateQuantity', displayName: 'Yakıt Oranı', type: 'integer' },
        { apiName: 'surat_knot', mim: 'ObjectItemLocation.speedQuantityKnots', displayName: 'Sürat (knot)', type: 'integer' },
        { apiName: 'enlem', mim: 'ObjectItemLocation.latitudeCoordinate', displayName: 'Enlem', type: 'double' },
        { apiName: 'boylam', mim: 'ObjectItemLocation.longitudeCoordinate', displayName: 'Boylam', type: 'double' },
        { apiName: 'kuyruk_no', mim: 'Materiel.serialIdentificationText', displayName: 'Kuyruk No', type: 'string' },
        { apiName: 'uretici', mim: 'Materiel.manufacturerText', displayName: 'Üretici', type: 'string' },
      ],
    },
    {
      apiName: 'gorev',
      mim: 'ActionTask',
      displayName: 'Görev',
      pluralName: 'Görevler',
      icon: '🎯',
      primaryKey: 'gorev_no',
      datasetId: 'gorevler',
      properties: [
        { apiName: 'gorev_no', mim: 'Action.alternateIdentificationText', displayName: 'Görev No', type: 'string' },
        { apiName: 'tip', mim: 'ActionTask.taskTypeText', displayName: 'Tip', type: 'string' },
        { apiName: 'durum', mim: 'ActionTaskStatus.operationalStatusCode', displayName: 'Durum', type: 'string' },
        { apiName: 'oncelik', mim: 'ActionTask.priorityCode', displayName: 'Öncelik', type: 'integer' },
        { apiName: 'baslangic', mim: 'ActionTask.plannedStartDatetime', displayName: 'Başlangıç', type: 'timestamp' },
        { apiName: 'sure_saat', mim: 'ActionTask.durationHoursQuantity', displayName: 'Süre (saat)', type: 'integer' },
        { apiName: 'birlik_no', mim: 'ActionResource.organisation', displayName: 'İcra Eden Birlik', type: 'string' },
        { apiName: 'domain', mim: 'ActionResource.organisation.domainCode', displayName: 'Domain', type: 'string' },
        { apiName: 'basari_puani', mim: 'ActionTaskStatus.successRateQuantity', displayName: 'Başarı Puanı', type: 'integer' },
        { apiName: 'hedef_bolge', mim: 'ActionObjective.targetRegionText', displayName: 'Hedef Bölge', type: 'string' },
        { apiName: 'komutan_no', mim: 'ActionResource.commanderPerson', displayName: 'Görev Komutanı', type: 'string' },
      ],
    },
    {
      apiName: 'sensor',
      mim: 'Materiel[categoryCode=SENSOR]',
      displayName: 'Sensör',
      pluralName: 'Sensörler',
      icon: '📡',
      primaryKey: 'sensor_no',
      datasetId: 'sensorler',
      properties: [
        { apiName: 'sensor_no', mim: 'ObjectItem.alternateIdentificationText', displayName: 'Sensör No', type: 'string' },
        { apiName: 'tip', mim: 'Materiel.typeText', displayName: 'Tip', type: 'string' },
        { apiName: 'platform_no', mim: 'ObjectItemAssociation[INSTALLED_ON].object', displayName: 'Takılı Platform', type: 'string' },
        { apiName: 'menzil_km', mim: 'Materiel.rangeQuantityKm', displayName: 'Menzil (km)', type: 'integer' },
        { apiName: 'durum', mim: 'MaterielStatus.operationalStatusCode', displayName: 'Durum', type: 'string' },
        { apiName: 'uretici', mim: 'Materiel.manufacturerText', displayName: 'Üretici', type: 'string' },
        { apiName: 'frekans_bandi', mim: 'Sensor.frequencyBandCode', displayName: 'Frekans Bandı', type: 'string' },
      ],
    },
    {
      apiName: 'iz',
      mim: 'ObjectItem[categoryCode=TRACK]',
      displayName: 'İz',
      pluralName: 'İzler',
      icon: '🛰️',
      primaryKey: 'iz_no',
      datasetId: 'izler',
      properties: [
        { apiName: 'iz_no', mim: 'ObjectItem.alternateIdentificationText', displayName: 'İz No', type: 'string' },
        { apiName: 'siniflandirma', mim: 'ObjectItemHostilityStatus.hostilityStatusCode', displayName: 'Sınıflandırma', type: 'string' },
        { apiName: 'domain', mim: 'ReportingData.dimensionCode', displayName: 'Domain', type: 'string' },
        { apiName: 'tespit_zamani', mim: 'ReportingData.reportingDatetime', displayName: 'Tespit Zamanı', type: 'timestamp' },
        { apiName: 'sensor_no', mim: 'ReportingData.sourceMateriel', displayName: 'Tespit Eden Sensör', type: 'string' },
        { apiName: 'surat_knot', mim: 'ObjectItemLocation.speedQuantityKnots', displayName: 'Sürat (knot)', type: 'integer' },
        { apiName: 'irtifa_ft', mim: 'ObjectItemLocation.altitudeFeetQuantity', displayName: 'İrtifa (ft)', type: 'integer' },
        { apiName: 'rota_derece', mim: 'ObjectItemLocation.bearingAngleDegrees', displayName: 'Rota (°)', type: 'integer' },
        { apiName: 'enlem', mim: 'ObjectItemLocation.latitudeCoordinate', displayName: 'Enlem', type: 'double' },
        { apiName: 'boylam', mim: 'ObjectItemLocation.longitudeCoordinate', displayName: 'Boylam', type: 'double' },
        { apiName: 'tehdit_seviyesi', mim: 'ReportingData.threatLevelCode', displayName: 'Tehdit Seviyesi', type: 'integer' },
        // Akıl yürütme motoru WRITEBACK'i (hesaplanan, açıklanabilir) — dinamik ontoloji
        { apiName: 'tehdit_skoru', mim: 'ObjectItemThreat.threatScoreQuantity (hesaplanan)', displayName: 'Tehdit Skoru', type: 'integer' },
        { apiName: 'tehdit_onceligi', mim: 'ObjectItemThreat.priorityCode (hesaplanan)', displayName: 'Tehdit Önceliği', type: 'string' },
        { apiName: 'yaklasiyor', mim: 'ObjectItemThreat.approachingIndicator (hesaplanan)', displayName: 'Yaklaşıyor', type: 'boolean' },
      ],
    },
    {
      apiName: 'iz_gozlem',
      mim: 'ReportingData',
      displayName: 'İz Gözlemi',
      pluralName: 'İz Gözlemleri',
      icon: '🔭',
      primaryKey: 'gozlem_no',
      datasetId: 'iz_gecmisi',
      properties: [
        { apiName: 'gozlem_no', mim: 'ReportingData.reportingDataId', displayName: 'Gözlem No', type: 'string' },
        { apiName: 'iz_no', mim: 'ReportingData.subjectObjectItem', displayName: 'İz No', type: 'string' },
        { apiName: 'tespit_zamani', mim: 'ReportingData.reportingDatetime', displayName: 'Tespit Zamanı', type: 'timestamp' },
        { apiName: 'sensor_no', mim: 'ReportingData.sourceMateriel', displayName: 'Tespit Eden Sensör', type: 'string' },
        { apiName: 'domain', mim: 'ReportingData.dimensionCode', displayName: 'Domain', type: 'string' },
        { apiName: 'tehdit_seviyesi', mim: 'ReportingData.threatLevelCode', displayName: 'Tehdit Seviyesi', type: 'integer' },
        { apiName: 'enlem', mim: 'ReportingData.latitudeCoordinate', displayName: 'Enlem', type: 'double' },
        { apiName: 'boylam', mim: 'ReportingData.longitudeCoordinate', displayName: 'Boylam', type: 'double' },
        { apiName: 'surat_knot', mim: 'ReportingData.speedQuantityKnots', displayName: 'Sürat (knot)', type: 'integer' },
        { apiName: 'irtifa_ft', mim: 'ReportingData.altitudeFeetQuantity', displayName: 'İrtifa (ft)', type: 'integer' },
        { apiName: 'rota_derece', mim: 'ReportingData.bearingAngleDegrees', displayName: 'Rota (°)', type: 'integer' },
      ],
    },
    {
      apiName: 'istihbarat_raporu',
      mim: 'ReportingData[categoryCode=INTREP]',
      displayName: 'İstihbarat Raporu',
      pluralName: 'İstihbarat Raporları',
      icon: '🕵️',
      primaryKey: 'rapor_no',
      datasetId: 'istihbarat',
      properties: [
        { apiName: 'rapor_no', mim: 'ReportingData.alternateIdentificationText', displayName: 'Rapor No', type: 'string' },
        { apiName: 'tur', mim: 'ReportingData.categoryCode (INT disiplini)', displayName: 'Tür (INT disiplini)', type: 'string' },
        { apiName: 'baslik', mim: 'ReportingData.titleText', displayName: 'Başlık', type: 'string' },
        { apiName: 'ozet', mim: 'ReportingData.reportText', displayName: 'Özet', type: 'string' },
        { apiName: 'kaynak', mim: 'ReportingData.sourceText', displayName: 'Kaynak', type: 'string' },
        { apiName: 'kaynak_guvenilirligi', mim: 'ReportingData.reliabilityCode (STANAG 2511)', displayName: 'Kaynak Güvenilirliği (A–F)', type: 'string' },
        { apiName: 'bilgi_dogrulugu', mim: 'ReportingData.credibilityCode (STANAG 2511)', displayName: 'Bilgi Doğruluğu (1–6)', type: 'integer' },
        { apiName: 'oncelik', mim: 'ReportingData.priorityCode', displayName: 'Öncelik', type: 'string' },
        { apiName: 'tehdit_tipi', mim: 'ReportingData.threatTypeText', displayName: 'Tehdit / Konu', type: 'string' },
        { apiName: 'guven_yuzde', mim: 'ReportingData.confidenceRateQuantity', displayName: 'Güven (%)', type: 'integer' },
        { apiName: 'ilgili_iz_no', mim: 'ReportingData.subjectObjectItem (değer bazlı)', displayName: 'İlgili İz', type: 'string' },
        { apiName: 'enlem', mim: 'ReportingData.latitudeCoordinate', displayName: 'Enlem', type: 'double' },
        { apiName: 'boylam', mim: 'ReportingData.longitudeCoordinate', displayName: 'Boylam', type: 'double' },
        { apiName: 'rapor_zamani', mim: 'ReportingData.reportingDatetime', displayName: 'Rapor Zamanı', type: 'timestamp' },
      ],
    },
    {
      apiName: 'personel',
      mim: 'Person',
      displayName: 'Personel',
      pluralName: 'Personel',
      icon: '🪖',
      primaryKey: 'personel_no',
      datasetId: 'personel',
      properties: [
        { apiName: 'personel_no', mim: 'ObjectItem.alternateIdentificationText', displayName: 'Personel No', type: 'string' },
        { apiName: 'ad_soyad', mim: 'Person.nameText', displayName: 'Ad Soyad', type: 'string' },
        { apiName: 'rutbe', mim: 'Person.rankCode', displayName: 'Rütbe', type: 'string' },
        { apiName: 'rutbe_seviye', mim: 'Person.rankLevelCode', displayName: 'Rütbe Seviyesi', type: 'integer' },
        { apiName: 'rol', mim: 'Person.functionalRoleCode', displayName: 'Görev / Rol', type: 'string' },
        { apiName: 'uzmanlik', mim: 'Person.specialtyText', displayName: 'Uzmanlık', type: 'string' },
        { apiName: 'birlik_no', mim: 'PersonAssignment.organisation', displayName: 'Mensup Birlik', type: 'string' },
        { apiName: 'platform_no', mim: 'PersonAssignment.materiel', displayName: 'Görevli Platform', type: 'string' },
        { apiName: 'durum', mim: 'PersonStatus.operationalStatusCode', displayName: 'Durum', type: 'string' },
        { apiName: 'guvenlik_belgesi', mim: 'Person.securityClearanceCode', displayName: 'Güvenlik Belgesi', type: 'string' },
        { apiName: 'tecrube_yili', mim: 'Person.experienceYearsQuantity', displayName: 'Tecrübe (yıl)', type: 'integer' },
        { apiName: 'ucus_saati', mim: 'Person.flightHoursQuantity', displayName: 'Uçuş Saati', type: 'integer' },
      ],
    },
  ],
  linkTypes: [
    { apiName: 'platform-birlik', mim: 'Holding', displayName: 'Bağlı olduğu birlik', fromObjectType: 'platform', toObjectType: 'birlik', cardinality: 'one', fromKey: 'birlik_no', toKey: 'birlik_no' },
    { apiName: 'birlik-platformlar', mim: 'Holding (ters yön)', displayName: 'Birliğin platformları', fromObjectType: 'birlik', toObjectType: 'platform', cardinality: 'many', fromKey: 'birlik_no', toKey: 'birlik_no' },
    { apiName: 'gorev-birlik', mim: 'ActionResource', displayName: 'Görevi icra eden birlik', fromObjectType: 'gorev', toObjectType: 'birlik', cardinality: 'one', fromKey: 'birlik_no', toKey: 'birlik_no' },
    { apiName: 'birlik-gorevler', mim: 'ActionResource (ters yön)', displayName: 'Birliğin görevleri', fromObjectType: 'birlik', toObjectType: 'gorev', cardinality: 'many', fromKey: 'birlik_no', toKey: 'birlik_no' },
    { apiName: 'sensor-platform', mim: 'ObjectItemAssociation[INSTALLED_ON]', displayName: 'Takılı olduğu platform', fromObjectType: 'sensor', toObjectType: 'platform', cardinality: 'one', fromKey: 'platform_no', toKey: 'platform_no' },
    { apiName: 'platform-sensorler', mim: 'ObjectItemAssociation[INSTALLED_ON] (ters yön)', displayName: 'Platformun sensörleri', fromObjectType: 'platform', toObjectType: 'sensor', cardinality: 'many', fromKey: 'platform_no', toKey: 'platform_no' },
    { apiName: 'iz-sensor', mim: 'ReportingData', displayName: 'Tespit eden sensör', fromObjectType: 'iz', toObjectType: 'sensor', cardinality: 'one', fromKey: 'sensor_no', toKey: 'sensor_no' },
    { apiName: 'iz-gozlemler', mim: 'ReportingData (subject yönü)', displayName: 'İzin gözlem geçmişi', fromObjectType: 'iz', toObjectType: 'iz_gozlem', cardinality: 'many', fromKey: 'iz_no', toKey: 'iz_no' },
    { apiName: 'gozlem-iz', mim: 'ReportingData.subjectObjectItem', displayName: 'Gözlemin izi', fromObjectType: 'iz_gozlem', toObjectType: 'iz', cardinality: 'one', fromKey: 'iz_no', toKey: 'iz_no' },
    { apiName: 'gozlem-sensor', mim: 'ReportingData.sourceMateriel', displayName: 'Gözlemi yapan sensör', fromObjectType: 'iz_gozlem', toObjectType: 'sensor', cardinality: 'one', fromKey: 'sensor_no', toKey: 'sensor_no' },
    { apiName: 'sensor-gozlemler', mim: 'ReportingData (source yönü)', displayName: 'Sensörün gözlemleri', fromObjectType: 'sensor', toObjectType: 'iz_gozlem', cardinality: 'many', fromKey: 'sensor_no', toKey: 'sensor_no' },
    { apiName: 'sensor-izler', mim: 'ReportingData (ters yön)', displayName: 'Sensörün tespit ettiği izler', fromObjectType: 'sensor', toObjectType: 'iz', cardinality: 'many', fromKey: 'sensor_no', toKey: 'sensor_no' },
    { apiName: 'personel-birlik', mim: 'PersonAssignment', displayName: 'Mensup olduğu birlik', fromObjectType: 'personel', toObjectType: 'birlik', cardinality: 'one', fromKey: 'birlik_no', toKey: 'birlik_no' },
    { apiName: 'birlik-personeller', mim: 'PersonAssignment (ters yön)', displayName: 'Birliğin personeli', fromObjectType: 'birlik', toObjectType: 'personel', cardinality: 'many', fromKey: 'birlik_no', toKey: 'birlik_no' },
    { apiName: 'personel-platform', mim: 'PersonAssignment.materiel', displayName: 'Görevli olduğu platform', fromObjectType: 'personel', toObjectType: 'platform', cardinality: 'one', fromKey: 'platform_no', toKey: 'platform_no' },
    { apiName: 'platform-personeller', mim: 'PersonAssignment.materiel (ters yön)', displayName: 'Platform mürettebatı', fromObjectType: 'platform', toObjectType: 'personel', cardinality: 'many', fromKey: 'platform_no', toKey: 'platform_no' },
    { apiName: 'rapor-iz', mim: 'ReportingData.subjectObjectItem', displayName: 'İlgili iz', fromObjectType: 'istihbarat_raporu', toObjectType: 'iz', cardinality: 'one', fromKey: 'ilgili_iz_no', toKey: 'iz_no' },
    { apiName: 'iz-raporlar', mim: 'ReportingData.subjectObjectItem (ters yön)', displayName: 'İze bağlı istihbarat', fromObjectType: 'iz', toObjectType: 'istihbarat_raporu', cardinality: 'many', fromKey: 'iz_no', toKey: 'ilgili_iz_no' },
    { apiName: 'birlik-komutan', mim: 'CommandAndControl.commanderPerson', displayName: 'Birliğin komutanı', fromObjectType: 'birlik', toObjectType: 'personel', cardinality: 'one', fromKey: 'komutan_no', toKey: 'personel_no' },
    { apiName: 'gorev-komutan', mim: 'ActionResource.commanderPerson', displayName: 'Görev komutanı', fromObjectType: 'gorev', toObjectType: 'personel', cardinality: 'one', fromKey: 'komutan_no', toKey: 'personel_no' },
  ],
};

/**
 * apiName → MIM kaynak etiketi haritası (OWL export'ta `verim:mimKaynak`
 * izlenebilirlik annotation'ı için). Tip ve link apiName'lerini kapsar;
 * ontoloji dummy≡mim olduğundan backend'den bağımsız geçerlidir.
 */
export function mimKaynakMap(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const t of MIM_MODEL.objectTypes) m[t.apiName] = t.mim;
  for (const l of MIM_MODEL.linkTypes) m[l.apiName] = l.mim;
  return m;
}

/**
 * ONTOLOGY_PROVIDER'ın MIM adapter'ı — Verim ontolojisini MIM_MODEL
 * eşlemesinden türetir. Contract'a `mim` alanları sızmaz.
 */
@Injectable()
export class MimOntologyProvider implements OntologyProvider {
  getOntology(): Promise<OntologyResponse> {
    return Promise.resolve({
      objectTypes: MIM_MODEL.objectTypes.map(({ mim: _mim, properties, ...t }) => ({
        ...t,
        properties: properties.map(({ mim: _pmim, ...p }) => p),
      })),
      linkTypes: MIM_MODEL.linkTypes.map(({ mim: _lmim, ...l }) => l),
    });
  }
}
