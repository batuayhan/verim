# Verim — Tüm Alan Müşterek C2 Veri Platformu

Marka eşlemesi: platform **Verim**; pipeline analizi **Harman** (Harman),
nesne keşfi **Mercek** (Mercek), Ortak Harekât Resmi **Harita** (COP),
bağlantı analizi **Bağlantı** (Gotham/link-analysis), doğal-dil AI **Asistan**
(AIP), birleşik dashboard **Pano**. Kod içi adlar İngilizce orijinallerdir.

> **Sistemi ilk kez inceleyecekler için:** mimari + diyagramlar →
> [docs/MIMARI.md](docs/MIMARI.md); sunum, sınıf sözlüğü ve çok-kitleli SSS
> (mühendis / meraklı / asker / komutan) → [docs/SISTEM_REHBERI.md](docs/SISTEM_REHBERI.md).


Palantir Foundry Harman mantığında, data-first bir analiz ve görselleştirme
aracı. Kullanıcı bir dataset seçer, üzerine board'lar (filter, expression,
histogram, chart, pivot...) zincirler; veri yukarıdan aşağı akar, her board
bir öncekinin çıktısını işler. Görselleştirme pipeline'ın son ve değiştirilebilir
adımıdır.

## Model

```
Analysis
├── Parameters ($name — filtre ve expression'larda referans)
├── Paths[]                 ← her biri bir dataset'ten (veya başka path'in
│   └── Boards[]               sonucundan) başlar, sıralı board listesi
└── Dashboard               ← board'ların projeksiyonu ("Add to dashboard")
```

Temel davranışlar (Palantir dokümanlarıyla doğrulanmış Harman semantiği):

- **Cascade recomputation:** bir board değişince altındaki tüm board'lar invalidate olur.
- **Şema propagasyonu:** filter/chart passthrough; expression-aggregate,
  histogram (pivoted) ve pivot şemayı tamamen değiştirir. Bkz. `src/core/schemaPropagation.ts`.
- **Cache:** sorgular `(datasetVersion, etkili board zinciri, referans verilen parametreler)`
  ile anahtarlanır. Bkz. `src/core/queryKey.ts`.
- **Query derleme frontend'de yapılmaz:** board zinciri REST servisine serialize
  edilir, servis sonucu şemasıyla döner. Sözleşme: `docs/API_CONTRACT.md`.

## Teknoloji

| Katman | Seçim |
|---|---|
| UI | React 19 + MUI (varsayılan tema) |
| Chart | Recharts |
| Client state | Redux Toolkit + redux-undo (undo/redo) |
| Server state | TanStack Query |
| Table | MUI X DataGrid |
| Form | react-hook-form + zod |
| Build | Vite + TypeScript |

## Dizin Yapısı

```
src/
  types/        schema.ts, boards.ts (BoardConfig union), analysis.ts, api.ts
  core/         schemaPropagation.ts, queryKey.ts
  store/        analysisSlice.ts (undoable), store.ts, hooks.ts
docs/
  API_CONTRACT.md   backend ekibi için REST sözleşmesi
```

## Geliştirme

```bash
npm install
npm run dev
```

## Mercek (Mercek) — Nesne Analizi

`/mercek` altında Harman'ın yanına eklenen, Palantir Mercek benzeri
**ontoloji-nesne odaklı** keşif aracı: tipli kart DAG'ı + serbest canvas
(react-grid-layout), değişken çipleri ($A, $B...), "kartından devam et"
aksiyon barı (Filtrele / Görselleştir / Hesapla / Zaman serisi /
İlişkilere geç / İlişkiden kolon ekle), chart drill-down, search-around
ile ilişki gezinme, satır-bazlı join ("Join to linked objects" — hedef
tipin kolonları `Hedef → Kolon` başlığıyla tabloya eklenir).
Ek modlar: **Graf** (kart DAG'ının katmanlı görünümü), **Dashboard**
(`/mercek/:id/dashboard` — kartların salt-okunur, sürükle-boyutlandır
widget'ları) ve **Parametreler** (sol panelde $isim değişkenleri;
filtrelerde `$isim` seç, değeri tek yerden değiştir → tüm kartlar
yeniden hesaplanır).
Ontoloji (nesne tipleri + linkler) backend'deki ONTOLOGY_PROVIDER
portundan gelir. `DATA_BACKEND=mim` modunda ontoloji **MIM (MIP Information
Model) eşlemesinden türetilir** ve sorgular PostgreSQL'e itilir (SQL
pushdown, milyon satır ölçeği); ayrıntı için verim-server README'sindeki
"MIM staging" bölümüne bak.

## Harman Dashboard

Her analiz `/harman/:id/dashboard` ile sunum moduna sahiptir: widget'lar
react-grid-layout üzerinde sürüklenip boyutlanır (yerleşim analizle
kaydedilir), parametreler görünüm-lokal override edilebilir, her widget
altında upstream filtre özeti (provenance) bulunur. **Çapraz filtreleme:**
histogram widget'ında bir bara tıklayınca aynı path'in diğer widget'ları
geçici `kolon = değer` filtresiyle yeniden hesaplanır — analize yazılmaz,
× ile veya bara tekrar tıklayarak kaldırılır.

## Birleşik Dashboard, Asistan ve Tam Entegrasyon

`/` platformun **tek dashboard sistemidir** (Jira modeli; `src/pano/`):
her öğe bir **gadget**'tır — stat, grafik, zaman serisi, tablo, canlı mini
harita, alarmlar, analizler, asistan kutusu, mevcut bir **Harman board'u**
veya **Mercek kartı** (canlı projeksiyon). "Sistem" dashboard'u sanaldır
(koddan üretilir, bozulamaz); kullanıcı **Kopyala ve düzenle** ya da
**Yeni dashboard** ile kendininkini kurar: sürükle-bırak yerleşim,
select-tabanlı "Gadget ekle" kataloğu, yeniden adlandır/sil/kaydet.
Sayfa ForceLive'dır — omurgadan veri aktıkça sayılar oynar. Asistan da
`dashboard_olustur` aracıyla doğal dilden dashboard kurar.

**Ontolojik nesne detayı** (`src/nesne/NesneDetay.tsx`): haritada bir ize,
Mercek'te veya asistan panelinde bir tablo satırına tıklamak nesnenin
detay çekmecesini açar — tüm özellikler, ilişkili nesneler (ontoloji
linklerinden) ve başka tipin anahtarına denk gelen her değer tıklanabilir;
breadcrumb ile detayın detayının detayına inilir. Her seviyede
"Mercek'te aç" ve konumlu nesnede "Haritada göster" vardır.

**Verim Asistanı** her sayfadan erişilir (üst bar / ⌘K). Cevaplar tam
entegredir:

- Sorgu sonuçları sohbetin **içinde** canlı tablo/grafik/metrik/zaman
  paneli olarak çizilir (`src/asistan/PanelView.tsx`);
- her panel "**Mercek'te aç**" ile tek tıkta kalıcı, düzenlenebilir kart
  zincirine açılır (`POST /assistant/mercege-ac`) — kara kutu yok;
- konum içeren tablolarda satır başına harita pin'i; asistanın konum
  cevapları `Haritada aç` düğmesi üretir → Harita
  `?lat&lon&zoom&etiket` ile o noktaya uçar ve işaretler;
- "dashboard kur / alarm kur / haritada göster" aksiyonları tıklanabilir
  düğmedir.

## Harita, Bağlantı ve Global Arama

- **Harita** (`/harita`) — Canlı Ortak Harekât Resmi (MapLibre): son N dk
  penceresindeki izler, katmanlar (nokta / ısı / iz-izi geçmişi / **istihbarat
  raporları** multi-INT / **sensör menzil halkaları** / **AOI** ilgi-alanı
  kutusu), noktaya tıkla → ontolojik detay.
- **Bağlantı** (`/graf`) — force-directed link-analysis grafı; komşuları
  **gerçek graf DB'den** (Neo4j) açar, çok komşulu ilişki tek **balonda**
  toplanır (tıkla → üyeler açılır).
- **Global arama** (TopNav "Nesne ara") — OpenSearch üzerinden tam-metin/fuzzy;
  sonuç seçilince NesneDetay açılır.
- **Alarm kanalları** — kural tetiklenince zil + **webhook** (Slack/Teams) +
  **e-posta** (SMTP).

## Backend ve servis yığını

Sorgu servisi ayrı repoda: [`../verim-server`](../verim-server) — NestJS,
hexagonal port/adapter. **Docker Compose** gerçek servis yığınını ayağa
kaldırır: **TimescaleDB** (staging + gözlem hypertable), **Redpanda** (omurga),
**source-sensor/mip4ies/intel** (kaynaklar), **ingest**, **Neo4j** (graf),
**OpenSearch** (arama), **app** (:8080). `DATA_BACKEND=mim` modunda ontoloji
MIM eşlemesinden türer, sorgular SQL'e itilir (pushdown). Ayrıntı:
verim-server README + [docs/MIMARI.md](docs/MIMARI.md).

## Yol Haritası

Detaylı plan: [docs/ROADMAP.md](docs/ROADMAP.md). Faz 0–36 tamamlandı: temel →
board'lar → dashboard → MIM staging + SQL pushdown → gerçek zamanlı omurga →
Harita/COP → Asistan (AIP) → alarm motoru → birleşik pano → bağlantı analizi
(Neo4j) → multi-INT istihbarat akışı → TimescaleDB → OpenSearch arama.
