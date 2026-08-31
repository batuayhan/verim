# Yol Haritası

İki repo: `verim-frontend` (React + MUI frontend) ve `verim-server`
(NestJS query servisi). Contract değişiklikleri her zaman iki tarafta
birlikte yapılır (`src/types` ↔ `src/contract`).

## Faz 0 — Temel ✅ (2026-07-02)

- [x] Harman araştırması (doğrulanmış mimari + 24 ürün ekran görüntüsü)
- [x] `BoardConfig` discriminated union, şema propagasyonu, cache-key modeli
- [x] REST contract (`docs/API_CONTRACT.md`) + zod validation
- [x] Redux store (analysisSlice + redux-undo)
- [x] NestJS backend: hexagonal port/adapter, seeded dummy data (3 dataset,
      55.500 satır), 9 board tipini çalıştıran in-memory engine, mini
      expression dili, Swagger, 6 e2e testi

## Faz 1 — Path Editörü İskeleti ✅ (2026-07-02)

- [x] App shell: üst bar, sol ikon rayı, path tab strip (+ yeni path), canvas
- [x] Dataset landing + dataset header kartı (satır/kolon sayısı)
- [x] Dikey board kartı stack'i + ↓ bağlayıcılar + Result kartı
- [x] Board ekleme: kategorili toolbar (Suggested/Filter/Visualize/Join/Transform/Edit
      Columns) + arama modu + iki kart arasında insert-"+"
- [x] TanStack Query entegrasyonu: `buildQueryKey` ile /query, cascade invalidation
- [x] Board kartı ortak chrome'u + footer'da satır/kolon/süre özeti

## Faz 2 — Çekirdek Board'lar ✅ (2026-07-02)

- [x] **Table board**: MUI X DataGrid, satır/kolon/süre rozeti
- [x] **Filter board**: kapalı durumda pill-cümle, açıkken form (tipe göre operatör,
      $param girişi)
- [x] **Chart board**: split yerleşim, Data|Format sekmeleri, bucketing (tarih/sayı),
      Segment by (stacked/grouped), 5 chart tipi, doğrulanmış kategorik palet
- [x] Cascade davranışı: upstream düzenlemesi downstream'i otomatik refetch eder

## Faz 3 — Aggregate Board'ları ✅ (2026-07-02)

- [x] **Histogram board**: yatay barlar, bar seçimi → downstream filtre,
      "Switch to pivoted data", order/sort kontrolleri
- [x] **Expression board**: 4 modlu editör (Library: yakında)
- [x] **Pivot board**: ROWS/COLUMNS/AGGREGATES panelli config, Compute butonu
- [x] Aggregated-mode şema geçişi (downstream formlar yeni şemayı görür)

## Faz 4 — Parametreler & Kalan Board'lar ✅ (2026-07-02)

- [x] Parametre paneli (sol rail): oluştur/sil, Apply/Cancel pending model
- [x] Filtre değerlerinde `$param` (metin girişinde $isim yazarak)
- [x] Enrich / Set math / Edit columns board formları
- [ ] Parametre chip'lerinin otomatik tamamlanması (yakında)

## Faz 5 — Dashboard Modu ✅ (2026-07-02)

- [x] Board'larda "Add to dashboard" (sekme seçimi / yeni sekme)
- [x] Dashboard görünümü: 2 kolonlu grid, widget provenance footer'ı
      (upstream filtre özeti), sekme desteği
- [x] Parametre override + "Overridden" rozeti + reset (yalnızca dashboard
      görünümünde geçerli, analize yazılmaz)
- [x] Chart-to-chart cross-filtering (2026-07-03 — dashboard'da histogram barı sibling widget'ları filtreler)
- [x] Widget sürükle-bırak yeniden sıralama (2026-07-03 — react-grid-layout)

## Faz 6 — Kalıcılık & Gerçek Veri Katmanı ✅/◐ (2026-07-02)

- [x] Analizi kaydet/yükle: `PUT/GET/DELETE /analyses` (dosya-persistent),
      landing'de kayıtlı analiz kartları, üst barda Kaydet + isim düzenleme
- [x] "Save as dataset": `POST /query/materialize` — path sonucu yeni dataset
      olarak kaydedilir, dataset listesine düşer, yeni path kaynağı olur
- [ ] MIP information model adapter'ı — **dış bağımlılık bekliyor**:
      `DATASET_PROVIDER` portu hazır (`add()` dahil), gerçek katman geldiğinde
      yalnızca adapter yazılacak
- [ ] Pushdown değerlendirmesi — MIP adapter'ı ile birlikte ele alınacak
- [x] SPA routing (react-router): `/` ana sayfa (analizler + hızlı başlangıç),
      `/datasets` (şema detaylarıyla), `/analysis/:id` ve `/analysis/:id/dashboard`
      — kayıtlı analiz linki paylaşılabilir

## Sürekli

- README'ler ve API_CONTRACT.md her contract/özellik değişiminde güncellenir
- Her fazın sonunda uçtan uca manuel doğrulama (gerçek istekle)

## Faz 7 — Mercek (Nesne Analizi) ✅ v1 (2026-07-02)

- [x] Backend: ONTOLOGY_PROVIDER portu + dummy ontoloji (Sipariş/Ürün/Müşteri,
      4 yönlü link), recursive ObjectSetDef engine (filter/searchAround/
      fromPrimaryKeys), aggregate + timeseries endpoint'leri, /mercek/analyses CRUD
- [x] Frontend: /mercek rotaları, sürükle-boyutlandır canvas (react-grid-layout v2),
      tipli kartlar + $ değişken çipleri, sol "Analiz içeriği" paneli,
      "kartından devam et" barı, kart türleri: Object Set / Filter (öneri
      dropdown'lı) / Search Around / Chart (bar/pie, segment, drill-down) /
      Metric / Time Series (gün-hafta-ay)
- [x] Graph modu (bağımlılık grafiği görünümü) — 2026-07-03
- [x] Mercek dashboards (publish yüzeyi) — 2026-07-03
- [x] Mercek parametreleri — 2026-07-03
- [ ] Transform table kartı — yakında
- [x] "Join to linked objects" kartı (Mercek paritesi): kümeye geçmek yerine
      mevcut tabloya ilişkili nesnenin kolonlarını satır-bazlı ekler — 2026-07-03

## Faz 8 — Platform, C2 Verisi, Auth, Cloud (2026-07-03)

- [x] Atlas platform hiyerarşisi: '/' launcher, /harman + /mercek eş uygulamalar,
      ortak veri katmanı sayfası, TopNav platform navigasyonu
- [x] Tip-farkındalıklı aggregation kuralları (core/aggregations.ts) — iki
      uygulamanın tüm fn/kolon seçicilerinde yalnızca anlamlı seçenekler
- [x] Mercek canvas: boşluk-doldurma yerleşimi (findFreeSlot), se/e/s resize
      tutamaçları, sürükleme placeholder stili
- [x] Dummy veri All Domain Joint C2'ye geçti: Birlikler/Platformlar/Görevler/
      Sensörler/İzler + 8 yönlü C2 ontolojisi
- [x] Login (hvlamd/hvlamd): backend TokenGuard + /auth/login, frontend login
      sayfası + RequireAuth + bearer token + 401 yönlendirmesi
- [x] Google Cloud Run dağıtımı: tek servis (NestJS API + statik SPA),
      deploy.sh, buildpack konfigürasyonu

## Faz 9 — Roadmap Tamamlama: Parametreler, Join, Graf, Dashboardlar ✅ (2026-07-03)

- [x] **Mercek parametreleri**: sol panelde "Parametreler" bölümü ($isim çipi +
      değer alanı + silme; isim doğrulama), tüm kart sorguları parametre
      bağlamından geçer (MercekParamsProvider), filtre değer önerilerinde
      `$isim` seçenekleri, `$` ile başlayan değerler parameter referansına
      derlenir — değer değişince bağlı tüm kartlar yeniden hesaplanır
- [x] **"İlişkiden kolon ekle" (Join to linked objects)**: ContinueBar'da yeni
      menü; joinLinked kartı kümeyi değiştirmeden hedef tipin kolonlarını
      `Hedef → Kolon` başlığıyla tabloya ekler (satır-bazlı hash join,
      backend ObjectSetEngine + zod + e2e). Kolonlar kart üstünde çoklu
      seçimle değiştirilebilir; eklenen kolonlar alt kartlara akar
- [x] **Mercek graf modu**: Canvas/Graf toggle — kart DAG'ının katmanlı SVG
      görünümü (derinlik sütunları, ok işaretli akış, tıkla-seç)
- [x] **Mercek dashboard modu**: kart başlığında "Dashboard'a ekle",
      `/mercek/:id/dashboard` rotası, salt-okunur widget'lar (tablo/grafik/
      metrik/zaman serisi), üstte parametre barı (değiştir → tüm widget'lar
      yenilenir), RGL sürükle-boyutlandır, yerleşim analizle kaydedilir
- [x] **Harman dashboard yükseltmesi**: widget'lar react-grid-layout üzerinde
      (sürükle/boyutlandır, tab başına kalıcı yerleşim), **çapraz filtreleme**:
      histogram barına tıkla → aynı path'in diğer widget'ları geçici
      `kolon = değer` filtresiyle yeniden hesaplanır (mavi çip + bilgi barı,
      tekrar tıkla/× ile kaldır; analize yazılmaz)
- [x] UX: yarım filtre koşulları (özellik/değer boş) sorguya gönderilmez —
      form doldurulurken hata yerine tam liste görünür
- [x] Doğrulama: server e2e 9/9 (joinLinked dahil), her iki uygulama `tsc -b`
      temiz, tüm yeni akışlar tarayıcıda uçtan uca test edildi

## Faz 10 — MIM Staging + SQL Pushdown ✅ (2026-07-04)

Karar: gerçek MIM (MIP 4, ontoloji tabanlı) erişimi gelene kadar MIM-şekilli
PostgreSQL staging; Cloud Run'da Cloud SQL ile canlı.

- [x] MIM entity izdüşümü şeması (`verim-server/db/schema.sql`):
      ObjectItem / Organisation / Materiel / ActionTask / ReportingData /
      ObjectItemLocation / HostilityStatus / Holding / ObjectItemAssociation
- [x] `db/views.sql`: v_birlik/v_platform/v_gorev/v_sensor/v_iz — apiName'ler
      birebir; Verim MIM tablolarına hiç dokunmaz
- [x] Deterministik seed (`src/mim/seed.ts`): dummy üreticinin çıktısını MIM
      tablolarına ayrıştırır → dummy ↔ mim birebir aynı veri; `IZ_SCALE` ile
      1M+ sentetik iz
- [x] Ontoloji MIM eşlemesinden türetilir (`src/mim/mim-ontology.ts` —
      MimOntologyProvider); her tip/özellik/link MIM kaynağıyla etiketli
- [x] `MimDatasetProvider` (Harman; MIP_SCAN_LIMIT tavanlı) +
      **SqlObjectSetEngine** (Mercek; filter/searchAround/joinLinked/
      aggregate/timeseries tamamen SQL'e itilir — 1M izde ~1sn)
- [x] `DATA_BACKEND=mim` ile tek env'lik geçiş; iki modda aynı contract
- [x] Eşdeğerlik denetimi (`src/mim/equivalence-check.ts`): 17 sorgu
      dummy ↔ mim birebir; e2e 9/9 her iki backend'de

## Faz 11 — Gerçek Zamanlı Sistem, Faz A (Maven-tarzı hedefe ilk adım) ✅ (2026-07-04)

Hedef: veriler sürekli güncellenirken ekranın canlı kalması — ingest deseni
+ gözlem geçmişi + dürüst cache + canlı UI.

- [x] Canlı veri modeli: ReportingData artık gözlem GEÇMİŞİ biriktirir
      (kinematik kolonlar eklendi); ObjectItemLocation/HostilityStatus son
      durumu upsert alır. v_iz = en güncel gözlem (LATERAL, indeksli);
      yeni v_iz_gecmis + `iz_gecmisi` dataset'i (hareket/zaman serisi analizi)
- [x] İz simülatörü (`src/mim/simulator.ts` + compose `simulator` servisi):
      tikte N iz hareket eder (rota/sürat fiziğiyle), yeni izler doğar,
      sınıflandırma kayar — gerçek sistemde yerini MIP4-IES ingest'i alacak
      desenin birebir taklidi (gözlem ekle + son durumu upsert et)
- [x] Watermark versiyonlama: dataset version = seed damgası + son gözlem
      id'si (2sn memo) — veri değiştikçe cache anahtarları dürüstçe döner
- [x] Canlı mod (TopNav'da "Canlı" anahtarı, yanıp sönen nokta): açıkken
      tüm Mercek/Harman sorguları 3sn'de bir tazelenir (LiveModeContext →
      hook'lar refetchInterval'i context'ten okur, sayfa değişikliği yok)
- [x] Doğrulama: e2e 9/9 + eşdeğerlik 17/17 (temiz seed'de); simülatör
      altında ekranda metrik canlı ilerliyor (20.148→20.162, tıklamasız)

## Faz 12 — Gerçek Zamanlı Sistem, Faz B: Mesaj Omurgası + Çok Kaynaklı Ingest ✅ (2026-07-04)

Kaynaklar artık veritabanına DOĞRUDAN yazmaz; her şey omurga üzerinden akar
(gerçek sistemdeki desenin birebir kendisi):

```
source-sensor (JSON) ─┐
source-mip4ies (XML) ─┤─► Redpanda ─► ingest ─► MIM staging ─► app (canlı mod)
yeni kaynak = topic   ┘
```

- [x] Redpanda omurgası (compose servisi; Kafka uyumlu, tek binary —
      kapalı ağa uygun; healthcheck + auto topic)
- [x] Kaynak 1 — sensör ağı simülatörü: kendi filosunu (IZ-A-...) DB'siz
      simüle eder, JSON gözlemleri `verim.gozlemler`e yayınlar
- [x] Kaynak 2 — MIP4-IES simülatörü: IZ-B-... filosunu sadeleştirilmiş
      IES-tarzı XML rapor setleri halinde `verim.mip4ies`e yayınlar
      (gerçek şema gelince yalnızca bu format + parse fonksiyonu uyarlanır)
- [x] Ingest servisi: iki topic'i tüketir, formatları ortak gözleme
      normalize eder; bilinmeyen izi yaratır (`object_item_ingest_seq`),
      gözlemi ekler, son durumu upsert eder — batch'li unnest yazımları
- [x] TrackFleet ortak kütüphanesi (kaynaklar DB'yi bilmez; iz kimlikleri
      kaynak önekli — çakışma imkânsız)
- [x] Doğrulama: iki kaynağın izleri (347 IZ-A + 151 IZ-B, 20sn'de 2110
      gözlem) DB'de ve canlı UI'da; Mercek'te `iz_no startsWith IZ-B-`
      filtresiyle kaynak bazlı analiz çalışıyor

## Faz 13 — Harita (COP) Uygulaması ✅ (2026-07-04)

- [x] Üçüncü eş uygulama `/harita`: MapLibre üzerinde canlı ortak harekât
      resmi — son N dk penceresindeki izler (5/15/60 dk), sınıflandırma
      renkleri + tıklanabilir sayaç filtreleri, nokta popup'ı (kimlik,
      sürat, rota, sensör, son gözlem)
- [x] Sayfa ForceLive ile her zaman canlı (3 sn tazeleme) — omurgadan akan
      izler haritada gerçek zamanlı hareket eder
- [x] Gotcha: rolldown maplibre'nin gömülü worker'ını bozuyor ("gC is not
      defined", GeoJSON katmanı çizilmez) → `setWorkerUrl` + CSP worker asset
- [x] TrackFleet MAX_TRACKS tavanı (uzun koşuda sınırsız filo büyümesi önlendi)

## Faz 14 — Verim Asistanı (AIP karşılığı) ✅ (2026-07-05)

Maven'daki AIP katmanının karşılığı: doğal dille ontoloji sorgulama.

- [x] Backend `/assistant/chat`: ontolojiyi BİLEN LLM (OpenAI tool-calling),
      sorgu motorlarını araç olarak çağırır (nesne_yukle/nesne_grupla/
      zaman_serisi); ürettiği her ObjectSetDef aynı motordan/zod'dan geçer
      → uydurma sorgu güvenle reddedilir, hata LLM'e dönüp kendini düzeltir
- [x] `OBJECT_SET_ENGINE` portu sayesinde asistan da dummy/mim ayrımını
      bilmez — aynı araçlar iki backend'de çalışır
- [x] Anahtar dışarıdan (OPENAI_API_KEY); yoksa `/assistant/status` false
      döner, UI kibarca "devre dışı" der, sistemin geri kalanı etkilenmez
- [x] Frontend `/asistan`: sohbet arayüzü + her cevabın altında KOŞAN
      sorguların şeffaf araç-adım chip'leri (üzerine gelince ObjectSetDef)
- [x] Doğrulandı: "Hava'da kaç platform?" → 96 (DB ile birebir),
      sınıflandırma grupla → 4 grup doğru sıralı, UI uçtan uca

## Faz 15 — Tam Entegrasyon: Asistan Her Yerde + Aksiyonlar ✅ (2026-07-05)

- [x] Global asistan çekmecesi: TopNav'daki Asistan düğmesi her sayfadan
      sağ çekmeceyi açar; sohbet gezinme boyunca yaşar (AsistanProvider),
      /asistan tam sayfası aynı paneli kullanır; istekler aktif sayfayı
      bağlam olarak taşır ("Kullanıcı şu an /harita'da")
- [x] Asistan AKSİYON alır — cevapla birlikte tıklanabilir düğmeler:
      • mercek_analiz_olustur: sade tarif (kümeler=ObjectSetDef + görseller
        + dashboard bayrağı) analysis-builder ile Mercek kart DAG'ına
        derlenir — def'in her düğümü bir kart, kullanıcı açıp elle
        düzenleyebilir (kara kutu değil); zod'dan geçer, kaydedilir,
        "Mercek'te aç" düğmesi döner. Veri harmanlama (joinLinked dahil)
        ve dashboard kurma bu araçla doğal dilden yapılır
      • haritaya_git: "Haritada göster (Düşman, Şüpheli)" düğmesi →
        /harita?sinif=...&pencere=... (harita paramları filtreleri kurar)
- [x] Uçtan uca doğrulandı: "domain dağılımı grafiği + toplam metriği +
      dashboard'lu analiz kur" → 4 kartlı analiz + 2 widget'lı dashboard
      Mercek'te açıldı; "düşman ve şüpheliyi haritada göster" → filtreli
      harita (Dost/Bilinmeyen gizli, pencere 60 dk)
- [x] Gotcha: docker temiz derleme lokal incremental tsc'nin kaçırdığı tip
      hatasını yakaladı (drilldown.sourceCardId) — şüphede `rm -rf dist`

## Faz 16 — Alarm/Kural Motoru ✅ (2026-07-05)

Canlı resmi "operasyonel" yapan katman: koşul sağlanınca sistem HABER VERİR.

- [x] Kural modeli: ObjectSetDef + (ops.) son-N-dk penceresi + sayı eşiği +
      cooldown; değerlendirici 15sn'de bir OBJECT_SET_ENGINE'den koşar
      (dummy/mim bağımsız) — kurallar kalıcı, olaylar bellek-içi halka (500)
- [x] /alerts API (CRUD + events + ack + elle evaluate), TokenGuard'lı
- [x] UI: TopNav zili (okunmamış rozeti, popover onaylama) + /alarmlar
      sayfası (cümle-stili acemi-dostu kural kurucu: sınıf/domain/pencere/
      eşik hepsi select'le)
- [x] Asistan aracı alarm_kurali_olustur: "olursa haber ver" doğal dilden
      kural kurar + "Alarm kurallarını aç" düğmesi
- [x] Uçtan uca: asistanın kurduğu kural 20sn içinde canlı akıştan tetiklendi
      (son 5 dk 507 düşman gözlemi > 50) — zil rozeti + olay listesi doğru

## Faz 17 — Yetenek Sözleşmesi: Asistan Bilgisi Türetilir, Unutulamaz ✅ (2026-07-05)

"Harman/Mercek geliştirilince asistana aktarmak ZORUNLU olsun" isteğinin
mimari cevabı — üç zorlayıcı mekanizma:

- [x] **Derleyici zorunluluğu** (`capabilities/catalog.ts`): yetenek
      katalogları contract union'larına `Record<Union, açıklama>` ile
      bağlı — yeni board/kart/operatör eklenip LLM-yüzlü açıklaması
      yazılmadıkça PROJE DERLENMEZ. Asistanın sistem promptu bu
      kataloglardan + canlı ontoloji/dataset listesinden üretilir;
      elle yazılmış kopya bilgi kalmadı
- [x] **Şema türetme** (`capabilities/tool-schemas.ts`): araç parametre
      şemaları API'nin doğruladığı zod'lardan `z.toJSONSchema` ile üretilir;
      çalışma zamanında AYNI zod girdiyi doğrular → LLM'in gördüğü şema =
      sunucunun doğruladığı şema, props sapması imkânsız
- [x] **Drift testi** (`test/capabilities.e2e-spec.ts`): prompt kapsamı,
      şema üretilebilirliği, araç kümesi, geçersiz girdi reddi — CI'da
- [x] YENİ: harman_analiz_olustur aracı — asistan artık Harman'ın 9 board
      tipini bilir ve board zincirli pipeline kurar (+ harman_ac düğmesi);
      GET /assistant/manifest şeffaflık endpoint'i
- [x] Uçtan uca: "Arızalıları at + domain histogramı + tip bazında ort.
      yakıt chart'ı" → 3 board'lu analiz kusursuz kuruldu (400→366 satır)

## Faz 18 — Asistan Yetenek Keşfi ✅ (2026-07-05)

- [x] TOOL_REGISTRY her araç için kullanıcı-yüzlü title/category/examples
      taşır; /assistant/manifest yapılandırılmış listeyi döner
- [x] UI "Neler yapabilirim?" paneli: giriş yanındaki kitap simgesi + boş
      durumda "Tüm yetenekleri gör" — kategorili araç kartları, tıklanınca
      sohbete giden örnek komutlar; hızlı örnekler de manifest'ten
      (frontend'de elle yazılmış örnek listesi kalmadı — kopya bilgi yok)
- [x] Drift testi: her araç başlık + ≥2 örnekle belgelenmek zorunda

## Faz 19 — Hatalardan Mekanizma: Erken Tespit Katmanı ✅ (2026-07-05)

Kullanıcının yakaladığı gerçek asistan hataları ("saatlik" şema hatası,
objectType='izler' halüsinasyonu) üç KALICI önleme mekanizmasına dönüştü:

- [x] Yetenek kapatıldı: TimeseriesGranularity'ye **hour** (iki motor eş
      formatta) + ontolojiye **iz_gozlem** tipi + 4 link (gözlem GEÇMİŞİ
      artık Mercek/asistan yüzeyinde; dummy'ye eş dataset + dummy≡MIM
      ontoloji parite testi)
- [x] Şema seviyesinde halüsinasyon engeli: `injectRuntimeEnums` — LLM'e
      giden şemalarda objectType/linkType/datasetId çalışma zamanı KAPALI
      LİSTE; `def-lint.ts` — motora gitmeden toplu ön-doğrulama, Levenshtein
      önerili ("izler" → "belki: 'iz'"); motor hataları da geçerli tipleri sayar
- [x] Çalıştırılabilir kanıt: `TOOL_REGISTRY.fixtures` — her örnek komutun
      vaadinin kanıtı; drift testi fikstürleri şemadan geçirip dummy motorda
      KOŞTURUR ("saatlik" vaadi yetenek yokken CI'dan geçemezdi)
- [x] Doğrulama: aynı komut ("Son gözlemlerin saatlik trendini çıkar")
      önce 3 hata adımı üretiyordu → şimdi TEK araç çağrısı, SIFIR hata
      (4273 saatlik nokta). 18/18 test.

## Faz 20 — Dar-Şema Sapması Kapatıldı: Araçlar API'den Türetilir ✅ (2026-07-05)

Kullanıcının yakaladığı ikinci sapma sınıfı: araç şeması motor yeteneğinin
GERİSİNDE (segmentBy motorda vardı, araçta yoktu → LLM isteği sessizce
düşürdü). Yapısal çözüm:

- [x] Sorgu araçları API istek şemalarından türetilir
      (requestSchema.omit(parameters)) — API'ye eklenen alan araca otomatik
      akar, paralel elle-yazım sınıfı öldü
- [x] gorseller tip-ayrımlı KATI şema: grafikte segmentBy var/granularity
      yasak; zaman'da dateProperty+granularity zorunlu (anlamsız
      kombinasyonlar şemada reddedilir)
- [x] segmentBy uçtan uca: araç → lint → analysis-builder chart kartı →
      fikstür kanıtı → drift testi (19/19)
- [x] Canlı: "sınıflandırmaya göre domain segmentli grupla" → tek çağrıda
      siniflandirma × domain, 12 satır

## Faz 21 — Tam Entegrasyon: Inline Paneller, Ana Dashboard, Konum Aksiyonları ✅ (2026-07-05)

"Yapay zekanın yanıtları sistemin diğer araçlarıyla tam entegre çalışmalı;
mercek ayrı harman ayrı değil, ana bir dashboard olmalı" isteği üzerine:

- [x] **Sohbet içi canlı paneller**: sorgu araçlarının sonuçları asistan
      cevabının İÇİNDE tablo/grafik/metrik/zaman paneli olarak render edilir
      (`AssistantPanel` sunucuda üretilir, `PanelView.tsx` çizer). Panel def
      taşır → cevap çıkmaz sokak değil
- [x] **Panelden uygulamaya**: her panelde "Mercek'te aç"
      (POST `/assistant/mercege-ac` — araçla AYNI `createMercekAnalysis`
      yolu, lint dahil); konumlu tabloda satır başına harita pin'i
- [x] **Konum aksiyonu**: `haritaya_git` aracına `merkez{lat,lon,zoom,etiket}`;
      Harita `?lat&lon&zoom&etiket` ile uçarak odaklanır + işaretçi
      ("En son düşman izinin konumunu aç" → tek tık)
- [x] **Ana dashboard (/)**: canlı stat kartları (toplam/düşman iz, son 15dk
      gözlem, bekleyen alarm), sınıflandırma × domain grafiği, 24 saat gözlem
      trendi, son alarmlar, son Harman+Mercek analizleri (birleşik), ortada
      asistan komut kutusu, uygulama kısayolları — ForceLive
- [x] **Navigasyon UX**: TopNav'a Ana Sayfa + Alarmlar; ⌘K/Ctrl+K her yerden
      asistan çekmecesi
- [x] Testler: panel üretimi + merkez aksiyonu + mercege-ac lint yolu
      (22/22); canlı Playwright doğrulaması (dashboard, sohbet içi grafik,
      panel→Mercek kartları, harita odak+işaretçi)

## Faz 22 — Birleşik Dashboard: Her Şey Gadget ✅ (2026-07-05)

"Harman'ın ayrı Mercek'in ayrı dashboard'u olmasın; Jira'daki gibi create
dashboard olsun, her uygulamadan kutucuk eklensin" isteği üzerine platform
TEK dashboard sistemine geçti:

- [x] **Gadget sözleşmesi** (`dashboards/dashboard-schema.ts`): 10 tip —
      stat / grafik / zaman / tablo / harita / alarmlar / analizler /
      asistan / harman_board / mercek_kart. Üyeler TEK listede; asistan
      girdisi (yerleşimsiz) ve doküman (id+yerleşim) aynı listeden türer;
      strict şema + `pencereDk/pencereKolon` canlı penceresi
- [x] **Sanal Sistem dashboard'u**: koddan üretilir, PUT/DELETE reddedilir
      (bozulmaz, "varsayılana dön" bedava) — kullanıcı "Kopyala ve düzenle"
      ile kendininkini yapar; sıfırdan da kurabilir
- [x] `/dashboards` CRUD (AnalysesStore kalıcılığı); `GADGETS` kataloğu
      derleyici-bağlı; asistana `dashboard_olustur` aracı (+dashboard_ac)
- [x] **PanoPage (/)**: dashboard seçici, düzenleme modu (RGL sürükle-bırak,
      gadget kaldır, yeniden adlandır, sil, kaydet), Jira tarzı "Gadget
      ekle" kataloğu — formlar tamamen select-tabanlı (ontolojiden beslenir)
- [x] harman_board/mercek_kart gadget'ları mevcut analizlerin CANLI
      projeksiyonu (BoardBody/MercekWidgetBody yeniden kullanımı)
- [x] Testler 23/23; canlı doğrulama (sistem panosu, kopyala, CRUD reddi)

## Faz 23 — Ontolojik Nesne Detayı: Her Değer Tıklanabilir ✅ (2026-07-05)

"Haritadaki popup verileri ontolojik veri — hepsi tıklanabilir olmalı,
detayın detayının detayını görebileyim; tek seçenek harita olmamalı":

- [x] **NesneDetay çekmecesi** (`src/nesne/NesneDetay.tsx`): global context;
      fromPrimaryKeys ile nesne + TÜM özellikler; ontoloji linklerinden
      searchAround bölümleri (ilişkili nesneler listelenir); başka tipin
      birincil anahtarına denk gelen değerler tıklanabilir çip
      (iz.sensor_no → sensör → platform → ...); breadcrumb yığını ile
      SONSUZ drill; "Mercek'te aç" + konumluysa "Haritada göster"
- [x] Harita iz tıklaması popup yerine detay çekmecesi açar
- [x] Mercek'in her nesne tablosu + asistan panel tabloları: satır → detay
- [x] "Tek seçenek harita değil": stat gadget tıklaması menü
      (Haritada aç / Mercek'te aç); def'li gadget başlıklarında Mercek'te aç
- [x] İşletme sertleşmesi: ingest FK-crash-loop'una kendini-iyileştirme
      (cache tazele + tek retry — DERSLER C7); colima disk sınırı doğrulaması
      (DERSLER C2 güncellendi)

## Prod (Cloud Run) Güncellendi ✅ (2026-07-05)

https://verim-500812633451.europe-west1.run.app — Faz 23 dahil tüm yüzeyler
canlıda: birleşik pano (sanal Sistem), asistan (OPENAI_API_KEY servise env
ile geçer; deploy.sh), alarmlar, harita, nesne detayı. Cloud SQL FORCE_SEED=1
job'ıyla güncel şemaya (gözlem geçmişi + v_iz_gecmis + hour) 1M izle yeniden
seed edildi; saatlik trend 4320 nokta, filtreli sayımlar doğru.

Bilinen sınırlar: (1) f1-micro'da 1M üstü tam-sayım/trend onlarca saniye
(v_iz LATERAL son-gözlem; hız gerekirse tier yükselt); (2) GERÇEK ZAMANLI
akış prod'da YOK — Redpanda omurgası + üreticiler + ingest yalnız lokal
docker'da; prod haritası/canlı pencereler bu yüzden boş kalır (seed
gözlemleri geçmiş tarihli). Omurganın buluta taşınması (GCE VM / GKE)
ayrı bir faz.

## Faz 24 — Zengin Gerçekçi Ontoloji + Personel Nesnesi ✅ (2026-07-05)

"All Domain Joint C2 / Maven Smart System tarzı gerçekçi veri; personel de
ontolojik nesne olsun" isteği:

- [x] **personel** yeni ontolojik nesne (~2.500): personel_no, ad_soyad,
      rütbe (+sayısal seviye), rol, uzmanlık, mensup birlik, görevli platform,
      durum, güvenlik belgesi, tecrübe yılı, uçuş saati. Her birliğe 1 komutan
      + 12-28 kişilik kadro; pilot/operatör rolleri platforma atanır
- [x] 6 yeni ilişki: personel↔birlik (mensubiyet), personel↔platform
      (mürettebat), birlik→komutan, gorev→komutan — graf artık 7 tip / 18 link
- [x] Mevcut tipler zenginleşti: birlik (+komutan, +üs/garnizon), platform
      (+kuyruk no, +üretici), sensor (+üretici, +frekans bandı), gorev
      (+hedef bölge, +komutan) — gerçekçi üretici/rütbe/uzmanlık sözlükleri
- [x] Parite korundu: dummy ontology ≡ MIM ontology (Person entity +
      PersonAssignment eşlemesi); MIM staging (schema/views/seed) person
      tablosu + v_personel + enrich kolonlarıyla senkron; 23/23 test
- [x] izler/iz_gozlem DEĞİŞMEDİ (1M ölçekli, düşük risk); VERSION c2-v2

## Faz 25-28 — Palantir-seviyesi yetenekler ✅ (2026-07-05)

Kullanıcı 4 yetenek ailesini de seçti; sırayla teslim edildi:

- **Faz 25 — Bağlantı Analizi grafiği** (Palantir link-analysis): /graph/neighbors
  (searchAround kompozisyonu); /graf force-directed gezilebilir canvas
  (düğüme tıkla komşuları aç, sürükle sabitle, renk-kodlu tipler); NesneDetay
  "Grafta aç"; asistan graf_ac aracı.
- **Faz 26 — Harita katmanları** (Maven COP): ısı haritası (heatmap), iz izleri
  (trails — gözlem geçmişinden LineString), katman kontrol paneli.
- **Faz 27 — Yeni gadget tipleri**: liste (leaderboard), pivot (özet matris),
  dağılım (scatter) — mevcut motoru yeniden kullanır; GADGETS kataloğu +
  select-tabanlı formlar; asistan dashboard_olustur bunları da kurar.
- **Faz 28 — AIP asistan**: nesne_incele (bir nesneyi tüm ilişkileriyle
  inceleyip istihbarat brifingi + graf düğmesi); analitik sistem promptu
  (proaktif, açıkla/karşılaştır/aykırı-değer-bildir).

Her yenilik capability contract'tan geçti (katalog + araç + fikstür + drift
23/23), yani asistan da otomatik kullanabiliyor.

## Faz 29 — Pano Çapraz Filtreleme ✅ (2026-07-05)
Bir gadget'ta değere tıkla (grafik bar / liste satır / pivot başlık) → uygun
tüm gadget'lar süzülür (caprazFiltre.tsx + useCaprazDef; kolonu olmayan ve
harita/alarm/asistan etkilenmez); aktif filtre şeridi + temizle.

## Faz 30 — İndeksli Bağlantı Deposu: GERÇEK Graf DB (Neo4j) ✅ (2026-07-05)
"Bellek-içi dummy değil, gerçek servis" — GRAPH_PROVIDER portu:
- **Neo4j** docker compose'a eklendi (graphdb servisi + graphdata volume);
  varlık ağı (düğüm+kenar) graph-load servisiyle yüklenir; app Cypher ile
  sorgular (Neo4jGraphProvider). Bağlantı grafı artık tarama değil, gerçek
  graf DB indeks-araması.
- İz/gözlem telemetrisi (milyonlar, ingest'le akan) graf DB'de değil —
  zaman-serisi deposundan (Postgres/motor) çözülür (gerçek mimari ayrımı).
- Dummy backend (docker'sız dev) için bellek-içi adjacency fallback'i kalır.
- Önce /graph/edges N-searchAround (10+sn) → pk-lookup+key-join (24ms) →
  şimdi Neo4j Cypher (indeksli).

## Faz 31 — Multi-INT İstihbarat Akışı + Ontoloji Genişletme ✅ (2026-07-05)

"Saniyede onlarca istihbarat verisi akıtan ayrı bir profesyonel servis;
biz ona sub olalım, tüketelim; ontolojiyi yeni veri çeşitleriyle genişlet."

- [x] **source-intel** docker servisi: SIGINT/IMINT/OSINT/HUMINT raporlarını
      `verim.istihbarat`e ~25 rapor/sn yayınlar; gözlem omurgasına SUB olup
      SIGINT/IMINT'i GERÇEK izlere korelasyonlar (çok kaynaklı füzyon)
- [x] `intel-feed.ts` tek besteci (dummy seed + canlı akış aynı kompozisyon);
      STANAG 2511 kaynak güvenilirliği A–F / bilgi doğruluğu 1–6
- [x] Ingest intel topic tüketimi + değer-bazlı yazım + retention (48s);
      schema `intel_report` + `v_istihbarat`; ontolojiye `istihbarat_raporu`
      tipi + `rapor-iz`/`iz-raporlar` (değer-bazlı) linkleri
- [x] Mercek/graf/asistan/arama tipi ontolojiden OTOMATİK kazanır (kopya yok)
- [x] Doğrulama: dummy≡MIM eşdeğerlik (SIGINT filtresi/tür-agg/searchAround),
      canlı akış (1500→2319+, %34 ize korelasyon)

## Faz 31b — Graf balon gruplama + Harita katmanları ✅ (2026-07-05)

- [x] Graf: >5 komşulu ilişki tek balonda toplanır (N sayısıyla), tıkla →
      üyeler açılır (Palantir aggregation)
- [x] Harita: istihbarat raporu katmanı (INT disiplinine göre renkli), sensör
      menzil halkaları (joinLinked platform konumu + menzil_km daire), AOI
      dikdörtgeni (sürükle-çiz → kutu içi iz sayımı/kırpma)

## Faz 32 — TimescaleDB Hypertable ✅ (2026-07-05)

- [x] compose db → `timescale/timescaledb` (Postgres superset, drop-in);
      `reporting_data` (gözlem geçmişi) hypertable'a dönüşür (schema guard
      extension'ı algılar; yoksa plain PG/Cloud SQL'de düz tablo — aynı sorgular)
- [x] PK kompozit (reporting_datetime dahil — hypertable zorunluluğu); canlı
      181 chunk; ingest'e deadlock (40P01) self-heal

## Faz 33 — Alarm Bildirim Kanalları ✅ (2026-07-05)

- [x] AlertNotifier: webhook (HER ZAMAN gerçek — Slack/Teams/Mattermost JSON
      POST) + e-posta (nodemailer + SMTP_URL; yoksa kanal kibarca devre dışı)
- [x] AlertRule.channels + zod doğrulaması; /alerts/channels; kural kurucuda
      kanal alanları (SMTP yoksa e-posta disabled)

## Faz 34 — OpenSearch Global Arama ✅ (2026-07-05)

- [x] SEARCH_PROVIDER portu; gerçek OpenSearch servisi + `search-load` yükleyici
      (varlık nesnelerini indeksler — 18003 doküman); /search fuzzy tam-metin;
      InMemorySearchProvider yalnız docker'sız dev fallback'i
- [x] TopNav global arama kutusu → sonuç seçilince NesneDetay (sonsuz drill)

## Faz 35 — Harman Tam SQL Pushdown ✅ (2026-07-05)

- [x] SqlPushdownQueryEngine: filtre önekini SQL WHERE'e iter (1M+ taramak
      yerine eşleşenleri getirir), kalanı InMemoryQueryEngine'in doğrulanmış
      mantığıyla işler → sonuç birebir (eşdeğerlik: filter/histogram/editColumns
      + keep/remove); türev dataset'ler in-memory'ye düşer

## Faz 36 — Bulut Omurgası ✅ (2026-07-05, script hazır)

- [x] `docker-compose.backbone.yml` + `deploy-backbone.sh`: GCE VM'de
      Redpanda + kaynaklar + ingest → cloud-sql-proxy ile Cloud SQL'e yazar →
      prod (Cloud Run) haritası/canlı pencereleri dolar. (Çalıştırma gcloud
      auth gerektirir — script + talimat hazır.)

### Kalan
- [ ] Gerçek MIM bağlantısı (mimworld erişimi sonrası OWL doğrulayıcı)
- [ ] `deploy-backbone.sh`'ı canlı prod'da koştur (gcloud auth gerektirir)
## Ontoloji Yönetimi Programı ✅ (2026-07-06, Sprint 1-5)

Karar: [KARAR_TRIPLE_VS_ILISKISEL.md](KARAR_TRIPLE_VS_ILISKISEL.md) ·
plan: [SPRINT_ONTOLOJI_YONETIMI.md](SPRINT_ONTOLOJI_YONETIMI.md)

- [x] **S1** OWL/Turtle export (`GET /ontology.ttl`, kayıpsız + verim: bağlama
      annotation) + Ontoloji Gezgini (`/ontoloji`)
- [x] **S2** İki katmanlı model: CompositeOntologyProvider (çekirdek ⊕ uzantı;
      ONTOLOGY_EXTENSIONS bayrağı, kapalı=bit-değişmez) + sürümlü değişmez depo
- [x] **S3** Kabul hattı kademe 1-3 (sözdizimi / bağlama-information_schema /
      gerçek-motor smoke) + `/ontology/extensions/validate` + CLI
- [x] **S4** Kademe 4 etki analizi (referanslı-silme reddi) + kademe 5 yönetişim
      (rol tabanlı auth, dört-göz onay, denetim izi, rollback)
- [x] **S5** OWL/Turtle import + Yönetim UI (`/ontoloji/yonetim`) + asistan
      senkron kanıtı; uçtan uca tatbikat (tesis.ttl → onay → aktif → Mercek'te
      120 kayıt → rollback), 52/52 e2e

### Kalan
- [ ] Gerçek MIM bağlantısı (mimworld erişimi; import hattı hazır)
- [ ] `deploy-backbone.sh`'ı canlı prod'da koştur (gcloud auth)
