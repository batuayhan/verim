# Verim Server

[apps/client](../client) frontend'inin sorgu servisi. Board
zincirlerini (`BoardConfig[]`) alır, dummy veri üzerinde çalıştırır, sonucu
şemasıyla döner. Sözleşme: `apps/client/docs/API_CONTRACT.md`.

## Mimari — port & adapter (hexagonal)

Veri kaynağı `DATA_BACKEND` env ile seçilir; tüm portların iki adapter'ı var:

```
                         DATA_BACKEND=dummy (vars.)   DATA_BACKEND=mim
ONTOLOGY_PROVIDER  ────► DummyOntologyProvider        MimOntologyProvider (MIM eşlemesinden türetir)
DATASET_PROVIDER   ────► CompositeDatasetProvider (çekirdek ⊕ canlı dataset; çekirdek
                         KERNEL_DATASET_PROVIDER: Dummy | Mim — PostgreSQL v_* view'ları)
OBJECT_SET_ENGINE  ────► ObjectSetEngine (in-memory)  SqlObjectSetEngine (SQL pushdown)
QUERY_ENGINE       ────► InMemoryQueryEngine          InMemoryQueryEngine (MIP_SCAN_LIMIT tavanlı)
```

İki mod da `/ontology` ve tüm endpoint'lerde AYNI contract'ı sunar —
frontend farkı görmez. Bağlama noktaları: `datasets.module.ts` ve
`ontology.module.ts`.

## MIM staging (ontoloji tabanlı gerçek veri yolu)

Hedef veri kaynağı **MIM (MIP Information Model, MIP 4)** — ontoloji
tabanlı. Gerçek MIM erişimi gelene kadar `db/schema.sql` MIM çekirdek
entity'lerinin (ObjectItem, Organisation, Materiel, ActionTask,
ReportingData, ObjectItemLocation, HostilityStatus, Holding,
ObjectItemAssociation) ilişkisel izdüşümünü kurar; `db/views.sql` bunları
Verim apiName'lerine eşler. Verim ontolojisi `src/mim/mim-ontology.ts`teki
deklaratif **MIM eşlemesinden türetilir** (her tip/özellik/link hangi MIM
entity/attribute/association'dan geliyor, üzerinde yazar). Gerçek MIM
(MIP4-IES alışverişi) geldiğinde ingest bu tabloları besler; eşleme ve
views.sql gerçek modele göre uyarlanır, Verim contract'ı sabit kalır.

```bash
createdb verim_mip
DATABASE_URL=postgres://localhost/verim_mip npx ts-node src/mim/seed.ts   # 20k iz
IZ_SCALE=1000000 ... npx ts-node src/mim/seed.ts                          # 1M iz (hacim)
DATA_BACKEND=mim DATABASE_URL=... npm run start:dev                       # MIM modda çalıştır
DATABASE_URL=... npx ts-node src/mim/equivalence-check.ts                 # dummy ↔ mim eşdeğerlik
```

Mercek sorguları (`SqlObjectSetEngine`) tamamen SQL'e itilir — 1M izde
filtre/aggregate/join ~1sn. Harman'ın board motoru in-memory kalır;
tablolar `MIP_SCAN_LIMIT` (vars. 100k, pk sıralı) tavanıyla çekilir.

## Gerçek zamanlı akış (Redpanda + ingest)

```
source-sensor (JSON)  ─┐
source-mip4ies (XML)  ─┤─► Redpanda ─► ingest ─► MIM staging ─► app (canlı mod)
source-intel (multi-INT)┘   (SIGINT/IMINT/OSINT/HUMINT, ~25 rapor/sn)
```

Kaynak üreticileri (`src/ingest/producer-*.ts`) veritabanını bilmez —
kendi filolarını simüle edip topic'lere yayınlar. `ingest-service.ts`
formatları ortak gözleme normalize eder ve MIM desenini uygular: bilinmeyen
iz → ObjectItem yarat, gözlemi ReportingData'ya EKLE (geçmiş), konum/
sınıflandırmayı UPSERT et. Dataset versiyonu watermark'la ilerlediği için
frontend "Canlı" modda kendini tazeler. Yeni gerçek kaynak = yeni topic +
parse fonksiyonu; sistemin geri kalanı değişmez.

**İstihbarat füzyonu (source-intel):** SIGINT/IMINT/OSINT/HUMINT raporlarını
`verim.istihbarat`e akıtır; gözlem topic'ine SUB olup SIGINT/IMINT'i gerçek
izlere korelasyonlar (çok kaynaklı füzyon). `intel_report` → `v_istihbarat`;
ontolojide `istihbarat_raporu` tipi (`rapor-iz` değer-bazlı link). Besteci
`intel-feed.ts` hem dummy seed hem canlı akışta ORTAK.

## Profesyonel servis yığını (docker compose)

Verilerin ve kaynakların dışında hiçbir parça bellek-içi taklit değildir:

| Servis | Rol |
|--------|-----|
| **TimescaleDB** | MIM staging + `reporting_data` hypertable (zaman-serisi) |
| **Redpanda** | Kafka uyumlu mesaj omurgası |
| **source-sensor/mip4ies/intel** | Sürekli veri yayan kaynaklar |
| **ingest** | Topic'leri normalize edip staging'e yazar |
| **Neo4j** | Bağlantı analizi grafı (indeksli, Cypher) |
| **OpenSearch** | Global nesne araması (tam-metin, fuzzy) |
| **app** | NestJS API + statik SPA (:8080) |

Portlar (SEARCH_PROVIDER, GRAPH_PROVIDER, OBJECT_SET_ENGINE, QUERY_ENGINE,
DATASET_PROVIDER, ONTOLOGY_PROVIDER) sayesinde her servis gerçek adapter'ıyla
(mim) ya da docker'sız dev fallback'iyle (dummy) çalışır — API sabit kalır.

## SQL pushdown (Harman, mim backend)

`SqlPushdownQueryEngine` board zincirinin filtre önekini SQL WHERE'e iter
(1M+ satırı belleğe çekmek yerine eşleşenleri getirir); kalan board'lar
`InMemoryQueryEngine`'in doğrulanmış mantığıyla işlenir → sonuç iki yolda
birebir (eşdeğerlik testiyle kanıtlı).

## Dizin yapısı

```
src/
  contract/      Frontend ile senkron tutulan tipler + zod şemaları
                 (kaynak: apps/client/src/types — değişiklikte iki taraf birlikte güncellenir)
  common/        ApiError (contract hata şekli), ZodValidationPipe
  datasets/      DATASET_PROVIDER portu, controller, dummy/ seeded üretici
  query/         QUERY_ENGINE portu, controller, in-memory/ executor
    in-memory/expression/   mini expression dili (tokenizer + Pratt parser + evaluator)
```

## Dummy veri

Deterministik (faker seed=4242): her açılışta byte-aynı veri — `version`
token'ı dürüst, sorgu cache'i güvenilir.

| Dataset | İçerik |
|---|---|
| `birlikler` | Birlikler (domain, kademe, hazırlık oranı) |
| `platformlar` | Platformlar (tip, domain, bağlı birlik, konum) |
| `gorevler` | Görevler (tip, öncelik, icra eden birlik) |
| `sensorler` | Sensörler (tip, takılı platform, menzil) |
| `izler` | İzler (sınıflandırma, tespit eden sensör, tehdit seviyesi) |

All Domain Joint C2 ontolojisi: 5 nesne tipi + 8 yönlü link
(`ONTOLOGY_PROVIDER` portu, `src/ontology/dummy-ontology-provider.ts`).

## Desteklenen board'lar

filter (tüm operatörler, $parametre, keep/remove, and/or, dedup) ·
expression (4 mod; `sum(revenue)/count()` gibi iç içe aggregate aritmetiği) ·
histogram (group+aggregate, bar seçimiyle downstream filtre, pivoted) ·
pivot (satır×sütun boyutları, 100 kolon truncation) · enrich (left/inner join) ·
setMath (keepOnly/add/remove) · editColumns (drop/rename/cast/reorder) ·
chart/table (display-only — executor atlar)

Expression dili: aritmetik, karşılaştırma, and/or/not, `$param`,
`upper lower length concat abs round floor ceil coalesce if year month day hour`
+ aggregate modunda `sum avg min max count count_distinct median stddev variance`.

## Karar Destek (akıl yürütme motoru)

Deterministik (LLM değil — askeri denetlenebilirlik) tehdit skorlama + ROE/COA +
senkronizasyon. `DATA_BACKEND`'den bağımsız; `OBJECT_SET_ENGINE` portu üzerinden
canlı veriyle çalışır (`src/reasoning/`).

| Uç | İş |
|---|---|
| `GET /reasoning/tehditler` | En yüksek tehdit skorlu izler (writeback'ten, indeksli okuma) |
| `POST /reasoning/coa` | Bir iz için ROE-uyumlu angajman senaryoları (COA) |
| `GET /reasoning/durum` | Çok-kaynak füzyonu durum özeti |
| `GET /reasoning/senkronizasyon` | Angajman senkronizasyon matrisi (dost varlık × zaman penceresi) |

**Senkronizasyon matrisi** en yüksek N tehdidin önerilen COA'sını tek bir
planlama grid'inde toplar — satır = dost varlık (domain'e gruplu), sütun = kesişme
süresinden türeyen zaman penceresi, hücre = o varlığın o pencerede angaje ettiği
tehdit(ler). Montaj saf/test edilebilir (`src/reasoning/senk-matris.ts`); frontend'de
Karar Destek sayfasında ve Pano'da `senkronizasyon` gadget'ı olarak kullanılır.

## Canlı dataset (`/query/live`)

Materialize'ın ("dataset olarak kaydet" — anlık görüntü) kardeşi: satırlar
değil **tarif** saklanır; dataset her okunuşta güncel veriden yeniden
hesaplanır (kullanıcı katında VIEW). Kurallar:

- **Kabul hattı:** aday tarif kayıttan ÖNCE gerçekten çalıştırılır (motor
  hatası, eksik `$parametre`, tavan aşımı → saklanmaz, hata döner).
- **Fail-closed:** çözüm tarama tavanına takılırsa kısmi sonuç yerine
  `RESULT_TOO_LARGE` döner (materialize da kırpık snapshot kaydetmez).
- **Sürüm dürüstlüğü:** canlı sürüm; tarifin içeriği + başvurulan tüm
  dataset sürümleri (+ göreli-zamanlı tariflerde 30 sn'lik duvar saati
  kovası) üzerinden türetilir → kaynak watermark'ı ilerleyince frontend
  kendini tazeler. Aynı sürüm önbellekten döner; eşzamanlı istekler tek
  çözüm koşturur (stampede dedup).
- **Değişmez tanımlar:** güncelleme ucu yok — sil + yeniden oluştur (döngü
  yapısal olarak imkânsız). Silmede yönetişim çıtası: başka canlı dataset
  VEYA kayıtlı analiz/alarm/dashboard başvuruyorsa red.
- Kalıcılık AnalysesStore deseniyle (`live-datasets.json`); `derived_*`
  anlık görüntüler oturumluk olduğundan kalıcı tarif onlara bağlanamaz.

## Verim Asistanı (AIP karşılığı)

`/assistant/chat` — doğal dil sorusunu ontolojiyi bilen bir LLM'e verir
(OpenAI tool-calling); LLM `nesne_yukle`/`nesne_grupla`/`zaman_serisi`
araçlarıyla gerçek sorgu motorunu çağırır. Ürettiği her `ObjectSetDef`
normal yoldan (zod + engine) koşar; hatalı sorgu reddedilir, hata LLM'e
geri döner. `OPENAI_API_KEY` yoksa asistan devre dışı kalır
(`/assistant/status` → `{available:false}`), sistemin geri kalanı çalışır.
`ASSISTANT_MODEL` ile model seçilir (vars. gpt-4o).

Cevaplar metinden ibaret değildir: sorgu araçlarının sonuçları
`paneller[]` (tablo/grafik/metrik/zaman — `AssistantPanel`) olarak döner ve
UI sohbetin içinde canlı çizer; her panel üretildiği `def`'i taşır.
`POST /assistant/mercege-ac` bir paneli kalıcı Mercek analizine çevirir
(araçla aynı `createMercekAnalysis` yolu — lint dahil). `haritaya_git`
aracı `merkez{lat,lon,zoom,etiket}` alır; UI haritayı o noktaya uçurur.

## Birleşik dashboard (/dashboards)

Platformda TEK dashboard sistemi vardır; her öğe bir **gadget**'tır
(`src/dashboards/dashboard-schema.ts` — 10 tip, tek üye listesinden hem
asistan-girdisi hem doküman şeması türer, strict). `id='sistem'` SANALDIR:
koddan üretilir (`sistem-dashboard.ts`), PUT/DELETE reddedilir — kullanıcı
kopyalayıp kendininkini düzenler. Kalıcılık AnalysesStore deseniyle
(`dashboards.json`, GCS destekli). Asistan `dashboard_olustur` aracıyla
gadget listesi verir; yerleşimi `autoLayout` yapar.

## Object set engine (Mercek/Mercek)

`/objectsets/load|aggregate|timeseries` — recursive `ObjectSetDef` çözücü
(`src/ontology/object-set-engine.ts`): `base` · `filter` ($parametre destekli)
· `searchAround` (ilişkili nesne kümesine geç) · **`joinLinked`** (kümeyi
değiştirmeden hedef tipin kolonlarını `hedefTip__kolon` anahtarıyla satır-bazlı
ekler; sonuç şemasına `extraProperties` olarak düşer) · `fromPrimaryKeys`
(drill-down). Analiz dokümanları `/mercek/analyses` CRUD'unda saklanır
(lokalde `.data/`, Cloud Run'da `GCS_BUCKET`).

## Çalıştırma

```bash
npm install
npm run start:dev     # http://localhost:3000, Swagger: /docs
npm run test:e2e      # 9 e2e testi
```

## Docker (production-uyumlu lokal/kapalı-ağ ortamı)

Repo kökünden (compose + Dockerfile bağlamı kök dizindir):

```bash
docker compose up -d --build          # http://localhost:8080 (hvlamd/hvlamd)
IZ_SCALE=1000000 docker compose up -d --force-recreate seed   # 1M izle yeniden seed
docker compose down                   # durdur (veriler volume'da kalır)
docker compose down -v                # veriler dahil sıfırla
```

Düzen Cloud Run'daki production ile aynıdır: tek `app` container'ı statik
SPA'yı ve API'yi aynı origin'den sunar (`DATA_BACKEND=mim`), `db`
PostgreSQL 17 MIM staging'idir, `seed` tek seferlik şema+veri yükleyicidir.
Kayıtlı analizler `appdata` volume'unda (GCS'siz mod), MIM verisi `pgdata`
volume'unda kalıcıdır. Ayarlar env ile: `APP_PORT`, `POSTGRES_PASSWORD`,
`IZ_SCALE`, `MIP_SCAN_LIMIT`. Bu compose dosyası, gelecekteki kapalı-ağ
(on-prem) dağıtımının da temelidir.

CORS tüm `localhost:*` origin'lerine açık (Vite dev server için).

## Demo'yu başka bir makineye taşıma (`verim-demo.web.app` → localin)

`verim-demo.web.app` ve `verim-…run.app` **statik bir kopya değildir**; paylaşılan
bir bulut proxy'si (Cloud Run), GCS'teki güncel tünel adresini okuyup isteği o an
tüneli açık olan makinenin `localhost:8080`'ine iletir (301 yönlendirme yok — içerik
doğrudan localden gelir). Yani "demoyu ayağa kaldırmak" = yerel yığını çalıştırıp
tünel adresini paylaşılan GCS'e yazmak. Bulut tarafına dokunmak (deploy) gerekmez.

Sıfır makinede tek komut:

```bash
git clone https://github.com/batuayhan/verim.git
cd verim
./verim-demo-up.sh          # araçları kurar, yığını başlatır, tüneli açar,
                            # GCS'e yazar → web.app localine akar
```

`verim-demo-up.sh` her şeyi halleder: brew araçları (docker/cloudflared/
google-cloud-sdk), docker daemon (zaten ayaktaysa dokunmaz; yoksa kurulu **Docker
Desktop**'ı açar, o da yoksa **colima**'ya düşer), `gcloud auth login` (ilk sefer, GCS
yazma yetkili hesapla), `docker compose`, cloudflared tüneli ve
GCS yayını.
`Ctrl+C` ile her şey temiz kapanır; GCS adresi silinir, web.app/run.app otomatik
**prod fallback**'ine (bulut kopyası) döner — link asla ölmez.

Asistan (OpenAI) isteğe bağlıdır: `OPENAI_API_KEY`'i ortamda ver veya
`~/.verim/openai.env` içine `export OPENAI_API_KEY=sk-...` yaz (repoya asla yazma).
Yoksa Asistan devre dışı kalır, gerisi normal çalışır.

Tüneli elle yönetmek istersen: `~/Code/verim-ops/verim-tunnel.sh` (yığın zaten
ayaktayken sadece tüneli açar/kapar). Ayrıntı: kod içi yorumlar.
