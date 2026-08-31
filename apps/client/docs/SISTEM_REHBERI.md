# Verim — Sistem Rehberi, Sunum ve Sık Sorulanlar

Bu doküman üç kitleyi birden düşünür: **sistemi sunacak/inceleyecek mühendis**,
**meraklı ama teknik olmayan dinleyici**, ve **sahadaki asker / karar veren
komutan**. Önce sistemi bir sayfada özetler; sonra her sınıfın ne yaptığını
tek tek anlatır; en sonda her kitlenin sorabileceği soruları — empati kurarak —
dürüst cevaplarıyla verir.

İlgili dokümanlar: mimari + diyagramlar → [MIMARI.md](MIMARI.md); yol haritası →
[ROADMAP.md](ROADMAP.md); ontoloji ↔ MIM eşlemesi → [DERS_ONTOLOJI_MIM.md](DERS_ONTOLOJI_MIM.md).

---

## 1. Tek paragrafta Verim

Verim, **birçok farklı kaynaktan (radar/sensör, MIP4-IES rapor alışverişi,
SIGINT/IMINT/OSINT/HUMINT istihbaratı) saniyede onlarca veri akarken**, bu
verinin üstünde **komuta-kontrol seviyesinde analiz, ortak harekât resmi,
bağlantı analizi, arama ve doğal-dil sorgulama** yapmayı sağlayan bir Tüm
Alan Müşterek C2 (All Domain Joint C2) veri platformudur. Palantir'in Foundry
(Harman + Mercek + Gotham) ve Maven Smart System ürünlerinin mantığını,
NATO'nun **MIM (MIP Information Model, MIP 4)** ontoloji-tabanlı veri modeliyle
birleştirir. Tamamı Türkçe arayüzlü, kapalı ağda çalışabilir, açık teknoloji
yığınıyla (Postgres/TimescaleDB, Redpanda, Neo4j, OpenSearch, NestJS, React)
kurulmuştur.

**Marka eşlemesi:** Verim = platform; **Harman** = pipeline analizi (Harman);
**Mercek** = nesne keşfi (Mercek); **Harita** = Ortak Harekât Resmi (COP);
**Bağlantı** = link-analysis (Gotham); **Asistan** = doğal-dil AI (AIP).

---

## 2. Ne problemi çözüyor?

Modern bir karargâhta veri **çok, hızlı ve dağınıktır**: her sensör kendi
formatında konuşur, istihbarat ayrı sistemlerde birikir, harita bir yerde,
tablolar başka yerde. Analist saatlerce veriyi elle birleştirir; komutan
"şu an sınırda ne var?" sorusuna anlık cevap alamaz.

Verim üç şeyi aynı anda yapar:

1. **Füzyon** — farklı kaynakları tek bir **ontolojide** (ortak nesne modeli)
   birleştirir: bir "iz" hangi sensör gördü, hangi platforma bağlı, hangi
   birliğe ait, hangi istihbarat raporuyla ilişkili — hepsi tek tıkla gezilir.
2. **Canlılık** — veri akarken ekran kendini tazeler; "son 5 dakikadaki düşman
   izleri" gerçekten son 5 dakikadır.
3. **Erişilebilirlik** — analist kod/SQL bilmeden select'lerle sorgu kurar;
   isteyen doğal dille ("Rusya'ya en yakın 3 iz") sorar.

---

## 3. Teknoloji yığını (hepsi gerçek servis, taklit değil)

| Katman | Teknoloji | Neden |
|---|---|---|
| Veri deposu | **TimescaleDB** (Postgres superset) | İlişkisel güç + zaman-serisi (gözlem geçmişi hypertable) |
| Mesaj omurgası | **Redpanda** (Kafka uyumlu) | Kaynakları depodan ayırır; tek binary, kapalı ağa uygun |
| Bağlantı grafı | **Neo4j** | İlişki gezinme indeksli (tarama değil) |
| Arama | **OpenSearch** | Tam-metin, fuzzy, çok tipli |
| Sunucu | **NestJS** (TypeScript) | Tip güvenli, port/adapter mimarisine uygun |
| Arayüz | **React + MUI** | Zengin, bileşen tabanlı |
| Yapay zeka | **OpenAI tool-calling** | Doğal dil → doğrulanmış sorgu |
| Dağıtım | **Docker Compose** (yerel) / **Cloud Run + Cloud SQL** (prod) | Taşınabilir, kapalı ağda da kurulabilir |

Tek kural: **veriler ve veri yayan kaynaklar dışında hiçbir parça
bellek-içi taklit değildir.** Kaynak simülatörleri gerçek beslemenin yerini
tutar (yarın gerçek radar gelince yalnız o değişir); geri kalan her servis
(DB, graf, arama, omurga) production-grade gerçek yazılımdır.

---

## 4. Ontoloji: sistemin ortak dili

Ontoloji, sistemin "dünyayı nasıl gördüğüdür" — **8 nesne tipi, 20 ilişki**:

```
birlik ──(elindeki)──> platform ──(takılı)──> sensör ──(tespit)──> iz ──(geçmiş)──> iz_gözlem
  │                        │                                          │
  ├─(personeli)─> personel ┘ (görevli/mürettebat)                    └─(ilgili)─> istihbarat_raporu
  ├─(komutanı)──> personel                                                          (SIGINT/IMINT/
  └─(görevleri)─> görev ──(komutanı)──> personel                                     OSINT/HUMINT)
```

Bu ontoloji **elle yazılmış ikinci bir tanım değildir**: MIM (MIP 4) entity/
attribute eşlemesinden türetilir (`mim-ontology.ts`). Her nesne tipinin,
özelliğin ve ilişkinin arkasında bir MIM kaynağı vardır (izlenebilirlik).
Gerçek MIP replikası geldiğinde bu eşleme onun üzerinden doğrulanır; Verim'in
sözleşmesi sabit kalır.

---

## 5. Sınıf sözlüğü — her parça ne yapar?

Modül modül, enjekte edilen sınıflar ve kilit dosyalar. (Frontend'de "sınıf"
yerine React bileşenleri/context'ler vardır; onlar da özetlendi.)

### 5.1 Sözleşme ve ortak (contract, common)
| Dosya/Sınıf | Rol |
|---|---|
| `contract/*.ts` | Frontend ↔ backend **ortak tipleri** (BoardConfig, ObjectSetDef, ontoloji, API şekilleri). İki taraf birlikte değişir. |
| `contract/zod.ts` | Aynı tiplerin **çalışma-zamanı doğrulayıcıları** (zod). Gelen her istek buradan geçer. |
| `common/api-error.ts` | Tek tip hata şekli (kod + mesaj + board index). |
| `common/zod-validation.pipe.ts` | Controller'lara giren gövdeyi zod'la doğrulayan NestJS pipe'ı. |

### 5.2 Ontoloji ve nesne sorguları (ontology)
| Sınıf | Rol |
|---|---|
| `ONTOLOGY_PROVIDER` (port) | Ontoloji tanımını sunan arayüz. |
| `DummyOntologyProvider` | Ontolojiyi doğrudan tanımlar (docker'sız dev). |
| `MimOntologyProvider` | Ontolojiyi **MIM eşlemesinden türetir** (gerçek yol). |
| `OBJECT_SET_ENGINE` (port) | Mercek sorgularını (yükle/grupla/zaman-serisi) çalıştıran arayüz. |
| `ObjectSetEngine` | Sorguları **bellek-içi** çözer (dummy). |
| `GRAPH_PROVIDER` (port) | Komşuluk + kenar (bağlantı analizi) arayüzü. |
| `DummyGraphProvider` | Grafı bellek-içi adjacency'den çözer (dummy). |
| `OntologyController` | `/ontology`, `/objectsets/*`, `/graph/*` uçları. |

### 5.3 MIM staging — gerçek veri yolu (mim)
| Sınıf | Rol |
|---|---|
| `SqlClient` | PostgreSQL bağlantı havuzu. |
| `MimDatasetProvider` | Ham tabloları `v_*` view'larından okur (tavanlı). |
| `SqlObjectSetEngine` | **Mercek sorgularını SQL'e derler** (pushdown, milyon ölçeği). |
| `SqlPushdownQueryEngine` | **Harman filtre önekini SQL'e iter**, kalanı in-memory'ye devreder. |
| `Neo4jGraphProvider` | Bağlantı grafını **Cypher** ile Neo4j'den okur. |
| `mim-ontology.ts` (MIM_MODEL) | Ontoloji ↔ MIM eşlemesi (tek gerçek). |
| `mim-mapping.ts` | Dataset ↔ view ↔ kolon eşlemesi. |
| `seed.ts` | Şemayı kurar + deterministik başlangıç verisini yükler (tek seferlik). |
| `graph-load.ts` | Varlık ağını Neo4j'ye yükler (tek seferlik). |
| `simulator.ts` | (Eski yol) DB-içi iz hareket simülatörü. |
| `equivalence-check.ts` | **dummy ≡ mim** kanıtı: aynı sorgular iki motorda birebir mi? |

### 5.4 Sorgu motoru (query)
| Sınıf | Rol |
|---|---|
| `QUERY_ENGINE` (port) | Harman board zincirini çalıştıran arayüz. |
| `InMemoryQueryEngine` | Board zincirini bellekte uygular (9 board tipi + mini expression dili). |
| `expression/parser.ts` | Expression board'un **mini dili** (tokenizer + Pratt parser + evaluator). |
| `relative-time.ts` | "son N dakika/saat/gün" → çalışma-anı ISO (göreli zaman). |
| `QueryController` / `MaterializeController` | `/query`, `/query/materialize` uçları. |

### 5.5 Akış / ingest (ingest)
| Sınıf | Rol |
|---|---|
| `TrackFleet` | Bir kaynağın "gördüğü" izlerin bellek-içi filosu (fizikle hareket eder). |
| `producer-sensor-sim.ts` | Sensör ağı kaynağı: JSON gözlem yayınlar. |
| `producer-mip4ies.ts` | MIP4-IES kaynağı: XML rapor seti yayınlar. |
| `intel-feed.ts` | **Multi-INT rapor bestecisi** (SIGINT/IMINT/OSINT/HUMINT); dummy seed ile canlı akış ortak kullanır. |
| `producer-intel.ts` | İstihbarat kaynağı: `intel-feed`'i saniyede ~25 yayınlar; gözleme sub olup izlere korelasyonlar. |
| `ingest-service.ts` | Topic'leri tüketir, normalize eder, **yarat/ekle/upsert** deseniyle yazar; FK ve deadlock **self-heal**; intel retention. |

### 5.6 Arama (search)
| Sınıf | Rol |
|---|---|
| `SEARCH_PROVIDER` (port) | Global arama arayüzü. |
| `OpenSearchProvider` | Gerçek OpenSearch'e fuzzy tam-metin sorgu. |
| `InMemorySearchProvider` | Docker'sız dev fallback'i (bellek-içi tarama). |
| `search-load.ts` | Varlık nesnelerini OpenSearch'e indeksler (tek seferlik). |
| `SearchController` | `/search` ucu. |

### 5.7 Asistan (assistant) — AIP karşılığı
| Sınıf | Rol |
|---|---|
| `AssistantService` | Ontolojiyi BİLEN LLM'i sorgu motorlarına araç olarak bağlar; ürettiği her sorgu aynı zod'dan/motordan geçer. |
| `analysis-builder.ts` | Doğal-dil tarifini **Mercek/Harman kart-board zincirine derler** (kara kutu değil, açılıp düzenlenebilir). |
| `capabilities/catalog.ts` | Asistanın yetenekleri **contract'a derleyici-bağlı** — yeni board/kart eklenip açıklaması yazılmadan proje derlenmez. |
| `capabilities/def-lint.ts` | LLM'in ürettiği sorguyu motora gitmeden ön-doğrular (Levenshtein önerili: "izler" → "belki 'iz'"). |
| `capabilities/tool-schemas.ts` | Araç şemalarını API zod'larından türetir (sapma imkânsız). |
| `AssistantController` | `/assistant/chat`, `/mercege-ac`, `/manifest`. |

### 5.8 Alarmlar (alerts)
| Sınıf | Rol |
|---|---|
| `AlertsService` | Kuralları periyodik değerlendirir (ObjectSet + pencere + eşik + cooldown). |
| `AlertNotifier` | Tetiklenince **webhook** (Slack/Teams, gerçek POST) + **e-posta** (SMTP) gönderir. |
| `AlertRulesStore` | Kuralları kalıcı saklar. |
| `AlertsController` | `/alerts/*` (CRUD, olaylar, kanallar, elle-tetikle). |

### 5.9 Dashboard, analiz, auth (dashboards, analyses, auth)
| Sınıf | Rol |
|---|---|
| `dashboard-schema.ts` | 10 gadget tipinin sözleşmesi (stat/grafik/tablo/harita/…). |
| `sistem-dashboard.ts` | **Sanal** Sistem panosu: koddan üretilir, bozulamaz ("varsayılana dön" bedava). |
| `AnalysesStore` | Kayıtlı Harman/Mercek analizlerini dosya/GCS'de saklar. |
| `AuthModule` | Bearer token (TokenGuard) + `/auth/login`. |

### 5.10 Frontend uygulamaları (verim-frontend/src)
| Alan | Rol |
|---|---|
| `pano/` | Birleşik dashboard (gadget'lar, çapraz filtre, sürükle-bırak). |
| `components/boards/` | Harman board'ları + path editörü + `TimeConditionInput` (göreli/belirli zaman). |
| `mercek/` | Mercek kartları, canvas, graf/dashboard modları. |
| `harita/` | Canlı COP: katmanlar (nokta/ısı/iz-izi/istihbarat/menzil/AOI). |
| `graf/` | Bağlantı analizi grafı (force-directed, balon gruplama). |
| `alarmlar/` | Kural kurucu + zil + kanal alanları. |
| `asistan/` | Sohbet çekmecesi + sohbet-içi paneller (`PanelView`). |
| `nesne/` | `NesneDetay` — sonsuz drill çekmecesi. |
| `search/` | `GlobalSearch` — TopNav arama kutusu. |
| `core/` | Şema propagasyonu, sorgu anahtarı, viz paleti, akıllı zaman serisi. |
| `api/live.tsx` | Canlı mod context'i (3 sn tazeleme). |

---

## 6. Sık sorulanlar — TEKNİK kitle (mühendis / mimar)

**S: Neden mikroservis değil de tek uygulama + portlar?**
Sorgu, ontoloji, asistan, alarm aynı ontolojiyi ve aynı sorgu motorunu
paylaşır; bunları ağ üzerinden bölmek gecikme ve tutarsızlık getirirdi. Bunun
yerine **hexagonal port/adapter**: her dış bağımlılık (DB, graf, arama, LLM)
bir arayüz arkasında, iki adapter'lı (gerçek/dev). Ölçek gerektiğinde bir port
ayrı servise taşınabilir — API değişmeden.

**S: 1 milyon+ ize gerçekten ölçekleniyor mu, yoksa slayt mı?**
Mercek sorguları baştan beri **SQL pushdown**: filtre→WHERE, sayım→GROUP BY
veritabanında biter, ham satır taşınmaz. Harman da artık filtre önekini SQL'e
itiyor (`SqlPushdownQueryEngine`). Kanıt: `IZ_SCALE=1000000` seed'iyle 1M izde
filtreli sayımlar saniyeler içinde; gözlem geçmişi TimescaleDB hypertable'da
günlük chunk'lara bölünmüş.

**S: Üç ayrı depo (Postgres, Neo4j, OpenSearch) — tek gerçek nerede,
tutarlılık nasıl?**
**Tek gerçek TimescaleDB staging'dir.** Neo4j ve OpenSearch onun **türev
indeksleridir** (`graph-load`, `search-load` ile doldurulur). Graf varlık
ağını tutar (yavaş değişir); arama varlık nesnelerini indeksler. Yüksek-hacimli
telemetri (iz/gözlem) yalnız Postgres'te; graf/arama onu taşımaz. Yeniden
indeksleme tek komut.

**S: Asistanın uydurma (halüsinasyon) sorgu üretmesini ne engelliyor?**
Üç katman: (1) LLM'e giden şemalarda `objectType`/`linkType` **çalışma-zamanı
kapalı liste** (`injectRuntimeEnums`); (2) motora gitmeden `def-lint`
ön-doğrulaması (yakın-eşleşme önerili); (3) ürettiği her `ObjectSetDef` **aynı
zod + aynı motordan** geçer — uydurma sorgu güvenle reddedilir, hata LLM'e
dönüp kendini düzeltir. Ayrıca asistanın bildiği yetenekler contract'a
**derleyici-bağlıdır**: yeni yetenek eklenip belgelenmezse proje derlenmez.

**S: Test stratejisi? "dummy ≡ mim eşdeğerliği" neden bu kadar önemli?**
İki bağımsız motor var: bellek-içi (dummy) ve SQL (mim). `equivalence-check`
onlarca sorguyu ikisinde de koşup **birebir aynı** sonucu doğrular — biri
diğerinin canlı referans testidir. Ayrıca e2e (23 test), asistan drift testi
(yetenek/şema/fikstür kapsamı CI'da). Bir motor sapunca test kırılır.

**S: Güvenlik?**
Bearer token (TokenGuard) tüm uçlarda; SQL'de değerler **bağlı parametre**
(injection imkânsız), kolon adları ontolojiye karşı doğrulanır. Kapalı ağda
çalışır (harita tile sunucusu, LLM anahtarı dışarıdan/opsiyonel). LLM anahtarı
yoksa asistan kibarca devre dışı, sistem etkilenmez.

**S: Neden TypeScript/NestJS/React, Java/Python değil?**
Frontend ve backend **aynı tip sözleşmesini** paylaşır (contract) — tek dilde
tek doğruluk kaynağı, derleyici iki tarafı birden zorlar. NestJS'in DI'ı
port/adapter'a doğal oturur. Bu bir tercih; portlar sayesinde bir motor başka
dilde ayrı servise de taşınabilir.

**S: Cache neden bayat veri göstermiyor?**
Her dataset'in `version`'ı bir **watermark** taşır (son gözlem/istihbarat id).
Ingest yazınca ilerler → sorgu anahtarı değişir → canlı mod gerçek veriyi
çeker. "Optimistik ama dürüst."

**S: Gerçek MIP4/MIM'e geçiş maliyeti?**
Yalnızca adapter. Ontoloji zaten MIM eşlemesinden türüyor; `db/views.sql`
gerçek replikanın kolonlarına uyarlanır, `MimOntologyProvider`/`MimDataset
Provider` gerçek kaynağa bağlanır. Frontend, sorgu dili, asistan sabit.

**S: Ontolojiyi kod değiştirmeden genişletebilir miyim? Kontrolsüz olmaz mı?**
Evet — iki katmanlı model: çekirdek (iz/sensör/…) kodda kalır; yeni tip/link
**OWL/Turtle (veya JSON) dosyasıyla** yüklenir. Kontrol için 5 kademeli kabul
hattı: (1) sözdizimi, (2) bağlama bütünlüğü (bağlandığı view/kolon gerçekten
var mı — `information_schema`), (3) davranış smoke (aday ontolojiyle GERÇEK
motorda load/aggregate/searchAround, aktifleşmeden), (4) **etki analizi**
(silinen bir tipe kayıtlı analiz/alarm referans veriyorsa reddet — bugünkü
derleyicinin YAPAMADIĞI kontrol), (5) yönetişim (dört-göz onay + değişmez
denetim izi + tek-tık rollback). "Derlenmez" → "yüklenmez". Karar analizi:
[KARAR_TRIPLE_VS_ILISKISEL.md](KARAR_TRIPLE_VS_ILISKISEL.md).

**S: Veriyi RDF/triple olarak mı saklamalıyız (herkes öyle diyor)?**
Kısa cevap: **hayır — semantik sınırda (OWL/RDF ontoloji + export), depolama
ilişkisel/graf/arama üçlüsünde.** Telemetriyi triple yapmak yazma ve pencereli
analitik performansını yıkar (1 gözlem ≈ 11 triple); derin ilişki gezinme
zaten Neo4j'de var; koalisyon RDF'i gerekince OBDA (R2RML/Ontop) ile depoyu
değiştirmeden SANAL SPARQL ucu açılır. Tam objektif analiz (kazanım/kayıp,
"askeri sistemde triple" argümanlarının değerlendirmesi, tersine çevirme
tetikleyicileri): [KARAR_TRIPLE_VS_ILISKISEL.md](KARAR_TRIPLE_VS_ILISKISEL.md).

**S: Prod'da canlı akış neden yok, düzeltilecek mi?**
Cloud Run **stateless**; Redpanda/üreticiler orada yaşayamaz. `deploy-backbone.sh`
bir GCE VM'de omurgayı kurup Cloud SQL'e yazar → prod haritası dolar. Script
hazır, gcloud auth ile tetiklenir.

---

## 7. Sık sorulanlar — MERAKLI ama teknik olmayan kitle

**S: Bir cümleyle, bu ne işe yarıyor?**
Dağınık ve hızlı akan askeri veriyi tek yerde toplayıp "şu an ne oluyor,
neyle ilişkili, nereye gidiyor" sorularına anında görsel cevap veren bir
kontrol odası yazılımı.

**S: "Ontoloji" ne demek?**
Sistemin ortak sözlüğü. "İz", "sensör", "birlik" nedir ve birbirleriyle nasıl
ilişkilidir — bunu bir kere tanımlarsın, tüm sistem aynı dili konuşur. Farklı
kaynaklardan gelen veri bu sözlükte buluşur.

**S: Palantir'le ilişkisi ne? Kopya mı?**
Palantir'in ürünlerinin (Foundry Harman/Mercek, Gotham, Maven) **mantığını**
örnek alan, sıfırdan yazılmış, açık teknolojiyle kurulmuş, NATO MIM veri
modeline ve Türkçe kullanıma göre şekillenmiş bağımsız bir sistemdir. Kod
kopyası değil; aynı problemi çözen özgün bir uygulama.

**S: Veriler gerçek mi?**
Şu an **gerçekçi ama sentetik** (simüle) veri akıyor — çünkü asıl amaç sistemin
mimarisini kanıtlamak. Gerçek sensör/istihbarat beslemesi geldiğinde yalnızca
"kaynak" kutuları değişir; sistemin geri kalanı aynı kalır. Yani boru hattı
gerçek, içinden şimdilik tatbikat verisi akıyor.

**S: Yapay zeka karar mı veriyor?**
Hayır. Asistan yalnızca **doğal dili doğrulanmış bir sorguya çevirir** ("düşman
izlerini haritada göster" → filtre + harita). Ürettiği her şey sistemin
kurallarından geçer, uyduramaz, ve sonucu insan görür. Karar her zaman insanda.

**S: Neden Türkçe?**
Kullanıcısı Türk askeri personeli olduğu için. Arayüz tamamen Türkçe; kod
içi teknik adlar (uluslararası standart olsun diye) İngilizce.

**S: Bunu ordu dışında biri kullanabilir mi?**
Evet — ontoloji değişir. Aynı mimari lojistik (araç/depo/sevkiyat), enerji
(saha/sensör/arıza) veya siber (varlık/olay/tehdit) için de çalışır. Askeri
ontoloji sadece bir örnek.

---

## 8. Sık sorulanlar — SAHADAKİ ASKER (operatör / analist)

**S: Ekranda ne görüyorum, ne yapıyorum?**
Haritada canlı izler (renk = dost/düşman/şüpheli/bilinmeyen), üstüne
istihbarat raporları ve sensör menzilleri. Bir ize tıklarsın → tüm detayı,
geçmişi, ilişkili raporlar açılır. Sorunu select'lerle kurarsın; kod bilmene
gerek yok.

**S: İnternet yoksa çalışır mı? (kapalı ağ)**
Evet. Tüm servisler kendi sunucunda (docker) koşar. Harita için yerel tile
sunucusu adresi verilir. Tek dış bağımlılık isteğe bağlı yapay zekadır (anahtar
yoksa asistan kapanır, gerisi çalışır).

**S: Veriye güvenebilir miyim? Yanlış gösterirse?**
Sistem gördüğü her verinin **kaynağını ve zamanını** taşır (hangi sensör, ne
zaman). İstihbaratta "kaynak güvenilirliği (A–F)" ve "bilgi doğruluğu (1–6)"
(STANAG 2511) alanları vardır — yani sistem sana "bu bilgi ne kadar sağlam"ı
da söyler. Karar senin; sistem şeffaf.

**S: Bir izi nasıl takip eder, geçmişini görürüm?**
İze tıkla → "İz izleri" katmanını aç: rotasının geçmişi çizgi olarak çıkar.
Her gözlem saklanır (silinmez), bu yüzden nereden geldiğini görebilirsin.

**S: Alarm gerçekten haber verir mi, kaçırır mı?**
Kuralı select'lerle kurarsın ("son 5 dakikada 50'den fazla düşman izi olursa").
Sistem 15 saniyede bir kontrol eder; tetiklenince zil çalar **ve** istersen
Slack/Teams/e-posta gider. Cooldown ile spam yapmaz.

**S: Sahte/aldatıcı veri gelirse (deception)?**
Sistem tek kaynağa körü körüne güvenmez: aynı izi farklı disiplinler (radar +
görüntü + istihbarat) doğrular; "çok kaynaklı füzyon" bu yüzden var. Çelişki
görürsen kaynakları tek tek inceleyebilirsin. Yorum yine insanın.

**S: Yanlış tıklarsam bir şeyi bozar mıyım?**
Hayır. Analizler kaydedilene kadar denemedir; "Sistem" panosu bozulamaz
(kopyalayıp kendininkini kurarsın). Geri-al/yinele vardır.

---

## 9. Sık sorulanlar — KOMUTAN (karar verici)

**S: Bu bana ne kazandırır?**
Karar hızı. "Sınırda şu an ne var, neyle ilişkili, tehdit seviyesi ne" sorusu
saatlerce analistin elle veri birleştirmesi yerine saniyeler sürer. Farklı
kaynaklar tek resimde; ortak harekât resmi canlı.

**S: Kararı sistem mi veriyor? Sorumluluk kimde?**
Sistem **karar vermez**, veriyi anlaşılır kılar. Her gösterdiği şeyin kaynağı
ve zamanı bellidir; yapay zeka bile yalnız veriyi sunar, hüküm vermez.
Sorumluluk ve yetki komuta zincirinde kalır — sistem onu destekler, yerine
geçmez.

**S: Farklı kaynakların verisini nasıl birleştiriyor (füzyon)?**
Ortak ontoloji sayesinde. Radardan gelen "iz", istihbarattan gelen "rapor",
kayıttaki "platform" ve "birlik" aynı nesne modelinde buluşur; bir düşman izine
tıkladığında onu gören sensörü, sensörün platformunu, platformun birliğini ve
o ize dair istihbarat raporlarını tek zincirde görürsün.

**S: Mevcut sistemlerimle (MIP4, C2) entegre olur mu?**
Evet — bunun için tasarlandı. Veri modeli **NATO MIM (MIP 4)** üzerine kurulu;
gerçek MIP4-IES alışverişi bir "kaynak" olarak eklenir. Yeni bir kaynak =
yeni bir besleme; sistemin geri kalanı değişmez.

**S: Ne kadar güvenli? Veri sızar mı?**
Kapalı ağda çalışır; dış bağımlılık yok (yapay zeka opsiyonel ve kapatılabilir).
Yetkilendirme her istekte; veriye erişim tek kapıdan. Kendi altyapında,
tedarikçi bulutuna veri göndermeden kurulabilir.

**S: Tedarikçiye bağımlı mı olurum (vendor lock-in)?**
Hayır. Tümü açık teknoloji (Postgres, Neo4j, OpenSearch, Redpanda) ve açık
mimari. Palantir gibi kapalı bir platforma değil, sahip olduğun ve
inceleyebildiğin bir yığına bağımlısın.

**S: Kaç kişi kullanabilir, ne kadar veri kaldırır?**
Mimari yatay ölçeklenir: sorgular veritabanına itilir (milyon satır ölçeği
kanıtlı), gözlem geçmişi zaman-serisi veritabanında bölmelenir. Kullanıcı
sayısı sunucu boyutuna bağlıdır; bulut (Cloud Run) otomatik ölçeklenir.

**S: Eğitim ne kadar sürer?**
Amaç "acemi-önce" (novice-first): analist kod/SQL bilmeden, hep select'lerle,
geçersiz durumu üretemeyecek şekilde çalışır. İsteyen doğal dille sorar. Temel
kullanım saatler, ustalık günler mertebesinde.

**S: Test edildi mi, kanıt var mı?**
Evet. İki bağımsız sorgu motoru birbirini doğrular (eşdeğerlik testi "tümü
geçti"); uçtan uca testler, yapay zeka için otomatik "sapma" testleri CI'da.
Canlı ortamda: kaynaklar saniyede onlarca veri akıtırken ekran kendini
tazeliyor, sayılar gerçek zamanlı ilerliyor — bu doküman yazılırken çalışan
sistemde doğrulandı.

**S: Maliyet?**
Lisans maliyeti yok (açık teknoloji). Maliyet = donanım/bulut + geliştirme.
Kapalı ağda kendi sunucunda, bulutta Cloud Run + Cloud SQL ile; ölçeğe göre
büyür/küçülür.

---

## 10. Bilinen sınırlar (dürüstçe)

- **Gerçek veri henüz yok** — kaynaklar sentetik; gerçek besleme entegrasyonu
  ontoloji hazır olduğu için "kaynak ekleme" işidir.
- **Prod'da canlı akış** — Cloud Run stateless olduğundan omurga ayrı VM
  gerektirir (`deploy-backbone.sh` hazır, henüz canlıda koşturulmadı).
- **Gerçek MIM/OWL doğrulayıcı** — mimworld erişimi sonrası eklenecek.
- **Cloud SQL'de TimescaleDB yok** — bulut tarafı düz Postgres (şema guard'ı
  bunu otomatik ele alır, sorgular aynı çalışır; yalnız bölmeleme optimizasyonu
  olmaz).

Bu sınırlar mimariyi değiştirmez; hepsi "kaynak/dağıtım" katmanında, çekirdek
sabit.
