# Karar Analizi — Veriyi Triple (RDF) Olarak Saklamalı mıyız?

Bu doküman bir savunma değil, **karar analizi**dir: iki tarafın argümanlarını
örnekleriyle ve doğru teknik bilgiyle sunar, Verim'in iş yüküne vurur ve
kararı **tersine çevirme koşullarıyla birlikte** kaydeder (ADR). Ayrıca bu
konuda yaygın olarak dolaşan "askeri sistemlerde triple kullanılmalı"
argümanlarını (bkz. §7) tek tek değerlendirir.

> İlgili: mimari genel bakış → [MIMARI.md](MIMARI.md) · uygulama planı →
> [SPRINT_ONTOLOJI_YONETIMI.md](SPRINT_ONTOLOJI_YONETIMI.md)

---

## 0. Kararın doğru parçalanması — aslında ÜÇ ayrı karar var

Tartışmalar çoğu zaman "triple mı, değil mi?" diye tek soru gibi yürür;
oysa üç bağımsız karar vardır ve karıştırılmaları en yaygın hatadır:

| # | Karar | Verim'deki karşılığı |
|---|---|---|
| **K1** | Yüksek hacimli **telemetri** (iz/gözlem/rapor akışı) hangi depoda? | `reporting_data`, `intel_report` |
| **K2** | Yavaş değişen **varlık-ilişki çekirdeği** (birlik–platform–sensör–personel ağı) hangi depoda? | Neo4j türev grafı + Postgres kaynak |
| **K3** | **Ontoloji tanımı** (modelin kendisi) hangi formatta; sınırda hangi dil konuşulur? | Bugün TypeScript (`mim-ontology.ts`) |

Bu üçünü ayırınca cevaplar netleşir: K1'de taraflar zaten hemfikirdir
(triple saklanmaz); asıl tartışma K2'dedir; K3 ise depolama değil
**temsil/değişim** sorusudur ve triple tartışmasından bağımsız "evet OWL"
cevabını alabilir.

---

## 1. Triple nedir — ve bir gözlemin triple maliyeti

Triple = `(özne, yüklem, nesne)`. Tüm veri, tek tip "olgu" kayıtlarına
ayrıştırılır. Verim'deki **tek bir iz gözlemi** bugün `reporting_data`'da
**tek satırdır** (10 veri kolonu). Aynı gözlem RDF'te:

```turtle
:gozlem-987654 a verim:IzGozlemi ;                       # 1  (tip)
    verim:izi            :iz-IZ-000123 ;                 # 2
    verim:tespitEden     :sensor-SNS-0042 ;              # 3
    verim:tespitZamani   "2026-07-05T17:42:00Z"^^xsd:dateTime ;  # 4
    verim:domain         "Hava" ;                        # 5
    verim:tehditSeviyesi 4 ;                             # 6
    verim:enlem          39.9042 ;                       # 7
    verim:boylam         32.8021 ;                       # 8
    verim:irtifaFt       30000 ;                         # 9
    verim:suratKnot      450 ;                           # 10
    verim:rotaDerece     270 .                           # 11
```

**1 gözlem ≈ 11 triple.** Verim'in bugünkü sentetik akışı (~150-200
mesaj/sn: sensör + MIP4-IES + saniyede ~25 istihbarat raporu) triple'a
çevrilse **günde ~100-150 milyon triple** üretir; 1M gözlemlik seed tek
başına ~11M triple'dır. Bu ölçek triplestore'lar için *imkânsız değildir*
(Wikidata ~16 milyar triple barındırır) ama **sürekli yüksek yazma + pencereli
analitik** birleşimi, bu motorların tasarım merkezinin dışındadır — Wikidata
sorgu servisinin bilinen gecikme/ölçek sıkıntıları da bunun kamuya açık
örneğidir.

---

## 2. KULLANIRSAK ne kazanırız? (triple'ın gerçek güçlü yanları)

Bunlar hakkıyla teslim edilmesi gereken, gerçek kazanımlardır:

### 2.1 Şema esnekliği (en güçlü argüman)
Yeni bir tehdit türü, yeni bir sensör alanı, öngörülmemiş bir kaynak —
`ALTER TABLE` yok; yeni yüklem sadece **yeni veridir**, çalışma anında girer.
Şemasını önceden bilmediğin çok-kaynaklı istihbarat ortamında bu gerçek bir
avantajdır. Karşılaştırma: Verim'de bugün yeni tip = 7 dosya + reseed
(bkz. sprint planındaki kabul hattı tam bu sürtünmeyi azaltmak için).

### 2.2 Mantıksal çıkarım (inference) — özgün yetenek
OWL/RDFS motoru **yeni olgu türetir**:
```turtle
verim:AtakHelikopteri rdfs:subClassOf verim:HavaAraci .
:plt-42 a verim:AtakHelikopteri .
# Reasoner otomatik türetir:  :plt-42 a verim:HavaAraci .
verim:astBirligi a owl:TransitiveProperty .
# → komuta zincirinin kapanışı (astın astı...) sorgusuz materyalize olur
```
Ayrıca **tutarlılık denetimi**: "bir sensör aynı anda iki platforma takılı
olamaz" (kardinalite aksiyomu) ihlal edilirse reasoner modeli *çelişkili*
ilan eder. Bu, SQL/Cypher dünyasında elle kural yazarak taklit edilir.

**Dürüst dipnot:** "Birlik A → Bölge X, Bölge X sınırdaş Ülke Y ⇒ A, Y için
tehdit" tarzı örnekler saf OWL çıkarımı değil, **kural** (SWRL/SPARQL rule)
işidir — yani bu değer, "triplestore" almadan da bir kural motoruyla (Verim'de
alarm motoru + Cypher) elde edilebilir. OWL'un gerçekten benzersiz olduğu yer
taksonomik sınıflama ve model tutarlılığıdır.

### 2.3 Standartlar ve federasyon
URI'ler küresel kimliktir; SPARQL federasyonu farklı kurumların uçlarını tek
sorguda birleştirebilir. Koalisyon senaryosunda (farklı ulusların sistemleri)
W3C yığını **ortak zemin** sağlar. NATO/MIP çevresindeki semantik birlikte
çalışabilirlik literatürünün özü budur ve geçerlidir — **ancak bu, sınırda
RDF konuşmayı gerektirir, içeride triple saklamayı değil** (bkz. §5).

### 2.4 Olgu-düzeyi üstveri (provenance) ve gizlilik etiketi
RDF-star (RDF 1.2 ile standartlaşıyor) tek tek olgulara üstveri bağlar:
"bu olguyu kim rapor etti, güvenilirliği ne, gizlilik derecesi ne". Apache
Rya (Accumulo hücre-görünürlük etiketleri üstünde) ve MarkLogic gibi ürünler
**olgu/öğe düzeyinde erişim kontrolü** sunar — çok-seviyeli gizlilik (MLS)
gereksinimi olan sistemlerde bu ciddi bir argümandır.

**Dürüst dipnot:** Verim bugün STANAG 2511 alanlarını (güvenilirlik A–F,
doğruluk 1–6) **kolon olarak** taşıyor — olgu-düzeyi provenance'ın pratik
karşılığı. Satır-düzeyi gizlilik içinse ilişkisel dünyanın cevabı var:
**PostgreSQL Row-Level Security** (native) ve Neo4j Enterprise'ın
etiket/özellik-düzeyi erişim kontrolü. Yani "gizlilik etiketi → mecburen
triplestore" çıkarımı doğru değildir; bu bir **depodan bağımsız gereksinim**dir
(ve bugün Verim'de hiç yok — hangi depo seçilirse seçilsin yapılacak iş).

---

## 3. KULLANMAZSAK ne kazanırız? (ilişkisel/hibritte kalmanın kazanımları)

### 3.1 Zaman-serisi ve analitik performansı
Verim'in sorgu profili: "son 15 dk penceresinde, sınıflandırmaya göre say",
"1M izde filtreli toplam", "24 saatlik trend". Bunlar **sütunlu/ilişkisel
motorların ve TSDB'lerin** ana vatanıdır: TimescaleDB hypertable (günlük
chunk), indeksli WHERE + GROUP BY, `SqlObjectSetEngine`/`SqlPushdownQueryEngine`
ile veritabanında biten sorgular. SPARQL 1.1'de aggregation **vardır**
(COUNT/GROUP BY), ama zaman bölmeleme, sıkıştırma, continuous aggregate gibi
TSDB olanaklarının karşılığı yoktur; büyük gruplamalarda motorlar genelde
belirgin yavaştır.

### 3.2 Yazma yolu
Saniyede yüzlerce kayıt, batch `unnest` insert'lerle tek satır/gözlem yazar.
Triple'da aynı akış 11 kat kayıt + indeks bakımı demektir; üstelik "son durumu
upsert et" deseni (bizim `object_item_location`) triple dünyasında
sil-yeniden-yaz gerektirir.

### 3.3 Derin ilişki gezinme zaten çözülü
"İlişkinin ilişkisinin ilişkisi" motivasyonu **property graph ile** karşılanır:
```cypher
MATCH (i:iz {id:'IZ-000123'})-[:TESPIT]->(:sensor)-[:TAKILI]->(:platform)
      -[:BAGLI]->(b:birlik)-[:KOMUTAN]->(k) RETURN k          // sabit derinlik
MATCH (b:birlik {id:'BRL-001'})-[:AST*1..]->(alt) RETURN alt   // keyfi derinlik
```
Verim'de Neo4j bu iş için **zaten kurulu ve indeksli**. Kenar-üstü özellik
(ilişkiye nitelik) property graph'ta doğal; RDF'te reification/RDF-star ister.

### 3.4 Tip güvenliği + mevcut kanıt altyapısı
Bugünkü zincir: contract tipleri → zod → iki motor → **eşdeğerlik testi
("tümü geçti")** → capability drift testi. Depoyu değiştirmek bu kanıt
altyapısını yeniden kurmayı gerektirir. İlişkisel kalmak, kurulmuş ve
doğrulanmış yatırımı korur.

### 3.5 İşletme olgunluğu ve ekip
Yedekleme/HA/izleme/işe alım havuzu Postgres ekosisteminde kıyas kabul etmez
şekilde geniştir. Kapalı-ağ kurulumunda az sayıda, iyi bilinen bileşen =
daha küçük saldırı yüzeyi ve bakım yükü.

### 3.6 Açık-dünya varsayımı sürtünmesi
SPARQL'in kendisi `FILTER NOT EXISTS` ile kapalı-dünya sorgular yapabilir;
sorun **OWL çıkarımına** yaslanınca başlar: OWL açık-dünya ve monotondur —
"kayıt yoksa yok demektir" diyemez. Operasyonel resim ("bölgede dost birlik
YOK") tam da bu tür kapalı-dünya hükümler ister. Çıkarım katmanına yaslanmış
bir tasarımda bu, sürekli dikkat isteyen bir uyumsuzluktur.

---

## 4. "Sensörden gelen veri triple mı?" — Hayır

Gerçek taktik veri kaynak formatlarıyla gelir: **Link-16** (taktik data link),
**ASTERIX** (radar değişimi, EUROCONTROL), NMEA, **MIP4-IES XML** (MIP
alışverişi), JSON, ikili protokoller. **JC3IEDM ve MIM'in kendisi ER/UML
kökenli modellerdir**; RDF/OWL temsilleri (ör. mimworld'deki MIM ontolojisi)
*modelin* yayın biçimidir, telin formatı değil. Kimse saniyede 25 raporu RDF
olarak yayınlamaz. Dolayısıyla triple, verinin **geldiği** şekil değil,
**dönüştürülerek sokulduğu** bir şekildir — ve her dönüşüm maliyettir.

"Neden herkes öneriyor?" sorusunun cevabı: semantik birlikte çalışabilirlik
literatürü **değişim sınırı** problemini çözer ve orada haklıdır; öneri
çoğu kez yanlışlıkla **operasyonel depoya** genellenir. Olgun uygulamalar
(Palantir Foundry dâhil) ontolojiyi optimize depoların *üzerinde* anlam
katmanı olarak tutar; triplestore kullanmaz.

---

## 5. Karar tersinir mi? — Evet: OBDA / sanal bilgi grafı

İlişkisel kalmak tek yönlü kapı **değildir**. W3C **R2RML** (2012) tam olarak
"ilişkisel ↔ RDF eşlemesi"nin standart dilidir; **Ontop** gibi OBDA motorları
bu eşlemeyle **sanal SPARQL ucu** açar: veri Postgres'te kalır, SPARQL sorgusu
çalışma anında SQL'e çevrilir (OWL 2 QL profili bu yeniden-yazım için
tasarlandı). Yarın bir müttefik "SPARQL ucu istiyorum" derse cevap depo
migrasyonu değil, **bir projeksiyon adapter'ıdır**. Tersi yönde — triplestore'a
taşınıp geri dönmek — pratikte çok daha pahalıdır. Karar asimetrisi budur.

---

## 6. Karşılaştırma özeti

| Kriter | Triplestore | Verim'in hibriti (TSDB+SQL+Neo4j+OpenSearch) |
|---|---|---|
| Telemetri yazma (100+/sn sürekli) | Zayıf (11× kayıt, upsert yok) | **Güçlü** (batch insert, hypertable) |
| Pencereli analitik / aggregation | Var ama genelde yavaş | **Güçlü** (pushdown, chunk) |
| Derin ilişki gezinme | İyi (property path) | **İyi** (Cypher, kurulu) |
| Şema esnekliği | **Çok güçlü** (yeni yüklem=veri) | Orta (kabul hatlı uzantı ile kapatılır) |
| Çıkarım (taksonomik sınıflama, tutarlılık) | **Özgün güç** | Yok — kural motoru + testlerle telafi |
| Standart değişim (koalisyon) | Doğal | OWL export + gerekirse OBDA ile **eşdeğer** |
| Olgu-düzeyi gizlilik etiketi | Rya/MarkLogic'te doğal | PG RLS / Neo4j FGAC ile **mümkün** (ikisinde de bugün kurulmadı) |
| Tip güvenliği + mevcut kanıt altyapısı | Sıfırdan | **Kurulu** (zod, eşdeğerlik, drift) |
| İşletme olgunluğu / ekip havuzu | Dar | **Geniş** |
| Tersinirlik | Dönüş pahalı | **OBDA ile RDF'e açılım ucuz** |

---

## 7. "Askeri sistemlerde triple kullanılmalı" metninin değerlendirmesi

Dolaşımdaki tipik argüman seti (kullanıcıya iletilen metin) madde madde:

| Metnin iddiası | Değerlendirme |
|---|---|
| "Telemetri/iz verisi triple TUTULMAMALI; TSDB/RDBMS'te kalmalı, ontoloji URI ile referans versin" | **Aynı fikirdeyiz** — bu zaten K1 kararımız; metinle tam mutabakat. |
| "Hibrit (polyglot) mimari en doğrusu" | **Aynı fikirdeyiz** — Verim tam olarak polyglot: TSDB + graf + arama + ilişkisel. |
| "Triple, NATO JC3IEDM/MIP standartlarına tam uyum sağlar" | **Kısmen yanlış.** JC3IEDM/MIM **ER/UML kökenli** modellerdir; MIP4 değişimi XML tabanlıdır. RDF, bu modellerin *bir* temsili/yayınıdır. Uyum, değişim spesifikasyonunu konuşmakla sağlanır — içeride triple saklamakla değil. OWL export + (gerekirse) OBDA ucu aynı uyumu verir. |
| "Komuta hiyerarşisi, istihbarat ağı gibi *anlamsal çekirdek* triple tutulmalı" | **Tartışmanın gerçek noktası (K2).** Bu katman küçük ve yavaş değişir; triplestore *çalışır*. Ancak aynı ihtiyaçlar property graph'ta (Neo4j — kurulu) ve ilişkiselde de karşılanıyor; triple'ın buradaki *ek* getirisi yalnız OWL çıkarımı ve SPARQL federasyonudur. O ihtiyaçlar somutlaşana dek üçüncü bir depolama teknolojisi eklemek (öğrenme+işletme+senkron maliyeti) net kayıptır. Tetikleyici oluşursa (aşağıda) eklenir. |
| "Tehdit çıkarımı inference ile otomatik bulunur" | **Kısmen.** Verilen örnek (konum+komşuluk→tehdit) OWL değil **kural** çıkarımıdır; Verim'de alarm motoru + Cypher bunu bugün yapar. OWL'un özgün alanı taksonomi/tutarlılıktır (bkz. §2.2). |
| "Graph DB olgu-bazlı ACL desteklemeli (Rya/MarkLogic)" | **Gereksinim doğru, çıkarım eksik.** Çok-seviyeli gizlilik gerekiyorsa bu bir **seçim kriteridir** ama triple'a mecbur etmez: PG **Row-Level Security** ve Neo4j Enterprise FGAC aynı ihtiyacı karşılar. Not: Verim'de bugün olgu/satır-düzeyi güvenlik HİÇ yok — depo seçiminden bağımsız, yönetişim yol haritasına girmesi gereken gerçek eksik. |
| "Reasoning uçta değil merkezde koşmalı" | **Aynı fikirdeyiz** — Verim'in tüm ağır işleri zaten merkez sunucudadır. |

**Özet:** Metin, K1 ve mimari felsefede bizimle aynı yerde; ayrıştığı tek yer
K2'de "anlamsal çekirdek triple OLMALI" hükmü. Bizim değerlendirmemiz: bu bir
"olmalı" değil, "**şu koşullarda olur**" sorusudur — koşullar aşağıda.

---

## 8. KARAR (ADR)

**Tarih:** 2026-07-05 · **Durum:** Kabul edildi

- **K1 — Telemetri:** Triple saklanmaz. TimescaleDB (hypertable) + ilişkisel
  kalır. *(Tartışmasız; eleştirel literatür de aynı yerde.)*
- **K2 — Varlık-ilişki çekirdeği:** Kaynak-gerçek Postgres'te, gezinme Neo4j
  türev grafında kalır; **triplestore şimdi eklenmez.** Gerekçe: çıkarım ve
  federasyon ihtiyacı bugün yok; mevcut iki motor ihtiyaçları karşılıyor;
  üçüncü graf teknolojisi net işletme maliyeti.
- **K3 — Ontoloji/sınır:** Ontoloji tanımı **OWL uyumlu hâle getirilir**
  (önce dışa aktarım; içe aktarım kabul hattıyla — bkz. sprint planı).
  Koalisyon RDF'i **sınırda** konuşulur.

**Tersine çevirme / genişletme tetikleyicileri** (biri somutlaşırsa K2
yeniden açılır ve triplestore *ek katman* olarak değerlendirilir):
1. Gerçek **OWL çıkarım** ihtiyacı (büyük taksonomiler üzerinde otomatik
   sınıflama / model tutarlılık denetimi) operasyonel gereksinim olursa;
2. Müttefik/koalisyon **canlı SPARQL ucu** sözleşme gereği olursa
   (ilk cevap: Ontop/OBDA sanal ucu — depo değişmeden);
3. **Olgu-düzeyi gizlilik etiketi** (MLS) zorunluluğu, PG RLS/Neo4j FGAC'ın
   karşılayamadığı biçimde dayatılırsa;
4. Şeması öngörülemeyen **çok sayıda dış istihbarat kaynağı**nın ham modelde
   saklanması gerekirse (o kaynaklara özgü RDF staging düşünülür — çekirdek
   değil).

**Depodan bağımsız açılan iş:** satır/olgu-düzeyi yetkilendirme (bugün tek
token var). Yönetişim yol haritasına eklendi (sprint planı, çapraz iş).
