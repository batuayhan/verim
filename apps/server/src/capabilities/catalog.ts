import type {
  AggregationFn,
  BoardConfig,
  FilterOperator,
} from '../contract/boards';
import type {
  ObjectSetDef,
  OntologyResponse,
  MercekCard,
  MercekMetric,
} from '../contract/mercek';
import type { DatasetSummary } from '../contract/api';
import type { GadgetTip } from '../dashboards/dashboard-schema';

/**
 * YETENEK SÖZLEŞMESİ — asistan ile sistemin geri kalanı arasındaki
 * zorunlu köprü.
 *
 * Buradaki her katalog, contract'taki bir union tipine
 * `Record<Union, string>` ile DERLEYİCİ SEVİYESİNDE bağlıdır:
 * Harman'a yeni bir board, Mercek'e yeni bir kart, sözleşmeye yeni bir
 * operatör eklendiğinde bu dosyaya LLM-yüzlü Türkçe açıklaması
 * yazılmadıkça PROJE DERLENMEZ. "Asistana aktarmayı unutmak" böylece
 * imkânsızdır — asistanın sistem promptu bu kataloglardan ÜRETİLİR,
 * elle yazılmış kopya bilgi yoktur.
 *
 * Değişken yetenekler (ontoloji tipleri/linkleri, dataset listesi) zaten
 * çalışma zamanında ilgili provider'lardan okunur.
 */

// --- Mercek / ObjectSet sorgu dili -------------------------------------------

export const OBJECT_SET_NODES: Record<ObjectSetDef['type'], string> = {
  base: 'Temel küme: { "type":"base", "objectType":"<tip>" }',
  filter:
    'Filtre: { "type":"filter", "base":<def>, "combinator":"and"|"or", "conditions":[<koşul>] } — koşul: { "id","column","operator","values":[{"kind":"literal","value":..}] }',
  searchAround:
    'İlişkiye geç (kümenin TİPİ değişir): { "type":"searchAround", "base":<def>, "linkType":"<link>" }',
  joinLinked:
    'İlişkiden kolon ekle (tip aynı kalır, satır-bazlı join): { "type":"joinLinked", "base":<def>, "linkType":"<link>", "columns":["<apiName>"] } — kolonlar sonuçta hedefTip__kolon adıyla görünür',
  fromPrimaryKeys:
    'Anahtarla seç (drill-down): { "type":"fromPrimaryKeys", "objectType":"<tip>", "keys":[..] }',
};

export const FILTER_OPERATORS: Record<FilterOperator, string> = {
  eq: 'eşittir',
  neq: 'eşit değildir (null da geçer)',
  lt: 'küçüktür',
  lte: 'küçük eşittir',
  gt: 'büyüktür',
  gte: 'büyük eşittir (zaman pencereleri için ISO datetime ile)',
  between: 'arasında — values: [alt, üst]',
  in: 'şunlardan biri — values: n adet',
  contains: 'içerir (büyük/küçük harf duyarsız)',
  startsWith: 'ile başlar',
  endsWith: 'ile biter',
  matchesRegex: 'düzenli ifadeyle eşleşir',
  isNull: 'boştur — values: []',
  isNotNull: 'boş değildir — values: []',
};

export const MERCEK_METRIC_FNS: Record<MercekMetric['fn'], string> = {
  count: 'satır sayısı (property gerekmez)',
  countDistinct: 'benzersiz değer sayısı',
  sum: 'toplam (sayısal kolon)',
  avg: 'ortalama (sayısal kolon)',
  min: 'en küçük',
  max: 'en büyük',
};

// --- Mercek kartları (asistanın analiz kurarken bildiği yüzeyler) --------------

export const MERCEK_CARDS: Record<MercekCard['kind'], string> = {
  objectSet: 'Nesne kümesi kartı — bir tipin tüm nesneleri (tablo)',
  drilldown: 'Seçilmiş anahtarlar kartı — grafikten inilen alt küme',
  filter: 'Filtre kartı — cümle stili koşullarla küme daraltma; $parametre destekler',
  searchAround: 'İlişkiye geçiş kartı — ilişkili nesnelerin kümesine atlar',
  joinLinked: 'İlişkiden kolon kartı — hedef tipin kolonlarını tabloya ekler (harmanlama)',
  chart: 'Grafik kartı — bar/pie, groupBy + metrik, segment ve tıkla-drill-down',
  metric: 'Metrik kartı — tek büyük sayı',
  timeseries: 'Zaman serisi kartı — tarih kolonu + gün/hafta/ay granülaritesi',
};

// --- Harman board'ları (pipeline analizi) --------------------------------------

export const HARMAN_BOARDS: Record<BoardConfig['type'], string> = {
  filter:
    'FILTER — satırları koşulla tut/at: { type:"filter", id, action:"keep"|"remove", combinator:"and"|"or", conditions:[<koşul>], removeDuplicateRows? }',
  table: 'TABLE — görüntü amaçlı tablo: { type:"table", id, visibleColumns? } (şemayı değiştirmez)',
  chart:
    'CHART — görselleştirme: { type:"chart", id, chartType:"bar"|"horizontalBar"|"line"|"area"|"pie"|"scatter", xColumn, series:[{alias,fn,column?}], segmentColumn?, stacked?, bucketing? }',
  histogram:
    'HISTOGRAM — grupla+say, bar seçimi alt board\'ları filtreler: { type:"histogram", id, groupColumn, aggregate:{alias,fn,column?}, sort:{by:"value"|"label",direction}, selection?, pivoted }',
  expression:
    'EXPRESSION — hesaplanmış kolon/aggregate: { type:"expression", id, mode:"addColumn"|"replaceColumn"|"filterExpr"|"aggregate", ... } mini ifade diliyle',
  pivot:
    'PIVOT — satır×sütun özet tablo: { type:"pivot", id, rowDimensions:[..], columnDimension?, aggregate:{alias,fn,column?} } (şemayı tamamen değiştirir)',
  enrich:
    'ENRICH — başka dataset\'le join: { type:"enrich", id, rightDatasetId, joinType:"left"|"inner", leftColumn, rightColumn, selectedColumns? }',
  setMath:
    'SET MATH — kolon kümesi işlemleri: { type:"setMath", id, operation:"keepOnly"|"add"|"remove", columns:[..] }',
  editColumns:
    'EDIT COLUMNS — kolon düzenleme: { type:"editColumns", id, operations:[{op:"drop"|"rename"|"cast"|"reorder", ...}] }',
};

export const HARMAN_AGGREGATION_FNS: Record<AggregationFn, string> = {
  count: 'satır sayısı',
  countDistinct: 'benzersiz sayısı',
  sum: 'toplam',
  avg: 'ortalama',
  min: 'en küçük',
  max: 'en büyük',
  median: 'ortanca',
  stddev: 'standart sapma',
  variance: 'varyans',
};

// --- Birleşik dashboard gadget'ları ---------------------------------------------

export const GADGETS: Record<GadgetTip, string> = {
  stat: 'Tek büyük sayı kartı: { tip:"stat", def:<ObjectSetDef>, metric, baslik?, renk?("primary"|"error"|"warning"|"success"|"secondary"), link?, pencereDk?+pencereKolon? (son N dk canlı penceresi) }',
  grafik:
    'Bar/pie grafik: { tip:"grafik", def, groupBy, segmentBy?, metric, grafikTuru?:"bar"|"pie", baslik?, pencereDk?+pencereKolon? }',
  zaman:
    'Zaman serisi: { tip:"zaman", def, dateProperty, granularity:"hour"|"day"|"week"|"month", metric, baslik?, pencereDk?+pencereKolon? }',
  tablo: 'Nesne tablosu: { tip:"tablo", def, limit?, baslik?, pencereDk?+pencereKolon? }',
  liste:
    'Sıralı liste (leaderboard, "en çok"): { tip:"liste", def, groupBy, metric, limit?, baslik?, pencereDk?+pencereKolon? }',
  pivot:
    'Özet tablo (satır×sütun matris): { tip:"pivot", def, groupBy, segmentBy, metric, baslik?, pencereDk?+pencereKolon? }',
  dagilim:
    'Dağılım grafiği (scatter, iki sayısal kolon): { tip:"dagilim", def, xColumn, yColumn, limit?, baslik?, pencereDk?+pencereKolon? }',
  harita:
    'Mini canlı harita (COP): { tip:"harita", siniflandirmalar?:["Dost"|"Düşman"|"Şüpheli"|"Bilinmeyen"], pencereDk?, baslik? }',
  alarmlar: 'Son alarm olayları listesi: { tip:"alarmlar", limit?, baslik? }',
  analizler: 'Son Harman+Mercek analizleri listesi: { tip:"analizler", limit?, baslik? }',
  senkronizasyon:
    'Angajman senkronizasyon matrisi (dost varlık × zaman penceresi; en yüksek tehditlerin önerilen COA\'sını planlar): { tip:"senkronizasyon", limit?, baslik? }',
  asistan: 'Asistan komut kutusu: { tip:"asistan" }',
  harman_board:
    'Mevcut Harman analizinden canlı board: { tip:"harman_board", analysisId, pathId, boardId, baslik? }',
  mercek_kart:
    'Mevcut Mercek analizinden canlı kart: { tip:"mercek_kart", analysisId, cardId, baslik? }',
};

/** Expression dili özeti (evaluator ile senkron tutulur; drift testi korur) */
export const EXPRESSION_LANGUAGE = `Harman expression dili: kolon adları çıplak yazılır (revenue * 0.2),
$parametre desteklenir; fonksiyonlar: upper lower length concat abs round
floor ceil coalesce if year month day hour; aggregate modunda ayrıca:
sum avg min max count count_distinct median stddev variance
(iç içe aritmetik olabilir: sum(x)/count()).`;

// --- Prompt üretici -------------------------------------------------------------

const list = (r: Record<string, string>) =>
  Object.entries(r)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n');

export function buildCapabilityPrompt(
  ontology: OntologyResponse,
  datasets: DatasetSummary[],
): string {
  const tipler = ontology.objectTypes
    .map(
      (t) =>
        `- ${t.apiName} ("${t.displayName}", pk=${t.primaryKey}, dataset=${t.datasetId}): ` +
        t.properties.map((p) => `${p.apiName}:${p.type}`).join(', '),
    )
    .join('\n');
  const linkler = ontology.linkTypes
    .map((l) => `- ${l.apiName}: ${l.fromObjectType} → ${l.toObjectType} ("${l.displayName}")`)
    .join('\n');
  const datasetler = datasets
    .map((d) => `- ${d.id} ("${d.label}", ${d.rowCount} satır)`)
    .join('\n');

  return `ONTOLOJİ — NESNE TİPLERİ:
${tipler}

İLİŞKİLER (searchAround/joinLinked linkType değerleri):
${linkler}

DATASETLER (Harman analizleri bunlardan başlar):
${datasetler}

MERCEK SORGU DİLİ (ObjectSetDef düğümleri):
${list(OBJECT_SET_NODES)}

FİLTRE OPERATÖRLERİ:
${list(FILTER_OPERATORS)}

MERCEK METRİK FONKSİYONLARI:
${list(MERCEK_METRIC_FNS)}

MERCEK KART TÜRLERİ (mercek_analiz_olustur bunları üretir):
${list(MERCEK_CARDS)}

HARMAN BOARD TÜRLERİ (harman_analiz_olustur board zinciri kurar; veri
yukarıdan aşağı akar, her board öncekinin çıktısını işler):
${list(HARMAN_BOARDS)}

HARMAN AGGREGATE FONKSİYONLARI:
${list(HARMAN_AGGREGATION_FNS)}

DASHBOARD GADGET TÜRLERİ (dashboard_olustur bunlarla birleşik dashboard
kurar; yerleşimi sunucu otomatik yapar):
${list(GADGETS)}

${EXPRESSION_LANGUAGE}`;
}
