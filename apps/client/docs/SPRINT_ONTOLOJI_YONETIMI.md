# Sprint Planı — Ontoloji Yönetimi Programı

Kapsam: [KARAR_TRIPLE_VS_ILISKISEL.md](KARAR_TRIPLE_VS_ILISKISEL.md) K3
kararının uygulanması — **OWL uyumlu ontoloji** (dışa aktarım → iki katmanlı
model → 5 kademeli kabul hattı → yönetişim → içe aktarım + UI) ve önceki
tartışmada belirlenen ilkeler:

- **"Derlenmez" → "yüklenmez":** bugün derleyici+drift testinin verdiği
  güvence, yükleme-anı kabul hattına taşınır — ve etki analiziyle bugünkünden
  **daha güçlü** hâle gelir.
- **İki katman:** çekirdek MIM ontolojisi (iz/sensör/platform/…) **kodda
  kalır** (derleyici+drift korumalı); dosyadan yalnız **uzantılar** yüklenir,
  uzantı çekirdeği yeniden tanımlayamaz.
- **Davranışlar kodda kalır:** capability katalogu (board/kart/araç türleri)
  taşınmaz; dosyaya taşınan yalnız **alan modeli**dir.
- Asistan senkronu bedava: enum'lar canlı ontolojiden (`injectRuntimeEnums`),
  araç şemaları zod'dan türediği için ontoloji değişince asistan otomatik izler.

Varsayımlar: 1 geliştirici + AI eşli; sprint = ~1 hafta etkin iş; mevcut test
altyapısı (e2e + drift + eşdeğerlik) korunur ve genişletilir.

---

## Sprint 1 — OWL Dışa Aktarım + Ontoloji Gezgini *(risk: sıfır — hemen başlanabilir)*

**Amaç:** Mevcut ontolojiyi standart formatta dünyaya açmak (birlikte
çalışabilirlik kanıtı) ve insanlara göstermek. Hiçbir davranış değişmez.

| # | Görev | Dosya/Konum |
|---|---|---|
| 1.1 | `OntologyResponse → Turtle` serileştirici. Eşleme: objectType→`owl:Class` (rdfs:label=displayName), özellik→`owl:DatatypeProperty` (domain=tip, range=xsd karşılığı: string→`xsd:string`, integer→`xsd:integer`, double→`xsd:double`, timestamp→`xsd:dateTime`, date→`xsd:date`, boolean→`xsd:boolean`), link→`owl:ObjectProperty` (domain/range; cardinality `one`→`owl:FunctionalProperty`). **Bağlama annotation'ları** (OWL'un taşımadığı bilgi): `verim:datasetId`, `verim:primaryKey`, `verim:fromKey`, `verim:toKey`, `verim:icon`; MIM izlenebilirliği: `verim:mimKaynak` (MIM_MODEL etiketlerinden). Base URI konfigürable (kapalı ağ): `ONTOLOGY_BASE_URI`, vars. `https://verim.local/ontoloji#`. | `verim-server/src/ontology/owl-export.ts` |
| 1.2 | `GET /ontology.ttl` ucu (+`?format=jsonld` opsiyonel). TokenGuard'lı. | `ontology.controller.ts` |
| 1.3 | Round-trip testi: export → `n3` ile parse → sınıf/özellik/link sayıları canlı ontolojiyle birebir; her tipin `verim:datasetId`'si var. | `test/owl-export.e2e-spec.ts` |
| 1.4 | **Ontoloji Gezgini** sayfası `/ontoloji`: tip kartları (ikon+özellik tablosu), ilişki listesi (from→to, kardinalite), MIM kaynak rozetleri, "TTL indir" düğmesi. Veri mevcut `GET /ontology`'den. TopNav'a link. | `verim-frontend/src/ontoloji/OntolojiPage.tsx` |
| 1.5 | Dokümantasyon: MIMARI §5'e Gezgin, SISTEM_REHBERI sınıf sözlüğüne owl-export. | docs |

**DoD:** TTL, `n3` ile hatasız parse ediliyor (ideali: Protégé'de açılıyor);
round-trip testi yeşil; Gezgin canlıda 8 tip/20 linki gösteriyor; `tsc` + e2e temiz.

**Riskler:** Düşük. Tek dikkat: Türkçe displayName'ler `rdfs:label`'da
`@tr` dil etiketiyle verilmeli.

**Tahmin:** 3-4 gün.

---

> ### 🚧 KAPI (gate)
> Sprint 2+ **yalnız gerçek bir sürücü belirince** başlar: mimworld MIM
> OWL'una erişim, geliştirici-olmayan birinin ontoloji düzenleme ihtiyacı,
> ya da ikinci gerçek veri kaynağının modele tip ekletmesi. Gerekçe: bugün
> ontolojiyi yalnız geliştirici değiştiriyor → kod+derleyici daha güçlü ağ;
> kullanıcısı olmayan import hattı saldırı yüzeyi ekler, değer eklemez.
> (Tasarım hazır — sürücü çıktığı gün beklemeden başlanır.)

---

## Sprint 2 — İki Katmanlı Model + Sürümlü Depo *(temel; henüz kullanıcıya açılmaz)*

**Amaç:** "Çekirdek kodda, uzantı dosyada" mimarisinin iskeleti. Bayrak
kapalıyken sistem bit-değişmez.

| # | Görev | Dosya/Konum |
|---|---|---|
| 2.1 | Uzantı sözleşmesi: `OntologyExtension` tipi + zod — yeni objectType'lar ve yeni linkType'lar (mevcut contract şemalarının alt kümesi + `surum`, `aciklama` meta). **Çekirdek koruması şemada:** kernel apiName'leriyle çakışan tip/özellik/link **reddedilir**; uzantı linki kernel tiplerine *bağlanabilir* ama onları değiştiremez. v1 kısıtı: uzantı tipi **mevcut bir view/dataset'e bağlanmak zorunda** (materyalize Harman dataset'i dâhil) — yeni depolama üretimi kapsam dışı. | `verim-server/src/contract/ontology-ext.ts` |
| 2.2 | Sürümlü, değişmez uzantı deposu (AnalysesStore kalıbı — dosya/GCS): `{surum, sha256, yukleyen, onaylayan?, durum: taslak\|dogrulandi\|onayli\|aktif\|arsiv, icerik, zaman}`. Sürümler asla üzerine yazılmaz. | `src/ontology/ontology-ext-store.ts` |
| 2.3 | `CompositeOntologyProvider`: kernel (koddaki `MimOntologyProvider`/`DummyOntologyProvider`) ⊕ **aktif** uzantı sürümü → tek `OntologyResponse`. DI: `ONTOLOGY_PROVIDER` artık composite'i işaret eder; `ONTOLOGY_EXTENSIONS` env bayrağı (vars. `off`) kapalıyken composite = saf kernel. | `src/ontology/composite-ontology-provider.ts`, `ontology.module.ts` |
| 2.4 | Testler: (a) bayrak kapalı → `GET /ontology` çıktısı bugünküyle **bit-eş** (snapshot); (b) kernel-çakışma reddi; (c) boş uzantı = no-op; (d) örnek uzantı ("tesis" tipi + `birlik-tesis` linki) composite çıktısında görünüyor. | `test/ontology-ext.e2e-spec.ts` |

**DoD:** Bayrak kapalıyken tüm mevcut testler değişmeden yeşil; composite
parite snapshot'ı CI'da.

**Riskler:** DI değişikliği geniş — parite snapshot'ı bu yüzden zorunlu.

**Tahmin:** 4-5 gün.

---

## Sprint 3 — Kabul Hattı Kademeleri 1-3 *(doğrulayıcı çekirdek — "yüklenmez"in kalbi)*

**Amaç:** Aday uzantı, aktifleşmeden önce üç mekanik kademeden geçer; hiçbir
doğrulama aktif ontolojiyi etkilemez (salt-okunur, kuru-koşu).

| # | Görev | Dosya/Konum |
|---|---|---|
| 3.1 | **Kademe 1 — Sözdizimi:** zod (2.1'deki şema). Yapılandırılmış hata raporu formatı: `{kademe, kod, mesaj, konum}` — insan-okur + makine-okur. | `src/ontology/admission/sozdizimi.ts` |
| 3.2 | **Kademe 2 — Bağlama bütünlüğü:** her `datasetId` gerçek bir view/dataset'e işaret ediyor mu; `primaryKey` ve her özellik kolonu o kaynakta **gerçekten var mı** ve tip uyumlu mu; her linkin `fromKey`/`toKey`'i iki uçta mevcut mu. MIM backend'de `information_schema`'ya, dummy'de DatasetProvider şemasına karşı — **aynı arayüz** (`SchemaIntrospector` portu, iki adapter). | `src/ontology/admission/baglama.ts` |
| 3.3 | **Kademe 3 — Davranış smoke'u:** aday ontolojiyle **geçici** composite kur (aktifleştirmeden); her yeni tip için `load(limit:1)` + `aggregate(count)`, her yeni link için `searchAround(limit:1)` — **gerçek motorda** (SQL/dummy). Fikstürler elle yazılmaz: uzantının kendisinden türetilir (drift testinin çalışma-zamanı hâli). Zaman sınırı (tip başına ≤5 sn) + salt-okunur garanti. | `src/ontology/admission/davranis.ts` |
| 3.4 | Kuru-koşu API + CLI: `POST /ontology/extensions:validate` (admin; gövde=aday uzantı; cevap=tam rapor) ve `node dist/ontology/admission/cli.js aday.json`. | `admission/cli.ts`, controller |
| 3.5 | e2e: bilerek bozuk 6 vaka doğru kademede, doğru kodla yakalanıyor — (a) olmayan view, (b) eksik kolon, (c) tip uyuşmazlığı (string kolona integer özellik), (d) kırık link ucu, (e) kernel apiName çakışması, (f) boş primaryKey. | `test/admission.e2e-spec.ts` |

**DoD:** 6 kırmızı vaka + 1 yeşil vaka (geçerli "tesis" uzantısı) CI'da;
doğrulama hiçbir yazma yapmıyor (DB salt-okunur assert'i).

**Riskler:** Smoke'un canlı DB'de koşması — sadece SELECT üretildiğini motor
seviyesinde garanti et (mevcut engine'ler zaten salt-okunur sorgu üretir).

**Tahmin:** 5-6 gün.

---

## Sprint 4 — Kabul Hattı Kademeleri 4-5 *(etki analizi + yönetişim — askeri gereksinimin kalbi)*

**Amaç:** "Geçerli ama zararlı" değişikliği durdurmak ve her değişikliği
hesap verebilir kılmak. Bu kademe bugünkü derleyicinin **yapamadığını** yapar:
tip silmek bugün derlenir ama kayıtlı analizleri kırar — burada reddedilir.

| # | Görev | Dosya/Konum |
|---|---|---|
| 4.1 | **Kademe 4 — Etki analizi (diff):** aday vs aktif sürüm farkı; **silinen/yeniden adlandırılan** her öğe için referans taraması: Mercek analizleri (`ObjectSetDef` içinde objectType/linkType/kolon), Harman analizleri (datasetId+kolon), alarm kuralları (def), dashboard gadget'ları (def). Referanslı silme → **red + etkilenen artefakt listesi** (ad + tür + sahip). | `src/ontology/admission/etki.ts` |
| 4.2 | **Kademe 5 — Yönetişim:** durum makinesi `taslak→dogrulandi→onayli→aktif` (+`arsiv`); **dört-göz kuralı:** `yukleyen ≠ onaylayan`. Ön koşul — rol tabanlı auth genişletmesi: `AUTH_TOKENS` env'i `token:rol` listesi (roller: `kullanici`, `admin`, `onaylayan`); TokenGuard rol döner, uçlar rol ister. *(Bugünkü tek-token kurulumu `kullanici+admin+onaylayan` tek rolü gibi davranır — geriye uyumlu ama dört-göz ancak ≥2 token'la etkin; README'ye açıkça yazılır.)* | `src/auth/*`, `src/ontology/admission/yonetisim.ts` |
| 4.3 | **Denetim izi (audit):** append-only JSONL (AnalysesStore kalıbı): kim/ne zaman/hangi sha256/hangi eylem/hangi sonuç. Silme yok. | `src/ontology/ontology-audit.ts` |
| 4.4 | Yaşam döngüsü API'si: `POST /ontology/extensions` (yükle→taslak; otomatik kademe 1-4 koşar), `POST :approve` (onaylayan rolü), `POST :activate` (admin; aktifleşince eski sürüm arşive), `POST :rollback` (önceki aktif sürüme **tek çağrıda** dönüş), `GET /ontology/extensions` (geçmiş+durumlar). | controller |
| 4.5 | Türev indeks tazeleme kancası: aktivasyonda yeni tip/link için `search-load`/`graph-load` gereksinimi **raporda belirtilir**; v1'de elle koşulur (dokümante), v2 adayı: aktivasyon-sonrası otomatik iş. | docs + rapor alanı |
| 4.6 | e2e: dört-göz ihlali reddi; referanslı-silme reddi (kayıtlı analizli senaryo); rollback sonrası `GET /ontology` eski çıktıya eş; audit satırları tam. | `test/governance.e2e-spec.ts` |

**DoD:** Onaysız aktivasyon **imkânsız** (test kanıtlı); rollback ≤1 sn;
audit eksiksiz; README yönetişim bölümü yazıldı.

**Riskler:** Rol genişletmesi mevcut tek-token akışını bozmamalı — geriye
uyumluluk testi şart. *(Çapraz not: satır-düzeyi güvenlik (PG RLS) bu sprintin
kapsamı DIŞINDA ama aynı yönetişim ailesinin işi — ayrı karar/sprint olarak
KARAR dokümanında kayıtlı.)*

**Tahmin:** 5-6 gün.

---

## Sprint 5 — OWL İçe Aktarım + Yönetim UI + Uçtan Uca Tatbikat

**Amaç:** Dış OWL/Turtle dosyasından uzantı yüklemek; tüm hattı arayüzden
kullanılır kılmak; asistan senkronunu kanıtlamak.

| # | Görev | Dosya/Konum |
|---|---|---|
| 5.1 | OWL/Turtle içe aktarıcı (`n3` parser): `owl:Class`→tip adayı, `owl:DatatypeProperty`→özellik, `owl:ObjectProperty`→link; **`verim:*` bağlama annotation'ları zorunlu** — eksikse kademe-1 reddi: "bağlama manifesti eksik: datasetId/primaryKey" (OWL anlamı taşır, bağlamayı taşımaz — kararın gereği). Çıktı: `OntologyExtension` → mevcut kabul hattına girer (yeni kademe yok). | `src/ontology/owl-import.ts` |
| 5.2 | **Yönetim UI** `/ontoloji/yonetim` (admin): dosya yükle (JSON/TTL) → kademeli doğrulama raporu (kademe başına ✓/✗ + hatalar) → onaya gönder → aktifleştir → sürüm geçmişi + tek tık rollback. Gezgin'e "aday vs aktif **diff** görünümü". | `verim-frontend/src/ontoloji/YonetimPage.tsx` |
| 5.3 | **Asistan senkron kanıtı:** uzantılı ontolojiyle drift-testi varyantı — yeni tip araç enum'larında (`injectRuntimeEnums`) görünüyor, `def-lint` tanıyor, `nesne_yukle` fikstürü koşuyor. | `test/capabilities-ext.e2e-spec.ts` |
| 5.4 | **Uçtan uca tatbikat** (Playwright): örnek `tesis.ttl` (üs/tesis tipi + `birlik-tesis` linki, mevcut bir view'a bağlı) → yükle → rapor → onayla → aktifleştir → Mercek'te "Tesisler" görünüyor + sorgulanıyor → Gezgin'de görünüyor → asistana "kaç tesis var?" → rollback → kaybolduğunu doğrula. | tatbikat scripti + kayıt |
| 5.5 | Dokümantasyon: MIMARI (kabul hattı diyagramı), SISTEM_REHBERI (SSS: "ontolojiyi kim, nasıl değiştirir?"), DERSLER (çıkan dersler), ROADMAP. | docs |

**DoD:** Tatbikat senaryosu uçtan uca yeşil ve kayıtlı; dokümanlar güncel;
tüm test takımları (e2e + drift + eşdeğerlik + admission + governance) yeşil.

**Riskler:** OWL dosyalarının "vahşi" çeşitliliği — v1 kapsamı bilinçli dar:
yalnız bizim export profilimiz + `verim:*` annotation'lı dosyalar kabul
(profil dışı yapılar kademe-1'de net mesajla reddedilir).

**Tahmin:** 6-8 gün.

---

## Çapraz işler ve program özeti

| İş | Not |
|---|---|
| **Satır/olgu-düzeyi güvenlik (PG RLS)** | Depodan bağımsız gereksinim (KARAR dokümanı §2.4/§8); bu programın DIŞINDA ayrı karar+sprint. Sprint 4'ün rol altyapısı ön koşulunu döşer. |
| **OBDA/SPARQL sanal ucu (Ontop)** | Tetikleyici çıkarsa (koalisyon SPARQL talebi) ayrı 1 sprintlik iş; bu programın çıktıları (OWL + bağlama annotation'ları) onun R2RML eşlemesinin hammaddesidir. |
| **Kernel değişiklikleri** | Çekirdek tip/link değişimi ESKİSİ GİBİ kod+7-dosya+derleyici yolundan gider; bu program onu değiştirmez (bilinçli). |

**Zaman çizelgesi:** S1 hemen (3-4 g) → **kapı** → S2-S5 sürücü belirince
ardışık (~4 hafta). Toplam efor: ~23-29 gün.

**Programın bitiş tanımı:** Geliştirici olmayan yetkili bir kullanıcı, OWL
dosyasıyla yeni bir nesne tipini — beş kademeli kabul + dört-göz onayı +
denetim iziyle — sisteme ekleyebiliyor; asistan/Mercek/graf/arama tipi
kendiliğinden tanıyor; hatalı/zararlı dosya hiçbir kademede sistemi
etkileyemiyor; her sürüm tek tıkla geri alınabiliyor.
