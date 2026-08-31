# Ders: Ontoloji, MIM ve Verim — Sıfırdan Tam Resim

Bu doküman, "ontoloji", "MIM", "OWL/SPARQL" gibi kavramları hiç bilmeyen
biri için yazıldı. Her bölüm bir öncekinin üzerine kurulur; örnekler hep
kendi sistemimizden (Verim / Harman / Mercek) verilir. Sonda bir sözlük ve
sık sorulan sorular var.

---

## Bölüm 1 — Ontoloji nedir?

En yalın haliyle ontoloji, bir alandaki **"ne tür şeyler var, bu şeylerin
hangi özellikleri var ve birbirlerine nasıl bağlılar"** sorusunun yazılı
cevabıdır. Bir veri değildir; verinin **haritasıdır**.

Bir veritabanı tablosuyla karşılaştıralım:

```
Tablo (veri):                          Ontoloji (harita):
┌───────────┬─────────────┬────────┐
│ sensor_no │ platform_no │ durum  │   "Sensör diye bir nesne türü vardır.
├───────────┼─────────────┼────────┤    Sensörün tipi, menzili, durumu vardır.
│ SNS-0001  │ PLT-0199    │ Pasif  │    Her sensör bir Platforma TAKILIDIR.
│ SNS-0002  │ PLT-0007    │ Aktif  │    Platform da bir Birliğe BAĞLIDIR."
└───────────┴─────────────┴────────┘
```

Tablo sana satırları verir; ontoloji sana **anlamı** verir: "platform_no
kolonundaki değer aslında başka bir nesneye açılan kapıdır." Mercek'te
"İlişkilere geç → Takılı olduğu platform" düğmesine bastığında çalışan şey
tam olarak budur — sistem, ontolojide tanımlı bu ilişkiyi bildiği için o
düğmeyi gösterebilir.

Verim'in ontolojisi şu an **8 nesne tipi ve 20 ilişkiden** oluşur (başta 5/8
idi; personel, iz gözlem geçmişi ve multi-INT istihbarat raporu eklendi):

```
  Birlik ──(platformları)──► Platform ──(sensörleri)──► Sensör ──(tespit)──► İz ──(geçmiş)──► İz Gözlem
    │  │                        │                                            │
    │  ├──(görevleri)──► Görev   └──(mürettebat)──► Personel                  └──(ilgili)──► İstihbarat Raporu
    │  └──(komutanı)──► Personel                                                (SIGINT/IMINT/OSINT/HUMINT)
    └──(personeli)──► Personel
```

**Akılda kalsın:** Ontoloji = nesne tipleri + özellikleri + aralarındaki
ilişkiler. Mercek bu haritayı okuyarak çalışır; harita olmadan "ilişkiye
geç", "ilişkiden kolon ekle" gibi hiçbir şey yapamaz.

---

## Bölüm 2 — MIP ve MIM nedir?

**MIP** (Multilateral Interoperability Programme), farklı ülkelerin komuta
kontrol (C2) sistemleri birbiriyle konuşabilsin diye kurulmuş çokuluslu
askeri bir standardizasyon programıdır (24 üye ülke + NATO + EDA;
Türkiye üyedir). Problemi şu: her ülkenin sistemi "birlik", "görev",
"tehdit" kavramlarını kendince modellerse, ortak harekâtta veriler
birleştirilemez. Çözüm: **ortak bir bilgi modeli** üzerinde anlaşmak.

Bu ortak modelin iki nesli var:

| | JC3IEDM (eski) | **MIM (yeni — bizim hedef)** |
|---|---|---|
| MIP sürümü | Baseline 3.x | MIP 4 |
| Yapısı | İlişkisel veri modeli (tablolar) | **Kavramsal/ontolojik model** (UML'de tutulur) |
| Dağıtımı | SQL şeması | UML modeli + **OWL çıktısı** + XMI + HTML gezgini |
| Veri alışverişi | DEM replikasyonu | **MIP4-IES** (XML tabanlı) |

MIM'in çekirdeğinde şu kavramlar var (bizim şemamızla eşleşmesi):

| MIM kavramı | Anlamı | Verim'deki karşılığı |
|---|---|---|
| **ObjectItem** | "Dünyadaki her somut şey"in kök türü | Her nesnenin ortak kimliği |
| **Organisation** | Örgüt/birlik | Birlik |
| **Materiel** | Teçhizat/araç | Platform ve Sensör |
| **Action / ActionTask** | Faaliyet/görev | Görev |
| **ReportingData** | "Bu bilgiyi kim, ne zaman raporladı" | İzin tespit kaydı |
| **ObjectItemLocation** | Nesnenin konumu/kinematiği | Enlem, boylam, sürat, rota |
| **HostilityStatus** | Dost/düşman sınıflandırması | İzin sınıflandırması |
| **Holding** | Örgüt–teçhizat sahipliği | Birlik–Platform bağı |
| **ObjectItemAssociation** | Nesne–nesne ilişkisi | Sensör–Platform "takılı" bağı |

Çok önemli bir ayrım: **model ≠ veri.** MIM sana "Organisation diye bir
tür vardır, şu attribute'ları vardır" der (model). "1. Zırhlı Tugay,
personeli 4200" bilgisi ise veridir — o, sahadaki sistemlerden MIP4-IES
XML mesajlarıyla akar. MIM'i "kurmak" diye bir şey yoktur; MIM
**edinilir ve incelenir** (bkz. SSS-1).

---

## Bölüm 3 — RDF, OWL, SPARQL: "Semantic Web" ailesi

Bu üçlü sık duyacağın ama **kullanmak zorunda olmadığın** bir teknoloji
ailesidir. Ne olduklarını bil, yerini bil, yeter.

**RDF** — bilgiyi üçlüler (özne–yüklem–nesne) halinde yazma biçimi:

```
:SNS-0001  :takılıOlduğuPlatform  :PLT-0199 .
:PLT-0199  :bağlıOlduğuBirlik     :BRL-061 .
:PLT-0199  :çağrıAdı              "DOĞAN-36" .
```

Her satır bir cümle gibidir. Tablolar yerine bu üçlülerden milyonlarcasını
yığarsın; buna **triple store** denen özel veritabanları ev sahipliği
yapar (Apache Jena/Fuseki, GraphDB...).

**OWL** — RDF'in üstünde, **ontoloji tanımlama dili**: "Sensör bir
sınıftır, Materiel'in alt sınıfıdır, takılıOlduğuPlatform özelliği
Sensör'den Platform'a gider ve en fazla bir değer alır" gibi kuralları
makine-okur biçimde yazar. **MIM'in OWL çıktısı = MIM modelinin bu dilde
dışa aktarılmış hali.** Protégé adlı ücretsiz araçla açıp gezebilirsin.

**SPARQL** — RDF verisini sorgulama dili; SQL'in üçlü-dünyasındaki
karşılığı:

```sparql
SELECT ?sensor WHERE {
  ?sensor :takılıOlduğuPlatform ?p .
  ?p :bağlıOlduğuBirlik :BRL-061 .
}
```

**Kritik nokta:** Ontolojiye sahip olmak için bu yığını kullanmak zorunda
değilsin. Ontoloji bir *fikirdir* (Bölüm 1); RDF/OWL/SPARQL onun *bir*
uygulama biçimidir. Aynı fikir, bizim yaptığımız gibi "JSON sözleşme +
PostgreSQL + SQL" ile de uygulanır. Nitekim Palantir de öyle yapar ↓

---

## Bölüm 4 — Palantir bunu nasıl yapıyor?

Foundry'nin katmanları şöyledir:

```
┌───────────────────────────────────────────────────┐
│  Uygulamalar: Mercek, Object Explorer, Workshop   │  ← bizim Mercek/Harman
├───────────────────────────────────────────────────┤
│  ONTOLOGY: nesne tipleri, özellikler, link'ler    │  ← İNSAN TANIMLAR
│  (Ontology Manager'da küratörlük yapılır;         │    (Ontology Manager)
│   her nesne tipi bir dataset'e "bağlanır")        │
├───────────────────────────────────────────────────┤
│  Datasets: ham/işlenmiş veri (pipeline'lar)       │  ← bizim PostgreSQL + view'lar
└───────────────────────────────────────────────────┘
```

Cevaplanması gereken soru şuydu: *"Palantir ontolojiyi OWL'den otomatik mi
üretiyor? SPARQL mi kullanıyor?"* **Hayır ve hayır.** Foundry'de ontoloji,
bir insanın (ontoloji mühendisi) Ontology Manager'da elle tanımladığı
**küratörlü metadata'dır**: hangi nesne tipleri var, görünen adları ne,
hangi kolonlar özellik, hangi ilişkiler gezilebilir link, hangi dataset'e
bağlı. Mercek bu tanımı bir API'den okur; sorgular Palantir'in kendi sorgu
motorlarında koşar — SPARQL yoktur.

Neden otomatik üretmiyorlar? Çünkü kaynak şemadaki *her şey* kullanıcıya
anlamlı değildir. Yüzlerce tablo/kolon içinden analiste anlamlı olan
5-10 nesne tipini seçmek, adlandırmak, ilişkilerini belirlemek bir
**küratörlük** işidir — otomasyonla değil, alan bilgisiyle yapılır.

**Bizdeki karşılığı:** `verim-server/src/mim/mim-ontology.ts` dosyası,
Ontology Manager'ın kod-dosyası halidir. Oradaki her satır bir küratörlük
kararıdır ve hangi MIM kavramından geldiği üzerinde yazar:

```ts
{ apiName: 'siniflandirma',
  mim: 'ObjectItemHostilityStatus.hostilityStatusCode',   // ← MIM kaynağı
  displayName: 'Sınıflandırma', type: 'string' }
```

Yani "ontolojiyi koda statik gömdük" durumu bir eksiklik değil; sektörün
(Palantir dahil) çalışma biçiminin kendisi. Statik olması gerekmeyen tek
şey dosyanın *formatı* — ileride bu eşleme veritabanında durabilir ve
MIM'in OWL'inden yarı-otomatik üretilebilir/doğrulanabilir (Bölüm 6).

---

## Bölüm 5 — Verim bugün nasıl çalışıyor?

Sistemin tamamı tek şemada:

```
     TARAYICI                        SUNUCU (NestJS)                    VERİ
┌──────────────────┐          ┌─────────────────────────┐
│ Harman (Harman) │─REST────►│ QUERY_ENGINE (port)     │──┐
│ tablo/pipeline   │          │  └ InMemoryQueryEngine  │  │   ┌────────────────────┐
├──────────────────┤          ├─────────────────────────┤  ├──►│ PostgreSQL         │
│ Mercek (Mercek)  │─REST────►│ OBJECT_SET_ENGINE (port)│  │   │  MIM entity        │
│ nesne/kart       │          │  └ SqlObjectSetEngine ──┼──┘   │  tabloları         │
│                  │          │    (sorguyu SQL'e çevirir)     │  (object_item,     │
│  "hangi tipler   │          ├─────────────────────────┤      │   materiel, ...)   │
│   var?" diye ────┼─REST────►│ ONTOLOGY_PROVIDER (port)│      │        ▲           │
│   sorar          │          │  └ MimOntologyProvider  │      │  v_* view'ları     │
└──────────────────┘          │    (MIM eşlemesinden    │      │  (Verim'in gördüğü │
                              │     ontolojiyi türetir) │      │   sade yüz)        │
                              └─────────────────────────┘      └────────────────────┘
```

Adım adım ne oluyor:

1. **Mercek açılır** → `/ontology`'yi çağırır → MimOntologyProvider,
   `mim-ontology.ts` eşlemesinden 8 tip + 20 linki üretip döner. Mercek'in
   tüm menüleri (nesne ekle, ilişkiye geç, kolon seç) bu cevaptan doğar.
2. **Kullanıcı kart zinciri kurar** (filtrele → ilişkiye geç → grafik).
   Zincir, `ObjectSetDef` denen bir tarif olarak sunucuya gönderilir.
3. **SqlObjectSetEngine** bu tarifi SQL'e çevirir: filtre → `WHERE`,
   ilişkiye geç / ilişkiden kolon ekle → `JOIN`, grafik → `GROUP BY`.
   Sorgu **veritabanının içinde** koşar (buna *pushdown* denir) — 1 milyon
   satırlık iz tablosunda bile satırlar sunucuya taşınmaz, sadece sonuç
   döner. (Harman'ın motoru şimdilik bellek-içi çalışır; tabloyu 100k
   satır tavanıyla çeker.)
4. **Veri nereden geldi?** Gerçek MIM verimiz henüz olmadığı için "seed"
   adımı, ürettiğimiz temsili C2 verisini MIM entity tablolarına yazar.
   Gerçek sistemde bu adımın yerini MIP4-IES XML mesajlarını okuyup aynı
   tablolara yazan bir **ingest** süreci alacak — sistemin geri kalanı
   bunu fark etmeyecek bile.

**"Port" ne demek?** Şemadaki `*_PROVIDER / *_ENGINE` kutuları birer
priz gibidir: Verim prize bağlanır, prizin arkasında hangi santral var
umursamaz. Bugün prizlerin arkasında "dummy" (bellek-içi) ya da "mim"
(PostgreSQL) santralleri var; `DATA_BACKEND=mim` anahtarıyla seçilir.
Yarın SPARQL santrali gerekirse sadece yeni bir fiş yazılır.

**Bu sistemde şu an OWL/SPARQL var mı?** Yok. Ontoloji JSON sözleşmeyle
servis ediliyor, veri PostgreSQL'de, sorgular SQL'de. Bu bilinçli bir
tercih: Palantir'inkine denk, daha hızlı ve işletmesi kolay bir yol.

---

## Bölüm 6 — Gerçek MIM'e giden yol

Sırasıyla:

1. **MIM'i edin** — mimworld.org'a kurum e-postasıyla kayıt (MIP onaylı).
   İndirilecekler: UML modeli (Sparx EA), **OWL çıktısı**, XMI. Kayıt
   beklerken MIM Explorer ile modeli sitede gezebilirsin. OWL dosyasını
   Protégé'de açıp Organisation/Materiel/Action hiyerarşisini görmek, bu
   dersin en iyi pekiştirmesi olur.
2. **OWL importer/doğrulayıcı** (MIM dosyaları elimize geçince yazılacak) —
   MIM OWL'ini okuyup: (a) bizim eşlemedeki her `mim:` etiketinin gerçek
   modelde var olduğunu doğrular, (b) modelde olup bizde olmayan
   entity/attribute'ları "aday" olarak listeler. Böylece ontoloji koddan
   beslenen değil, **modelden doğrulanan** bir katman olur.
3. **Veri ingest'i** — sahadan MIP4-IES XML mesajları geldiğinde bunları
   MIM entity tablolarımıza yazan servis. Seed'in yerini alır; view'lar,
   motorlar, frontend aynen kalır.
4. **(Koşullu) SPARQL adapteri** — hedef program verinin triple store'da
   tutulmasını şart koşarsa, `ObjectSetDef → SPARQL` çevirici yazılır
   (bugünkü SQL çeviricinin ikizi). Şart koşulmadıkça gerek yok.

Hiçbir adımda Harman/Mercek arayüzü veya REST sözleşmesi değişmez —
mimarinin bütün amacı buydu.

---

## Sözlük

| Terim | Tek cümlede |
|---|---|
| **Ontoloji** | "Hangi nesne türleri var, özellikleri ve ilişkileri ne" haritası |
| **Entity / Attribute / Association** | Ontolojideki tür / özelliği / iki tür arası ilişki |
| **MIP** | Ülkelerin C2 sistemleri birlikte çalışsın diye kurulan çokuluslu program |
| **MIM** | MIP'in güncel (MIP 4) bilgi modeli; UML'de tutulur, OWL çıktısı vardır |
| **JC3IEDM** | MIM'in ilişkisel-model olan atası (MIP Baseline 3.x) |
| **MIP4-IES** | MIP 4'te veri alışverişinin XML formatı (model değil, veri taşır) |
| **UML / XMI** | Model çizme standardı / modelin dosya formatı |
| **OWL** | Ontolojiyi makine-okur yazma dili (MIM'in bir çıktı formatı) |
| **RDF / üçlü** | Bilgiyi özne-yüklem-nesne cümleleri halinde tutma biçimi |
| **SPARQL** | RDF verisinin sorgu dili (SQL'in üçlü-dünya karşılığı) |
| **Triple store** | RDF üçlülerini tutan veritabanı (Jena, GraphDB...) |
| **Protégé** | OWL ontolojilerini açıp gezmeye yarayan ücretsiz araç |
| **Port / Adapter** | Priz / fiş: sistemin değişmeyen arayüzü ve değiştirilebilir gerçekleştirimi |
| **Pushdown** | Sorguyu veriyi çekmeden veritabanının içinde koşturma |
| **View** | Tabloların üstüne kurulan sanal, sadeleştirilmiş "pencere" |
| **Staging** | Gerçek kaynak gelmeden önce onun şeklini taklit eden ara veritabanı |
| **Ingest** | Dış kaynaktan gelen veriyi (örn. MIP4-IES XML) kendi deposuna yazma süreci |
| **Küratörlü ontoloji** | Otomatik üretilmeyen, insan eliyle seçilip adlandırılan ontoloji katmanı |

---

## Sık Sorulan Sorular

**S1. MIM'i bilgisayarıma kurabilir miyim?**
"Kurulacak" bir program değil; indirilecek bir model. mimworld.org'a
kurumsal e-postayla kayıt olursun (MIP yönetimi onaylar), UML/OWL/XMI
dosyalarını indirirsin, Protégé veya MIM Explorer ile incelersin.
Bilgisayarına kurabileceğin şeyler modeli *görüntüleme* araçlarıdır
(Protégé, Sparx EA) — MIM'in kendisi değil.

**S2. Ontolojiyi koda statik yazmak zorunda mıyız?**
Bir yerde *yazılı olmak* zorunda — soru nerede duracağı. Palantir bunu
Ontology Manager adlı araçta, biz şimdilik `mim-ontology.ts` dosyasında
tutuyoruz; ikisi de insan küratörlüğüdür. MIM'in OWL'i elimize geçince
bu eşleme modele karşı otomatik doğrulanabilir, hatta adaylar modelden
önerilebilir — ama "hangi 5 tip analiste gösterilecek" kararı hep insanda
kalır. Bu bir eksiklik değil, doğru tasarım.

**S3. SPARQL veya OWL kullanmamız gerekiyor mu? Şu an var mı?**
Şu an yok ve gerekmiyor. OWL'i sadece MIM *modelini* okumak/doğrulamak
için kullanacağız (2. adım). SPARQL yalnızca hedef sistem veriyi triple
store'da tutmayı şart koşarsa gündeme gelir; o gün de mimaride yeri hazır.
Veri alışverişinin standart yolu zaten RDF değil, MIP4-IES XML'idir.

**S4. Palantir'in sistemleri böyle mi çalışıyor?**
Evet — Foundry'de de ontoloji OWL'den otomatik üretilmez, SPARQL yoktur:
insan tanımlı nesne/link katmanı dataset'lere bağlanır, Mercek bu katmanı
API'den okur, sorgular kendi motorlarında koşar. Verim aynı deseni izler:
küratörlü ontoloji (MIM eşlemeli) + view'lara bağlı tipler + SQL pushdown.

**S5. Yarın gerçek MIM verisi gelince ne değişecek?**
Seed'in yerini MIP4-IES ingest'i alır, eşleme gerçek OWL'e karşı
doğrulanır — view'lar belki ince ayar görür. Harman, Mercek, REST
sözleşmesi ve motorlar değişmez.
