# Query Service — API Contract

Frontend'in **Harman board zincirini** çalıştırmak için beklediği REST
sözleşmesi. TypeScript karşılıkları: `src/types/api.ts` ve `src/types/boards.ts`.

> Bu doküman yalnız `/query` (board zinciri) sözleşmesini kapsar. `/query`
> ailesine `POST/GET/DELETE /query/live` (canlı dataset — satır değil TARİF
> saklanır, her okunuşta güncel veriden çözülür; tipler `src/types/api.ts`
> içinde `LiveDataset*`) dahildir. Diğer uçlar
> (`/ontology`, `/objectsets/*`, `/graph/*`, `/search`, `/assistant/*`,
> `/alerts/*`) için canlı Swagger (`http://localhost:8080/docs`) ve
> [SISTEM_REHBERI.md](SISTEM_REHBERI.md) §"Sınıf sözlüğü"ne bakın.

Temel ilke: **frontend query derlemez.** Kullanıcının kurduğu board zinciri
(`BoardConfig[]`) olduğu gibi serialize edilip gönderilir; servis bunu kendi
query engine'inde (SQL/Spark/DuckDB — implementasyon serbest) çalıştırır ve
sonucu **şemasıyla birlikte** döner. Dönen şema otoritedir; client'taki şema
çıkarımı yalnızca form UX'i için optimistik bir aynadır.

---

## 1. `GET /datasets`

Kullanıcının path başlatabileceği dataset listesi.

```json
{
  "datasets": [
    {
      "id": "orders_v2",
      "label": "Siparişler",
      "rowCount": 4820391,
      "lastUpdated": "2026-07-02T06:00:00Z",
      "version": "v2026-07-02T06:00:00Z"
    }
  ]
}
```

`version` opak bir token'dır; veri her değiştiğinde değişmelidir. Frontend
bunu sorgu cache anahtarında kullanır — yanlış/statik verilirse kullanıcı
bayat sonuç görür.

## 2. `GET /datasets/:id/schema`

```json
{
  "datasetId": "orders_v2",
  "version": "v2026-07-02T06:00:00Z",
  "schema": {
    "columns": [
      { "name": "created_at", "type": "timestamp", "nullable": false },
      { "name": "category",   "type": "string",    "nullable": true },
      { "name": "revenue",    "type": "double",    "nullable": false }
    ]
  },
  "rowCount": 4820391
}
```

Kolon tipleri: `string | integer | double | boolean | date | timestamp`.

## 3. `POST /query`

### İstek

```json
{
  "datasetId": "orders_v2",
  "boards": [
    {
      "type": "filter",
      "id": "b1",
      "action": "keep",
      "combinator": "and",
      "conditions": [
        {
          "id": "c1",
          "column": "created_at",
          "operator": "between",
          "values": [
            { "kind": "literal", "value": "2026-01-01T00:00:00Z" },
            { "kind": "literal", "value": "2026-03-31T23:59:59Z" }
          ]
        },
        {
          "id": "c2",
          "column": "status",
          "operator": "eq",
          "values": [{ "kind": "parameter", "name": "status" }]
        }
      ]
    },
    {
      "type": "histogram",
      "id": "b2",
      "groupColumn": "category",
      "aggregate": { "alias": "total_revenue", "fn": "sum", "column": "revenue" },
      "sort": { "by": "value", "direction": "desc" },
      "pivoted": true
    }
  ],
  "targetBoardIndex": 1,
  "parameters": { "status": "completed" },
  "limit": 1000
}
```

### Yürütme kuralları

1. Board'lar sırayla uygulanır; `targetBoardIndex`'e kadar (dahil) çalıştırılır
   ve o board'un çıktısı döner. Verilmezse son board hedeftir.
2. `chart` ve `table` board'ları **display-only**: satırları değiştirmezler,
   executor bunları hedef değillerse atlar. Hedeflerse girdilerini döner
   (chart board'un görselleştireceği aggregate'i frontend ayrı bir histogram/
   aggregate hedefiyle ister — detay §5).
3. `histogram.pivoted=false` ve `pivot.pivoted=false` da display-only sayılır:
   sonraki board'lar ham satırlarla devam eder. `pivoted=true` ise sonraki
   board'lar aggregate edilmiş tabloyu görür.
4. `histogram.selection` doluysa, downstream board'lar için
   `groupColumn IN (selection)` filtresi uygulanır (bar seçimiyle filtreleme).
5. `{ "kind": "parameter", "name": "x" }` değerleri `parameters.x` ile
   çözülür; eksikse `PARAMETER_MISSING` hatası.
6. `filter` operatörlerinin SQL karşılıkları: `eq/neq/lt/lte/gt/gte` doğrudan;
   `between` kapsayıcı; `in`; `contains/startsWith/endsWith` LIKE;
   `matchesRegex`; `isNull/isNotNull`.
7. `expression` board'ları servis tarafında tanımlı ifade diliyle çalışır
   (ilk sürüm için SQL ifadeleri kabul edilebilir); `mode` başına davranış:
   `addColumn` kolon ekler, `replaceColumn` yerinde değiştirir, `filter`
   boolean süzer, `aggregate` şemayı tamamen değiştirir (group-by kolonları +
   aggregate başına bir kolon).

### Yanıt

```json
{
  "schema": {
    "columns": [
      { "name": "category",      "type": "string", "nullable": true },
      { "name": "total_revenue", "type": "double", "nullable": false }
    ]
  },
  "rows": [
    { "category": "Elektronik", "total_revenue": 18420350.75 },
    { "category": "Ev & Yaşam", "total_revenue": 9102840.20 }
  ],
  "totalRows": 7,
  "truncated": false,
  "executionTimeMs": 1240,
  "datasetVersion": "v2026-07-02T06:00:00Z"
}
```

- `totalRows`: `limit` olmasaydı sonucun toplam satır sayısı — UI'daki
  "1.203.847 kayıt eşleşiyor" geri bildirimi buradan gelir.
- `truncated`: limit veya servis üst sınırı devreye girdiyse `true`.
- Servis kendi üst sınırlarını da uygular (öneri: preview 1.000 satır,
  pivot 100 kolon / 10.000 hücre) ve `truncated` ile işaretler.

### Hata (non-2xx)

```json
{ "code": "EXPRESSION_ERROR", "message": "Unknown column 'revenu'", "boardIndex": 2 }
```

Kodlar: `DATASET_NOT_FOUND | INVALID_BOARD_CONFIG | EXPRESSION_ERROR |
PARAMETER_MISSING | RESULT_TOO_LARGE | INTERNAL`. `boardIndex` verilirse UI
hatayı ilgili board kartının üzerinde gösterir.

## 4. Cache semantiği

Frontend sorguları `(datasetVersion, boards[0..target] serialize edilmiş
hali, çözülmüş parametreler)` anahtarıyla cache'ler. Servis de aynı anahtarla
sunucu tarafı cache uygulayabilir; deterministik JSON serileştirme yeterli.

## 5. Chart board'ların veri ihtiyacı

Chart board display-only olduğundan, frontend chart verisini şu şekilde alır:
chart config'indeki x-axis + series tanımı geçici bir `expression/aggregate`
(veya histogram) hedefine çevrilir ve `targetBoardIndex` o sanal hedefi
gösterecek şekilde ayrı bir `/query` atılır. Yani servis chart'a özel bir şey
bilmek zorunda değildir — sadece aggregate'i doğru çalıştırması yeterlidir.
