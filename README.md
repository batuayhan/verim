# Verim

**Tüm Alan Müşterek C2 veri platformu** — çok kaynaklı veriyi tek ontoloji
altında toplayan, analiz eden ve karar destek üreten bir sistem. Palantir
Foundry/Gotham ailesinin mantığını (pipeline analizi, nesne keşfi, bağlantı
analizi, ortak harekât resmi) açık teknolojilerle kuran, uçtan uca çalışan
bir referans uygulamadır.

Tek komutla ayağa kalkar, kapalı ağda çalışır, üretim düzeniyle aynı yapıdadır.

```bash
docker compose up -d     # → http://localhost:8080  (giriş: hvlamd / hvlamd)
```

## Modüller

| Modül | Ne yapar |
|---|---|
| **Harman** | Pipeline analizi: dataset seç, üzerine board zincirle (filter, expression, histogram, pivot, enrich, setMath). Veri yukarıdan aşağı akar, her board bir öncekinin çıktısını işler; bir board değişince altındakiler otomatik geçersizleşir. |
| **Mercek** | Nesne keşfi: ontoloji üzerinde nesne kümeleri kur (`filter`, `searchAround`, `joinLinked`), ilişkiler üzerinden gezinerek daralt/genişlet. |
| **Harita** | Ortak Harekât Resmi (COP): canlı izler, görev katmanları, zaman oynatma (playback), harita↔analiz çift yönlü köprü. |
| **Bağlantı** | Bağlantı analizi: varlık ağı gerçek graf veritabanında (Neo4j), Cypher ile sorgulanır. |
| **Asistan** | Doğal dil ile sorgu: LLM'in ürettiği her sorgu normal doğrulama + motor yolundan geçer; geçersizse reddedilir ve hata modele geri beslenir. |
| **Pano** | Sürükle-bırak dashboard; board'ların ve gadget'ların birleşik görünümü. |
| **Ontoloji** | Şemayı kod değişmeden genişletme: kademeli (1-3) uzantı kabul hattı, dört-göz onayı, sürümleme. |

## Nasıl çalışır

```
source-sensor (JSON) ─┐
source-mip4ies (XML)  ─┼─► Redpanda ─► ingest ─► TimescaleDB ─► app ─► tarayıcı
source-intel (multi-INT)┘                  ▲                    │
                        reasoning (tehdit skoru) ┘        Neo4j + OpenSearch
```

Kaynak simülatörleri mesaj omurgasına yayın yapar; `ingest` gelen her formatı
tek MIM şemasına normalize eder (gözlem → geçmişe **ekle**, konum/sınıflandırma
→ **upsert**); `reasoning` canlı izleri sürekli skorlayıp tehdidi önceden
hesaplar. Uygulama bu depoların üstünde tek bir API olarak durur.

**Mimarinin çekirdeği — port & adapter (hexagonal):** veriye dokunan her
yetenek bir port'tur ve iki adaptörü vardır: `dummy` (bellek-içi, Docker'sız
çalışır) ve `mim` (gerçek PostgreSQL/graf/arama). İkisi **bit-özdeş** cevap
döner; frontend arada hangisi olduğunu bilmez. Bu yüzden aynı sistem laptop'ta
bağımlılıksız da, kapalı ağda tam yığınla da aynı davranır.

| Port | dummy | mim |
|---|---|---|
| `DATASET_PROVIDER` | deterministik üretilmiş veri | PostgreSQL görünümleri |
| `QUERY_ENGINE` | bellek-içi board motoru | SQL pushdown (kalan board'lar aynı motorda) |
| `OBJECT_SET_ENGINE` | bellek-içi çözümleyici | tam SQL çevirisi |
| `GRAPH_PROVIDER` | bellek-içi komşuluk | Neo4j |
| `SEARCH_PROVIDER` | bellek-içi arama | OpenSearch |

İki yolun aynı sonucu verdiği `equivalence-check` ile kanıtlanır.

## Teknoloji

**Arayüz** React 19 · TypeScript · Vite · Redux Toolkit (+redux-undo) ·
TanStack Query · MUI · MapLibre GL (harita) · Recharts (grafik) ·
react-grid-layout (pano) · Zod

**Sunucu** NestJS · TypeScript · Zod (client ile ortak sözleşme) · kafkajs ·
fast-xml-parser · Swagger

**Veri** TimescaleDB/PostgreSQL (ana depo + gözlem geçmişi, hypertable) ·
Redpanda (Kafka uyumlu omurga) · Neo4j (varlık grafı) · OpenSearch (tam metin)

**Çalıştırma** Docker Compose · Kubernetes (kustomize) · Cloud Run

> Telemetri ile varlık grafı bilinçli olarak ayrışır: milyonlarca gözlem
> zaman-serisi deposunda kalır, graf veritabanında yalnız varlık ağı (~4 bin
> düğüm) durur.

## Depo düzeni

```
apps/
├── client/   React SPA
└── server/   NestJS API (ports & adapters)
docker-compose.yml            tam yığın (:8080)
docker-compose.dev.yml        geliştirme: hot reload (:5173 + :3000)
docker-compose.backbone.yml   bulut omurgası (kaynaklar + ingest)
k8s/                          Kubernetes manifestleri
deploy.sh                     Cloud Run dağıtımı
verim-demo-up.sh              sıfır makinede demo + tünel (tek komut)
```

## Kurulum

```bash
# Tam yığın — tek komut (ilk seferde imaj derlenir)
docker compose up -d                             # http://localhost:8080

# Geliştirme — hot reload'lu tam ortam
docker compose -f docker-compose.dev.yml up -d   # client :5173, server :3000
#   canlı akış hattı da istenirse:  ... --profile live up -d

# Docker'sız (dummy backend, bağımlılık yok)
cd apps/server && npm ci && npm run start:dev    # :3000, Swagger /docs
cd apps/client && npm ci && npm run dev

# Kubernetes
kubectl apply -k k8s/                            # ayrıntı: k8s/README.md
```

Daha fazlası: [mimari](apps/client/docs/MIMARI.md) ·
[sistem rehberi](apps/client/docs/SISTEM_REHBERI.md) ·
[server](apps/server/README.md) · [client](apps/client/README.md)

> **Not:** Varsayılan şifreler ve `hvlamd/hvlamd` girişi yalnızca yerel
> geliştirme içindir; veriler sentetik olarak üretilir. Gerçek bir kurulumda
> kimlik doğrulama ve tüm şifreler değiştirilmelidir.

## Lisans

MIT — bkz. [LICENSE](LICENSE).
