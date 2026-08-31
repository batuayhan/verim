# Verim — Proje Dersleri

Bu doküman, projenin kuruluşundan bu yana **gerçekten yaşanmış** hatalardan
çıkan dersleri toplar. Her ders üç parça: *ne oldu*, *çıkan ders* ve —
en önemlisi — *bu dersi bir daha yaşanmaz kılan mekanizma*. Yazılı kural
unutulur; derleyici, test ve süreç unutmaz. Yeni bir ders çıktığında bu
dosyaya **mekanizmasıyla birlikte** eklenir; mekanizmasız ders eksik sayılır.

---

## A. Asistan ↔ Sistem Entegrasyonu (en kritik sınıf)

### A1. Kopya bilgi her zaman eskir
- **Olay:** Asistanın sistem promptu ve araç şemaları elle yazılmıştı;
  sistem geliştikçe asistanın bilgisi sessizce geride kalma riski taşıyordu.
- **Ders:** Bir bilginin iki yerde el ile tutulan kopyası varsa, biri
  mutlaka eskir. Çözüm kopyayı senkronlamak değil, **kopyayı yok etmek**:
  tek doğruluk kaynağından türet.
- **Mekanizma:** `capabilities/catalog.ts` — yetenek katalogları contract
  union'larına `Record<Union, açıklama>` ile bağlı: Harman'a yeni board,
  Mercek'e yeni kart eklenip açıklaması yazılmazsa **proje derlenmez**.
  Sistem promptu bu kataloglardan + canlı ontoloji/dataset listesinden üretilir.

### A2. Örnekler yetenekten fazlasını vaat edebilir
- **Olay:** "Son gözlemlerin *saatlik* trendini çıkar" örneğini biz yazdık;
  sistemde saat granülaritesi yoktu. Kullanıcı tıkladı, asistan şema
  hatasına çarpıp yanlış (günlük) cevap verdi.
- **Ders:** Kullanıcıya gösterilen her örnek bir **vaattir**; vaat edilen
  yetenek kanıtlanmadıkça örnek yayınlanamaz.
- **Mekanizma:** `TOOL_REGISTRY.fixtures` — her aracın örneklerinin
  vaadini temsil eden çalıştırılabilir girdiler; drift testi
  (`test/capabilities.e2e-spec.ts`) fikstürleri şemadan geçirir ve
  **dummy motorda gerçekten koşturur**. "Saatlik" vaadi, yetenek eklenmeden
  CI'dan geçemezdi.

### A3. Araç şeması motorun yeteneğinin GERİSİNDE kalabilir
- **Olay:** "Sınıflandırmaya göre domain ile segmentleyerek grupla" isteği:
  `segmentBy` motorda ve Mercek kartında vardı ama araç şemasında yoktu.
  LLM ifade edemediği isteği **sessizce düşürüp** "yaptım" dedi.
- **Ders:** Elle yazılan araç şeması, API'nin alt kümesi olmaya mahkûmdur;
  sessiz düşürme en sinsi hata türüdür (hata mesajı bile yoktur).
- **Mekanizma:** Sorgu araçları API istek şemalarından **türetilir**:
  `nesneGruplaInput = aggregateRequestSchema.omit({parameters})`. API'ye
  eklenen alan araca otomatik akar. Prensip: **asistan aracı için asla
  paralel şema yazma — API'den türet.**

### A4. LLM serbest-metin alanlarında halüsinasyon yapar
- **Olay:** Asistan `objectType: "izler"` ve `"iz_gecmisi"` üretti (dataset
  kimliğini tip adı sandı); üç tur hata yiyip pes etti.
- **Ders:** LLM'e "string" alanı vermek, ona uydurma daveti çıkarmaktır.
  Kapalı liste verilebilen her alan kapalı liste olmalı.
- **Mekanizma:** `injectRuntimeEnums` — LLM'e gösterilen JSON şemalarda
  objectType/linkType/datasetId **çalışma zamanı enum'u** (ontoloji ve
  dataset listesinden). Halüsinasyon şema seviyesinde engellenir.

### A5. Motor ilk hatada durur; LLM tur israf eder
- **Olay:** Her yanlış def bir tur yaktı; LLM üç turda hâlâ düzelememişti.
- **Ders:** Makine-istemciye (LLM) hata verirken **tüm sorunları birden,
  önerilerle** ver ki tek denemede düzeltsin.
- **Mekanizma:** `capabilities/def-lint.ts` — motora gitmeden toplu
  ön-doğrulama, Levenshtein önerili ("`izler` bilinmiyor — belki: `iz`?");
  motor hataları da geçerli değerleri sayar.

### A6. Gevşek şema anlamsız kombinasyona izin verir
- **Olay:** LLM bar grafiğe `granularity: "day"` yazabildi (anlamsız ama
  şema kabul etti).
- **Ders:** "Hepsi opsiyonel düz nesne" şeması, geçersiz durumların
  temsil edilebilmesi demektir. Geçersiz durum **temsil edilemez** olmalı.
- **Mekanizma:** `gorseller` tip-ayrımlı **strict** union: grafikte
  segmentBy var/granularity yasak; zaman serisinde dateProperty+granularity
  zorunlu. Zod `discriminatedUnion` + `.strict()`.

### A7. UI'daki örnek/yetenek listeleri de kopya bilgidir
- **Olay:** Frontend'de elle yazılmış örnek komut listesi vardı — A1'in
  aynısı, sadece başka katmanda.
- **Ders:** Kopya bilgi kuralı katman tanımaz.
- **Mekanizma:** "Neler yapabilirim?" paneli ve hızlı örnekler
  `/assistant/manifest`'ten (kayıt defterinin kendisinden) gelir; drift
  testi her araca başlık + ≥2 örnek zorlar.

### A8. LLM'in kurduğu şey kara kutu olmamalı
- **Ders:** Asistan analiz kurduğunda çıktı, kullanıcının açıp
  anlayabileceği ve **elle düzenleyebileceği** normal bir ürün olmalı.
- **Mekanizma:** `analysis-builder.ts` def'in her düğümünü ayrı bir Mercek
  kartına açar; her cevabın altında koşan sorguların şeffaf adım chip'leri
  gösterilir (hover → üretilen def).

---

## B. Derleme ve Doğrulama Süreci

### B1. Kökten `npx tsc --noEmit` HİÇBİR ŞEYİ kontrol etmez
- **Olay:** verim-frontend kökündeki tsconfig yalnızca project reference
  içerir; `tsc --noEmit` sessizce başarılı olur. "legendFor is not defined"
  çalışma zamanı hatası buradan sızdı.
- **Kural:** Tip kontrolü = `tsc -b` / `npm run build`. Asla çıplak
  `tsc --noEmit`.

### B2. Incremental build tip hatalarını KAÇIRIR (üç kez yaşandı)
- **Olay:** Nest'in artımlı derlemesi `drilldown.sourceCardId` ve
  `BuildGorsel.granularity` hatalarını yuttu; bozuk kod ancak Docker'ın
  temiz derlemesinde patladı — bir keresinde bozuk imaj sessizce çalıştı.
- **Kural:** Şüphede ve her teslim öncesi: `rm -rf dist && npm run build`.
  Docker'ın sıfırdan derlemesi son bekçidir; onun hatası "gürültü" değil
  **gerçektir**.

### B3. Kabuk boruları hata yutar
- **Olay:** `grep -cE error` eşleşme yokken "0" basar ama **exit 1** döner
  (&& zincirini kırar); `komut | tail -1` ise pipeline exit'ini maskeler —
  başarısız docker build "tamamlandı" göründü.
- **Kural:** Doğrulama adımları ön planda, çıktısı gözle/açık asert ile
  denetlenerek koşar. Bir build'in başarısı "tail'in son satırı"ndan değil,
  imaj zaman damgası + container içinde kod kontrolüyle teyit edilir
  (`docker compose exec app grep -c <yeni-sembol> dist/...`).

### B4. Scriptli düzenlemede sessiz no-match felakettir
- **Olay:** Python `str.replace()` eşleşmeyince hiçbir şey yapmadan başarı
  bildirir; bir kez ServeStatic düzenlemesini sessizce yutmuştu.
- **Kural:** Her scriptli düzenlemede `assert old in text`. İstisnasız.

### B5. Testler davranışı, eşdeğerlik testleri BACKEND'LERİ korur
- **Ders:** İki veri backend'i (dummy/MIM) aynı contract'ı sunuyorsa bu
  iddia test edilmeli: aynı sorgular iki motorda birebir aynı sonucu
  vermeli; iki ontoloji provider'ı birebir aynı yanıtı dönmeli.
- **Mekanizma:** `src/mim/equivalence-check.ts` (17 sorgu, dummy↔MIM) +
  parite testi (`dummy ≡ MIM ontoloji`, capabilities spec içinde).

---

## C. Ortam ve İşletme

### C1. Arka plan görevleri ve cwd tuzağı (dört kez ısırdı)
- **Olay:** Arka plan kabukları ana kabuğun cwd'sini miras alır ama onu
  değiştirmez; bileşik komutlarda ikinci `git commit` yanlış repoya gitti,
  compose yanlış dizinden koşup "No configuration file" verdi — bir
  keresinde bu, eski imajın sessizce çalışmasına yol açtı.
- **Kural:** compose daima mutlak yolla:
  `docker compose -f <mutlak>/docker-compose.yml --project-directory <mutlak>`.
  Her `git commit`ten önce `pwd` doğrula; iki repoya commit tek komutta
  yapılacaksa her birinin önünde açık `cd`.

### C2. Disk dolarsa HER ŞEY durur
- **Olay:** Colima VM dosyası tekrarlı imaj derlemeleriyle büyüdü; disk
  dolunca containerd bozuldu (I/O error, app 500), ardından ENOSPC kabuk
  çıktısı bile yazılamaz hale getirdi — oturum kilitlendi.
- **Kural:** VM disk tavanı ver (`colima start --disk 25`); tekrarlı imaj
  derlemelerinde `docker image prune`/`builder prune` alışkanlığı;
  containerd bozulursa ilk hamle `colima restart` (adlı volume'lar restartta
  korunur, `colima delete`te silinir — buradaki her veri seed'den yeniden
  üretilebilir olduğu için delete güvenlidir).
- **İkinci olay (05.07, ders ağırlaştı):** `--disk 25` sınırı KALICI
  ÇIKMADI — sonraki bir başlatmada VM 100G'lık diskle dönmüş, imaj dosyası
  ana diski SIFIRA indirdi. ENOSPC'de yalnız kabuk değil, HER araç ölür
  (Write tmp dosyası, görev-kilidi dahil) — oturum tamamen çaresizdir,
  tek çıkış kullanıcının elle yer açması. Üstüne `colima delete -f` bozuk
  VM'de sessizce başarısız olabiliyor: 31G'lık imaj yerinde kaldı; çözüm
  süreçleri öldürüp `rm -rf ~/.colima ~/.lima` (+ `~/Library/Caches/lima`).
- **Mekanizma:** (1) Her `colima start` sonrası sınır DOĞRULANIR:
  `colima ssh -- df -h /var/lib/docker` beklenen tavanı göstermeli;
  (2) her imaj-rebuild seansı `docker system df` kontrolü + gerekirse
  `builder prune` ile kapanır; (3) ana diskte boş alan birkaç GB'a inerse
  önce disk, sonra iş — ENOSPC sonrası hiçbir araç çalışmaz.

### C7. İkinci doğruluk kaynağı (bellek-içi kimlik cache'i) DB'yle ayrışır
- **Olay (05.07):** Ingest'in açılışta ısıttığı iz_no→object_item_id
  cache'i, DB altından sıfırlanınca (kök neden C8: seed'in yeniden koşması)
  FANTOM id'ler taşımaya başladı → her reporting_data insert'i FK ihlali →
  consumer 30 sn'de bir çöküp aynı batch'e dönen sonsuz crash-loop.
  (İlk teşhis "Postgres eski duruma döndü" idi — yanlıştı; ders yine de
  geçerli: cache'in DB'yle AYRIŞABİLECEĞİ her senaryo aynı belirtiyi verir.)
- **Ders:** Süreç-içi kimlik cache'i, DB'nin yanında ikinci bir doğruluk
  kaynağıdır; DB altından değişince cache sessizce yalan söyler. Cache
  kullanan her yazıcı, "cache yalan söylüyor olabilir" hatasını (FK ihlali)
  bir SENKRONİZASYON sinyali olarak ele almalıdır.
- **Mekanizma:** `ingest-service.ts` — cache ısıtma `warmCaches()` olarak
  tazelenebilir; batch yazımı 23503 (FK ihlali) yakalarsa cache'i DB'den
  tazeleyip AYNI batch'i bir kez daha dener; ikinci deneme de düşerse çöker
  (gerçek veri hatası maskelenmez). Mekanizma canlıda kendini kanıtladı.

### C8. "Tek seferlik" seed, compose'da tek seferlik DEĞİLDİR
- **Olay (05.07, iki krizle):** app servisi `depends_on: seed
  (service_completed_successfully)` taşıyor; her `docker compose up -d app`
  çağrısı Exited durumdaki seed'i YENİDEN koşturuyor. schema.sql DROP ile
  başladığından her yeniden koşum canlı DB'yi sıfırlayıp ingest'in yazdığı
  her şeyi sildi: haritalar boşaldı ("veriler silindi mi?"), ingest cache'i
  fantomlaştı (C7), kullanıcı "sistem bozuldu" gördü. İmaj güncellemek için
  yapılan her app restart'ı sessiz bir veri sıfırlamasıydı.
- **Ders:** Yıkıcı bir betiğin "bir kez koşacağı" varsayımı orkestratöre
  bırakılamaz — betik KENDİSİ idempotent olmak zorundadır.
- **Mekanizma:** `src/mim/seed.ts` — veri varsa (`object_item` TRACK
  sayısı > 0) hiçbir şey yapmadan çıkar; bilinçli sıfırlama yalnız
  `FORCE_SEED=1` ile. Drift değil davranış koruması: app restart'ı artık
  veri kaybettiremez.

### C9. `docker compose build <servis>` — build YALNIZCA `build:` olan serviste
- **Olay (05.07, saatler kaybettirdi):** `build:` bloğu `seed` servisinde;
  `app` yalnız `image: verim-app` referanslıyor. `docker compose build app`
  ve hatta `build --no-cache app` **hiçbir şey yapmadı** (app'in build'i yok),
  imaj eski kaldı — "değişikliğim neden görünmüyor?" birkaç tur döndürdü.
- **Ders:** Çok servis aynı `image:`'ı paylaşırken build'i **hangi servisin
  taşıdığını** doğrula (`grep -nA2 'build:' docker-compose.yml`); o servisi
  build et. Doğrulama: imaj taze mi? `docker run --rm --entrypoint sh <img>
  -c "grep -c <yeni-sembol> dist/..."`.

### C10. colima/BuildKit cache eski kaynağı alabilir → kritik derlemede --no-cache
- **Olay:** Kaynak değişmesine rağmen `docker compose build` COPY/RUN
  katmanını cache'ten aldı; imaj yeni kodu içermedi (grep = 0). Virtiofs
  bind mount mtime tuhaflığı şüphesi.
- **Ders:** "İmaj neden eski?" sorusunda vakit kaybetmeden **`--no-cache`**;
  ve her kritik teslimde imajı doğrudan doğrula (C9'daki grep). Cache'e
  körü körüne güvenme.

### C11. TimescaleDB hypertable: çoklu DROP yasak + eşzamanlı insert deadlock
- **Olay:** `reporting_data` hypertable'a dönünce `DROP TABLE meta,
  reporting_data, ...` **"cannot drop a hypertable along with other objects"**
  ile patladı → `FORCE_SEED` çalışmadı. Ayrıca yeni chunk'ın FK-kısıt oluşumu
  eşzamanlı çok kaynaklı insert'lerle **deadlock (40P01)** verdi.
- **Ders:** (1) Hypertable'ı **ayrı** DROP et (`DROP TABLE IF EXISTS
  reporting_data CASCADE;` kendi başına). (2) PK bölmeleme kolonunu içermeli
  (`PRIMARY KEY (reporting_datetime, reporting_data_id)`). (3) Ingest'e
  deadlock self-heal (40P01 → kısa bekle + yeniden dene; upsert'ler idempotent).
- **Genel kural:** Bir bileşeni "drop-in" sandığın imaj değişimi (postgres →
  timescaledb) çoğu şeyi aynı bırakır ama DDL/kilit semantiğini değiştirir;
  şema betiğini ve yazma yolunu yeni semantiğe göre test et.

### C3. Dev sunucusunda çekirdek dosya düzenlemek full reload tetikler
- **Olay:** Vite HMR, bileşen-dışı bir .ts dosyası değişince tam sayfa
  yeniler; kaydedilmemiş Redux state (kaydedilmemiş analiz) kayboldu.
- **Kural:** Elle test senaryolarını UI tıklamalarıyla değil **API ile
  kur** (deterministik, tekrarlanabilir) ya da erken kaydet.

### C4. Bulut çalışma ortamı kalıcı değildir
- **Olay:** Cloud Run'ın geçici dosya sistemi, kayıtlı analizleri
  redeploy'da sildi; bayat `index.html` eski bundle isteyip uygulamayı
  açılmaz yaptı.
- **Kural:** Kalıcılık daima dışarıda (GCS/DB). `index.html` no-cache,
  hash'li asset'ler immutable.

### C5. Platform tuhaflıkları not edilmeli
- Buildpack imajında özel komut: `--command /cnb/lifecycle/launcher
  --args node,<script>` (düz `--command node` "Application exec likely
  failed" verir).
- Compose'da `build:` anahtarı tek servisteyse `docker compose build`
  **servissiz** çağrılır (`build app` → "No services to build").
- rolldown, maplibre'nin gömülü worker'ını bozar ("gC is not defined",
  GeoJSON katmanı çizilmez) → `setWorkerUrl` + CSP worker asset'i.
- faker v10 ESM-only'dir, jest'i kırar → v9.
- MUI v7 system prop'ları Stack/Typography'den kaldırdı → hepsi `sx`'e
  (`ListItemText` `primaryTypographyProps` da gitti → `slotProps.primary`).

### C6. `source dosya.env` değişkeni EXPORT etmez — sır sessizce kaybolur
- **Olay (Faz 21):** `source openai.env` sonrası `docker compose up -d app`
  container'ı yeniden oluşturdu; dosyada `export` olmadığı için değişken alt
  sürece geçmedi. Uygulama hatasız açıldı ama asistan "OPENAI_API_KEY
  tanımlı değil" ile sessizce devre dışıydı — kayıp ancak canlı istekte
  görüldü.
- **Ders:** Ortamdan geçen sır, "container ayakta" doğrulamasıyla
  doğrulanmış sayılmaz; özelliğin kendisi sorgulanmalı.
- **Mekanizma:** (1) env dosyaları `set -a; source …; set +a` ile yüklenir
  (ya da dosyaya `export` yazılır); (2) compose sonrası sırra bağlı her
  özelliğin durum ucu curl'lenir — asistan için `GET /assistant/status` →
  `{"available":true}` görülmeden doğrulama bitmiş sayılmaz.

---

## D. Mimari Kararların Doğrulanan Dersleri

### D1. Port/adapter (hexagonal) yatırımı kendini defalarca ödedi
- Dummy→MIM staging→SQL pushdown→asistan araçları→alarm motoru: hiçbiri
  contract'a veya frontend'e dokunmadı. Yeni yetenek eklerken ilk soru:
  "hangi portun arkasına giriyor?"

### D2. Federasyon yerine ingest'te merkezileş (Palantir/Maven dersi)
- Kaynaklar veritabanını **bilmez**; omurgaya (Redpanda) yayınlar. DB'ye
  yazan tek bileşen ingest'tir. Yeni gerçek kaynak = yeni topic + parse
  fonksiyonu; sistemin geri kalanı değişmez. ("Zero-copy" pazarlama dili;
  gerçek desen: tek nüshaya senkronla, kopyayı çoğaltma.)

### D3. Canlı veride dürüst cache = watermark versiyonlama
- `datasetVersion = seed-damgası # son-gözlem-id` — veri aktıkça sürüm
  ilerler, önbellek anahtarları kendiliğinden döner. "Veri değişti ama
  ekran eski" durumu yapısal olarak imkânsız.

### D4. Model ≠ veri (MIM dersi)
- MIM kurulmaz; edinilir ve incelenir. Staging'de MIM **entity izdüşümü** +
  `v_*` view eşleme katmanı tutmak, gerçek MIP4-IES geldiğinde geçişi
  "views.sql'i uyarla" boyutuna indirir. Ontoloji tanımı koddan değil
  **eşlemeden türetilir** (Palantir'in küratörlü ontoloji deseniyle aynı).

### D5. Acemi-dostu UX = hatayı sonradan yakalama değil, önceden imkânsız kılma
- Select > serbest metin; tip-farkındalıklı agregasyon kuralları; yarım
  form durumları sorguya gönderilmez; cümle-stili kural kurucular.
  Bu ilke A4/A6'daki LLM şema derslerinin insan-yüzlü ikizidir: **geçersiz
  girdi, insan için de makine için de temsil edilemez olmalı.**

---

## Yeni ders eklerken şablon

```
### Xn. Kısa başlık
- **Olay:** Gerçekte ne yaşandı (tarih/komut/hata mesajıyla).
- **Ders:** Genelleştirilmiş ilke.
- **Mekanizma:** Bu dersi zorlayan derleyici kuralı / test / süreç kuralı
  ve DOSYA ADRESİ. Mekanizması olmayan ders, tekrarlanmayı bekleyen olaydır.
```
