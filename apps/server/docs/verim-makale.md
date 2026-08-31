# Verim: Veriyi Anlama Platformu — Sade Bir Anlatım

## Bu sistem ne yapıyor?

Bir karargâhta ya da harekât merkezinde çalıştığınızı düşünün. Elinizde
birlikler, uçaklar ve gemiler (platformlar), radarlar (sensörler), görevler ve
gökyüzünde/denizde sürekli hareket eden binlerce "iz" (radar tespiti) var.
Bunların hepsi farklı kaynaklardan, farklı biçimlerde akıyor. Sorulacak sorular
belli: *"Şu bölgede kaç düşman izi var? Hangisi bize yaklaşıyor? En tehlikelisi
hangisi? Ona karşı ne yapabilirim?"*

Verim, bu soruların **tek bir ekrandan, sade bir dille sorulabilmesini**
sağlayan bir veri platformudur. İlham kaynağı, dünyada bu işin en bilinen
örneği olan Palantir'in ürünleridir (Foundry/Gotham); Verim onun temel
fikirlerinin yerli ve bağımsız bir uygulamasıdır.

## Ana fikir: Ontoloji — verinin üstüne bir "anlam katmanı"

Veritabanları satır ve sütunlardan anlar; insanlar ise nesnelerden ve
ilişkilerden. "izler tablosundaki siniflandirma kolonu HO olan satırlar" demek
yerine "düşman izleri" demek isteriz.

İşte ontoloji tam olarak bu çeviridir: **verinin üstüne kurulan ortak bir
kavram sözlüğü**. Verim'in ontolojisinde 8 nesne tipi vardır (birlik, platform,
görev, sensör, iz, gözlem, istihbarat raporu, personel) ve bunlar 20 ilişkiyle
(link) birbirine bağlıdır: sensör bir platforma takılıdır, platform bir birliğe
bağlıdır, iz bir sensörce tespit edilmiştir...

Bu sayede kullanıcı zincirleme sorular sorabilir: *"Düşman izlerini bul →
onları tespit eden sensörlere geç → o sensörlerin takılı olduğu platformlara
geç → o platformların bağlı olduğu birlikleri göster."* Sistemde buna "ilişki
üzerinden gezinme" (searchAround) denir ve tek tıkla yapılır.

Önemli bir ayrıntı: bu ontoloji havadan uydurulmamıştır. NATO'nun ülkeler
arası bilgi paylaşımı için standartlaştırdığı veri modeline (MIP-4 / MIM)
**birebir eşlenerek** tanımlanmıştır. Kodda her kavramın yanında "bu, MIM'in şu
alanından geliyor" notu yazar. Yani yarın gerçek bir NATO veri kaynağı
bağlandığında kavramlar zaten hizalıdır.

## Priz-fiş mimarisi: her parça sökülüp takılabilir

Sistemin en önemli mühendislik kararı şudur: **hiçbir parça, veriyi nereden
aldığını bilmez.** Her yetenek bir "priz" olarak tanımlanır (port / arayüz),
ve her prize iki farklı "fiş" takılabilir (adapter):

- **Deneme fişi (dummy):** Veri tamamen bellekte, deterministik olarak üretilir
  (her açılışta bit-bit aynı sahte veri). Hiçbir sunucu, hiçbir veritabanı
  gerekmez — geliştirici bilgisayarında saniyeler içinde ayağa kalkar.
- **Gerçek fiş (mim):** Veri gerçek bir veritabanında durur (PostgreSQL +
  zaman serisi eklentisi TimescaleDB), arama gerçek bir arama motorunda
  (OpenSearch), ilişki ağı gerçek bir graf veritabanında (Neo4j) tutulur.

Tek bir ortam değişkeni (DATA_BACKEND) hangi fişin takılacağını seçer ve —
kritik nokta — **iki mod da dışarıya birebir aynı cevabı verir.** Bu bir iddia
değil, otomatik bir testle kanıtlanır: aynı sorgular iki modda da koşulur ve
sonuçlar karşılaştırılır (eşdeğerlik testi). Arayüz hiçbir farkı görmez.

Bu tasarımın günlük hayattaki anlamı: sistem yarın Oracle'a, başka bir arama
motoruna ya da gerçek MIP kaynağına geçse, değişecek olan sadece "fiş"tir —
üstteki hiçbir ekran, sorgu motoru veya asistan değişmez.

## Dataset nedir? Kaydedilmiş bir sorgunun canlı sonucu mu?

Sistemde her şeyin altında yatan yapı taşı **dataset**tir (veri kümesi):
adı, kolonları (şeması), satırları ve bir sürüm damgası olan tablo
biçimli bir veri kaynağı. Ontolojiyle ilişkisi birebirdir: her nesne tipi
bir dataset'e "yaslanır" — iz tipi `izler` dataset'inden, birlik tipi
`birlikler`den beslenir. Harman zincirleri de her zaman bir dataset'ten
başlar.

Peki dataset nasıl oluşur? Cevap moda göre değişir ve tam da sorunun
kalbindeki ayrımı gösterir:

- **Deneme modunda** dataset, açılışta bellekte üretilen deterministik bir
  tablodur — her seferinde bit-bit aynı.
- **Gerçek modda** dataset, fiziksel bir tablo değil, **kaydedilmiş bir
  sorgudur** (veritabanı görünümü / view). `izler` dataset'i dediğimiz şey,
  aslında "kimlik tablosunu, son-konum tablosunu, en güncel gözlemi ve tehdit
  skorunu birleştir, kolonları şu adlarla sun" diyen saklı bir SELECT'tir.
  Hiçbir veri kopyalanmaz; dataset her okunduğunda o anki gerçek tablolardan
  yeniden hesaplanır.

Bu yüzden sorunun cevabı **evet**: gerçek modda çekirdek dataset'ler,
kaydedilmiş bir sorgunun **dinamik** sonucudur — bir fotoğraf değil, canlı
veriye açılan bir **penceredir**. Veri geldikçe dataset "değişmez" ama
içinden görünen manzara değişir: aynı pencereden beş dakika sonra bakan,
yeni gözlemleri görür.

> **Senaryo — veri gelirken dataset:** Saat 14:00'te bir analist `izler`
> dataset'inde 412 düşman izi sayar. O sırada toplayıcı, omurgadan akan yeni
> gözlemleri tablolara işlemektedir. Sistem her yazımda bir **su damgası**
> (watermark — en son işlenen gözlemin numarası) ilerletir ve bu damga
> dataset'in **sürüm** kimliğine gömülüdür. Analistin ekranı sürümün
> değiştiğini görür, "Canlı" moddaysa sorguyu kendiliğinden tazeler: 14:05'te
> sayı 417 olmuştur. Sürüm damgasının asıl işi dürüstlüktür: iki sorgu aynı
> sürümü taşıyorsa aynı veriye bakmıştır; önbellek (cache) ancak bu sayede
> güvenilir olur.

Bir de bunun bilinçli tersi vardır: analiz zincirinin sonucunu **"dataset
olarak kaydet"** (materialize) dediğinizde sistem, pencerenin tam tersini —
bir **fotoğraf** — üretir. O türetilmiş dataset, kaydedildiği andaki
sonucun donmuş kopyasıdır; canlı veri aksa da değişmez. Bu da özellik, kusur
değil: "dünkü duruma göre hazırladığım analiz raporu bugün de aynı
rakamları göstersin" ihtiyacının karşılığıdır.

Peki pencere açma yetkisi neden yalnız mühendislerde olsun? Değil — sistemde
üçüncü bir tür daha vardır: **kullanıcı tanımlı canlı dataset** ("canlı
dataset olarak kaydet", `/query/live`). Bir analiz zincirini fotoğraf yerine
**tarif** olarak kaydedersiniz; sistem satırları değil sorguyu saklar ve
dataset her okunuşta güncel veriden yeniden hesaplanır. "Aktif düşman
izleri" gibi bir tanımı bir kez yapan ekip, onu herkesin üstüne analiz
kurabileceği, hep güncel bir yapı taşına çevirir. Bu güç başıboş da
değildir: aday tarif kaydedilmeden önce **gerçekten çalıştırılır** (bozuk
tarif sisteme hiç girmez), tavana takılan çözüm kısmi sonuç yerine açık
hata döner (fail-closed) ve silme, ontoloji yönetişimiyle aynı çıtaya
tabidir — o dataset'e başvuran tek bir kayıtlı analiz ya da alarm bile
varsa silinemez. Özetle sistemde üç tür dataset yaşar: **çekirdek
pencereler** (mühendis tanımlı view'lar), **kullanıcı pencereleri** (canlı
dataset'ler — kaydedilmiş sorgunun dinamik sonucu) ve **fotoğraflar**
(türetilmiş dataset'ler — bilerek dondurulmuş anlar).

## Canlı veri nasıl akıyor?

Gerçek modda sistemin damarlarında sürekli veri dolaşır:

1. **Kaynaklar** üretir: bir sensör ağı simülatörü (JSON mesajlar), bir NATO
   formatı simülatörü (XML raporlar) ve saniyede ~25 rapor üreten çok
   kaynaklı istihbarat simülatörü (SIGINT/IMINT/OSINT/HUMINT).
2. Hepsi bir **mesaj omurgasına** akar (Kafka uyumlu Redpanda) — kaynaklar
   veritabanını hiç bilmez, sadece "duyuru panosuna" mesaj bırakır.
3. **Toplayıcı servis** (ingest) mesajları alır, önce sağlık kontrolünden
   geçirir (koordinat dünya sınırında mı, zaman geçerli mi), bozuk olanları
   çöpe atmak yerine sebep etiketiyle **karantina** rafına kaldırır ve
   sağlamları hep aynı desenle veritabanına işler: *bilinmeyen iz gördüysen
   yeni kayıt aç; her gözlemi geçmişe EKLE (asla silme); izin son konumunu
   GÜNCELLE.*

> **Senaryo — yeni bir izin doğuşu:** Radar ağı, daha önce görülmemiş
> "IZ-A-004217" numaralı bir tespiti JSON mesajı olarak yayınlar. Mesaj
> omurgaya düşer; toplayıcı önce sağlığına bakar (koordinat dünya sınırında,
> zaman geçerli), sonra kimlik defterine bakar: bu iz tanınmıyor → yeni nesne
> kaydı açılır, gözlem geçmiş tablosuna eklenir, son-konum tablosuna ilk
> satır yazılır. Üç saniye sonra aynı izden ikinci gözlem gelir: bu kez kayıt
> açılmaz — geçmişe bir satır daha EKLENİR, son konum GÜNCELLENİR. Veri
> sürümü (watermark) ilerlediği için "Canlı" moddaki harita kendini tazeler;
> kullanıcı izin hareketini ekranda görür. Aynı mesaj, Kafka'nın "en az bir
> kez teslim" huyu yüzünden ikinci kez gelirse tekrar-engelleme indeksi onu
> sessizce yutar; bozuk bir mesaj gelirse çöpe değil, sebep etiketiyle
> **karantina** rafına kalkar — hiçbir veri sessizce kaybolmaz.

Bu desen sayesinde her izin hem "şu an neredesi" hem de tüm geçmişi (nereden
gelip nereye gitti) durur. Ve evet, veri gerçek anlamda **kinematiktir**: her
iz konum, yükseklik, sürat ve rota taşır; simülatörler izleri fiziğe uygun
hareket ettirir (sürat × zaman = alınan yol, rota yönünde). Milyonlarca
gözlemlik bu geçmiş, zaman serisi için özelleşmiş tabloda saklanır
(hypertable).

## Veriyle çalışmanın iki yolu: Harman ve Mercek

**Harman** (Palantir'deki Harman'un karşılığı) tablo düşünenler içindir.
Kullanıcı kart kart bir analiz zinciri kurar: filtrele → yeni kolon hesapla →
grupla ve say → özet tablo çıkar → grafiğe dök. Dokuz kart tipi vardır ve
kendi mini formül dili bulunur (`sum(gelir)/count()` gibi iç içe hesaplar
yapabilen bir ifade dili). Zincirin sonucu tek tıkla yeni bir veri kümesi
olarak kaydedilebilir.

> **Senaryo — "Son 24 saatteki düşman izlerini domain'e göre say":**
> Kullanıcı Harman'da dört kart dizer: (1) filtre: sınıflandırma = Düşman,
> (2) filtre: tespit zamanı ≥ şimdi − 24 saat, (3) ifade: `kategori =
> if(tehdit_skoru >= 70, 'kritik', 'normal')`, (4) histogram: domain'e göre
> grupla ve say. Sunucu zinciri baştan tarar; ilk iki kart filtredir ve
> **tek bir SQL sorgusuna** derlenir:
>
> ```sql
> SELECT * FROM v_iz
> WHERE siniflandirma = 'Düşman' AND tespit_zamani >= $1
> ORDER BY iz_no LIMIT 100000
> ```
>
> Bu sorgu veritabanının içinde, 1 milyon satırın üstünde, indekslerle koşar;
> uygulamaya 1 milyon değil, diyelim **8.000 eşleşen satır** döner. Üçüncü
> kart (ifade dili) SQL'e çevrilmez — ama artık gerek de yoktur: kalan iki
> kart, bu 8.000 satırlık küçük çerçeve (Frame) üzerinde bellek-içi motorla
> milisaniyeler içinde işlenir. Kaba kuvvet işini (milyonları elemek)
> veritabanı, ince işi (ifade dili, karmaşık kart mantığı) uygulama yapar.
>
> Peki filtre az eleyici olsaydı — eşleşen satır hâlâ milyonlarsa? O zaman
> sorgudaki `LIMIT` devreye girer: uygulamaya en fazla tarama tavanı kadar
> (varsayılan 100 bin) satır gelir. Bellek korunur ama sonuç ilk 100 bin
> satır üzerinden hesaplanır — yanıt bunu, ayrıca çekilen gerçek toplam
> sayıyla birlikte `truncated` (kırpıldı) bayrağıyla dürüstçe bildirir.
> Yani garanti "bellekte hep az veri olur" değil, "bellekteki veri asla
> tavanı aşmaz; aşan kısım varsa kullanıcı bunu bilir" şeklindedir.

**Mercek** (Mercek'ın karşılığı) nesne düşünenler içindir. "Düşman izleri"
diye bir küme kurarsınız, ilişkiler üzerinden gezinir, komşu bilgileri kolon
olarak yanına iliştirir, gruplayıp zaman serisine dökersiniz.

> **Senaryo — "Düşman izlerini kim tespit etti, hangi birliğe bağlılar?":**
> Mercek'te "iz" kümesiyle başlarsınız, sınıflandırması Düşman olanlara
> filtrelersiniz (142 nesne kaldı), "tespit eden sensör" ilişkisinden
> geçersiniz (89 sensör), oradan "takılı olduğu platform"a (61 platform) ve
> son adımda her platformun yanına bağlı olduğu birliğin adını kolon olarak
> iliştirirsiniz (`birlik__ad`). Bu dört adımlık gezinti tek bir sorgu ağacı
> olarak sunucuya gider; gerçek modda ağacın **tamamı** tek SQL'e derlenir
> (ilişki geçişleri yarı-join'e, kolon iliştirme LEFT JOIN'e dönüşür) — ara
> adımlar belleğe hiç uğramaz. Milyonluk tabloda gruplama/sayma da böyledir:
> Mercek'te toplama işlemi (aggregate) veritabanının içinde koşar.

İkisinin de altında aynı ilke yatar: **arayüz asla kendi başına sorgu
yazmaz.** Kurduğunuz zinciri olduğu gibi sunucuya gönderir; sunucu doğrular,
çalıştırır ve sonucu şemasıyla birlikte döner. Yukarıdaki iki senaryoda
görülen iş bölümünün adı **SQL pushdown**dır: ağır eleme işi veritabanında,
karmaşık kart mantığı deneme moduyla **aynı kodda** çalışır — hız artar,
sonuç değişmez.

Bunların yanında üç yardımcı görünüm vardır: her şeyi kapsayan **genel arama**
(yazım hatasına toleranslı), ilişki ağını çizen **bağlantı grafiği** ve canlı
**harita**. Bir de **alarm sistemi**: "son 10 dakikada düşman izi sayısı 5'i
geçerse haber ver" gibi kurallar 15 saniyede bir denetlenir, tetiklenirse
bildirim gider (webhook/e-posta).

## Verim Asistanı: konuşarak analiz

Asistan (AIP karşılığı), sisteme doğal dille soru sormanızı sağlar: *"Ege'de
son bir saatte görülen düşman izlerini domain'e göre grupla."*

Perde arkasında bir yapay zekâ modeli (LLM) çalışır ama başıboş değildir —
eli kolu sıkıca bağlanmıştır:

- Model veriye doğrudan dokunamaz; yalnızca kendisine verilen **10 araç**
  üzerinden istekte bulunabilir (nesne yükle, grupla, zaman serisi, analiz
  kur, alarm kur, haritaya git...).
- Araçlara yazdığı her istek, insan kullanıcıların istekleriyle **aynı
  doğrulama kapısından** geçer. Nesne tipi adları modele kapalı liste olarak
  verilir — var olmayan bir tip uyduramaz.
- Yine de hata yaparsa bir dil denetçisi (linter) tüm yanlışları toplar ve
  "izler mi demek istedin, 'iz' olacaktı" gibi önerilerle geri gönderir;
  model kendini tek turda düzeltir.
- Cevaplar laf değil, **canlı panellerdir**: sohbetin içinde gerçek tablo,
  grafik ve metrikler çizilir; beğendiğiniz paneli tek tıkla kalıcı bir
  Mercek analizine çevirirsiniz — ve analiz kara kutu değildir, açınca
  asistanın kurduğu zinciri adım adım görüp elle düzenleyebilirsiniz.

> **Senaryo — bir sorunun yolculuğu:** Kullanıcı *"Ege'de son bir saatte
> görülen düşman izlerini domain'e göre grupla"* yazar. Model, araçlardan
> `nesne_grupla`yı seçer ama tip adını "izler" diye yazar. İstek motora
> gitmeden dil denetçisine takılır; denetçi tüm hataları toplayıp "belki:
> 'iz'?" önerisiyle modele geri verir. Model ikinci turda doğru sorguyu
> kurar: iz kümesi → Düşman filtresi → son 1 saat penceresi → domain'e göre
> say. Bu sorgu, insan kullanıcının kurduğuyla **aynı kapıdan** (şema
> doğrulaması + motor) geçer ve sonuç sohbetin içine canlı bir bar grafiği
> paneli olarak düşer. Kullanıcı panelin köşesindeki "Mercek'te aç"a basar;
> panel, düzenlenebilir kart zinciriyle kalıcı bir analize dönüşür.

Sistemin yeteneklerini asistana anlatan katalog da elle yazılmış bir metin
değildir; koddaki gerçek yeteneklerden **derlenerek** üretilir. Sisteme yeni
bir kart tipi eklenip asistana anlatılması unutulursa proje derlenmez —
"unutmak" yapısal olarak imkânsızdır.

## Akıl yürütme: tehdit skoru ve hareket tarzı önerisi

Platform veriyi göstermekle kalmaz, üstüne akıl da yürütür — ama burada
bilinçli bir tercih vardır: **bu katmanda yapay zekâ yoktur, kurallar
vardır.** Çünkü askeri bağlamda bir skorun neden verildiği satır satır
açıklanabilir ve aynı girdiyle her zaman aynı sonucu vermesi (deterministik)
gerekir.

- **Tehdit skorlayıcı:** Her izi dört etkene göre 0–100 arası puanlar —
  düşmanlık sınıflandırması, kinematiği (hızlı ve alçak mı uçuyor), dost
  birliklere yakınlığı ve *üzerlerine gidip gitmediği* (rota analizi), bir de
  istihbarat raporlarının teyidi (NATO'nun kaynak güvenilirliği standardı
  STANAG 2511 alanlarıyla). Skorun yanında gerekçe listesi döner: hangi etken
  kaç puan kattı. Ayrı bir servis bu skorları 10 saniyede bir günceller ve
  veritabanına geri yazar (writeback) — ekranlar hazır skoru okur, bekletmez.
- **COA motoru:** En tehlikeli iz için hareket tarzı seçenekleri üretir
  (Etkisiz Hale Getir / Önle / İzle-Takip), her seçeneğe başarı ihtimali ve
  risk biçer, en uygun dost platformu önerir. Ama önce angajman kurallarına
  (ROE) bakar: hedef dostsa saldırı seçeneği asla üretilmez, kimlik şüpheliyse
  kısıtlanır. ROE kuralları da koda gömülü değildir, harekâta göre dışarıdan
  değiştirilir. Ve son karar her zaman insanındır — sistem yalnız önerir.

> **Senaryo — bir izin skorlanması ve önerisi:** IZ-004217 düşman
> sınıflandırmalı; 480 knot süratle alçak irtifada uçuyor ve rotası bir dost
> fırkateynin üzerine doğru; son bir saatte iki SIGINT raporu da bu izle
> korelasyonlu. Skorlayıcı gerekçesini satır satır yazar (örnek): *düşmanlık
> +40 · kinematik +14 (alçak-hızlı profil) · yakınlık +21 (yaklaşıyor) ·
> istihbarat teyidi +12 (2 kaynak)* → skor 87, öncelik: Kritik. On saniyelik
> turda skor veritabanına yazılır; harita izi kırmızı gösterir. Operatör
> "COA öner" der: motor önce angajman kurallarına bakar (hedef düşman, kimlik
> güveni yüksek, korumalı bölge ihlali yok → serbest), dost varlıkları
> puanlar ve üç gerekçeli seçenek döner: *Etkisiz Hale Getir — F-16 çifti,
> başarı ~%78, kesişme 9 dk* · *Önle/Durdur — fırkateyn, ~%64* ·
> *İzle-Takip — her zaman geçerli*. Karar komutanındır.

## Sync Matrix: harekâtın orkestra şefi

Akıl yürütme "şu an hangi tehdit tehlikeli?" sorusunu yanıtlarken, **Sync
Matrix** bir adım öteye geçer: "peki ne, ne zaman, hangi sırayla olacak?" Bu,
Palantir MSS'teki Sync Matrix'in Verim karşılığıdır — bir zaman/kaynak/senaryo
orkestrasyon aracı. Ekran, klasik bir askeri senkronizasyon matrisidir: her
**satır** ontolojideki bir varlık (bir jet, bir konvoy, bir fırkateyn), yatay
eksen **zaman** (H-saatine göre), her **blok** bir görev adımı.

Kritik nokta şu: Sync Matrix bağımsız bir Excel tablosu değildir; **canlı
verinin zaman eksenindeki yansımasıdır.** Satırlar ontolojiden gelir; "elektronik
harp uçağı radarları körleştirmeden jetler taarruza başlayamaz" gibi ön koşullar
bloklar arası **bağımlılık** olur; bir görevi onayladığınızda arkada bir eylem
(Ontology Action) tetiklenir ve ilgili unsura icra emri gider.

**İlk planı kim yapar?** Boş bir tabloyla başlanmaz. Sistem, ilk açılışta
ontolojideki platformlara bakıp **anlamlı bir başlangıç planı türetir**: kara
intikali → keşif → radar körleme (SEAD) → hava taarruzu → deniz desteği → hasar
tespiti (BDA), aralarında doğru ön koşul zincirleriyle. Sonrası operatörün
elindedir: blokları sürükler (bir adım kayınca ona bağlı tüm sonraki adımlar
otomatik ileri kayar), görev ekler, bağımlılık kurar.

Motor, tıpkı akıl yürütme gibi, **deterministiktir** (yapay zekâ değil, klasik
proje-yönetimi matematiği): hangi adımların asla gecikmemesi gerektiğini
**kritik yol analiziyle** (CPM) kırmızı bir hatla gösterir; aynı varlığı iki işe
birden koyarsanız **kaynak çakışması** uyarır; bir bloğu ön koşulundan önceye
koyarsanız **ihlal** der.

> **Senaryo — sahada gecikme:** Konvoy pusuya düşer, 20 dakika rötar yapar.
> Operatör "Kara unsur intikali" bloğunu 20 dk sağa sürükler. Ona bağlı hava
> taarruzu, deniz desteği ve BDA anında ileri kayar; plan bitişi güncellenir;
> kritik yol yeni durumu kırmızıyla gösterir. Operatör bunu doğrudan uygulamak
> yerine önce bir **"ya olursa" (what-if) senaryosu** açıp dener — motor iki
> planı karşılaştırıp "proje bitişi 20 dk kaydı, kritik yol değişti" der; uygun
> bulunursa senaryo **canlı plana terfi** edilir.

Ve en akıcı yanı: bütün bunları **konuşarak** da yapabilirsiniz. Asistana
"B planı diye bir senaryo oluştur ve tüm birimleri 15 dakika geri çek" derseniz,
AIP arka planda Sync Matrix'in aynı deterministik metotlarını çağırır ve yüzlerce
zaman bloğunu saniyede yeniden dizer. Yeni bir tehdit belirdiğinde ise
"sensörden atıcıya" düğmesi, akıl yürütme motorunun COA önerisini alıp plana
otomatik bir angajman görevi ekler — tespit ile angajman planı arasındaki köprü.

## Ontoloji canlı mı? Evet — ama kapılı ve kayıtlı

"Sahadan yeni bir kavram geldi, sisteme *tesis* diye bir nesne tipi eklemek
istiyoruz" — kod yazmadan olur mu? Olur. Verim'de ontoloji iki katmanlıdır:

- **Çekirdek** koddadır ve dokunulmazdır (standarda eşlenmiş, test edilmiş
  omurga).
- **Uzantılar** çalışır durumdaki sisteme dosya olarak (JSON ya da standart
  OWL formatında) yüklenir. Ama doğrudan yayına girmez; beş kademeli bir
  **kabul hattından** geçer: (1) biçimi doğru mu, (2) bağlandığı veri gerçekten
  var mı — kolonlar, tipler, anahtarlar tek tek denetlenir, (3) deneme
  sorgusu gerçekten çalışıyor mu (yayındaki sistemi etkilemeyen geçici bir
  motorda), (4) mevcut analizleri/alarmları kırar mı — kırıyorsa red, (5) insan
  onayı: yükleyen kişi kendi uzantısını onaylayamaz (dört-göz ilkesi).

> **Senaryo — "tesis" tipinin yolculuğu:** Bir analist, tesisleri sisteme
> yeni bir nesne tipi olarak eklemek ister. JSON dosyasını yükler: biçim
> denetimi geçer (kademe 1) ama bağlama denetimi takılır — *"tesis tipinin
> 'kapasite' özelliği, bağlandığı veri kümesinde yok"* (kademe 2). Analist
> kolon adını düzeltip yeniden yükler; bu kez sistem, yayını hiç etkilemeyen
> geçici bir motorda "bir tesis yükle, say" duman testini gerçekten koşar
> (kademe 3) ve hiçbir kayıtlı analizin/alarmın kırılmadığını doğrular
> (kademe 4). Uzantı "doğrulandı" durumuna geçer. Analist kendi uzantısını
> onaylayamaz; yetkili ikinci bir kullanıcı onaylar (kademe 5, dört-göz) ve
> aktifleştirir. O andan itibaren Mercek'te "tesis" kümesi kurulabilir,
> asistan "kaç tesisimiz var?" sorusuna cevap verebilir — hiç kod yazılmadan.
> Bir hafta sonra sorun çıkarsa tek komutla önceki sürüme dönülür; kimin ne
> zaman ne yüklediği denetim defterinde durur.

Onaylanan uzantı aktifleştiğinde sorgu motoru, arama, asistan — hepsi yeni
tipi **kendiliğinden** tanır, çünkü hiçbiri tip adlarını ezberlemez, hepsi
ontolojiye sorar. Her sürüm değişmez olarak saklanır, tek komutla geri
alınabilir (rollback) ve her işlem silinemez bir denetim defterine yazılır
(kim, ne zaman, neyi). Ontoloji ayrıca dünya standardı OWL formatında dışa
aktarılabilir — akademik/NATO araçlarında (ör. Protégé) açılır.

## Güven nereden geliyor?

Sistemin her katmanında aynı ilke tekrarlanır: **tek doğruluk kaynağı, kanıtlı
eşitlik.**

- Deneme verisi bile gerçek tehdit motoruyla skorlanır — iki ayrı hesap yolu
  yoktur.
- SQL'e itilen sorgularla bellekteki sorguların aynı sonucu verdiği otomatik
  testle kanıtlıdır.
- Asistanın örnekleri bile testte gerçek motorda çalıştırılır: sistemin
  yapamadığı bir şeyi vaat edemez.
- Dokuz uçtan uca test senaryosu; uzantı bayrağı kapalıyken sistemin bit-bit
  değişmediği bile ayrıca doğrulanır.

## Verim'i başka bir dünyaya kurmak: fabrika örneği

Peki bu sistem askeriyeye mi mahsus? Hayır — ve bunun nedeni yine priz-fiş
mimarisi. Verim'i bir fabrikaya kurmak isteseniz, sistemin asıl gövdesine
(yaklaşık %80'ine) hiç dokunmazsınız: sorgu motorları, asistan altyapısı,
alarm ve dashboard çerçeveleri, uzantı/onay hattı, arama ve graf katmanları
tip adlarını ezberlemez, ontolojiye sorar. Fabrika kavramları geldiğinde
kendiliğinden çalışırlar.

Değişen, "domain paketi" denebilecek dar bir dilimdir:

- **Kavram sözlüğü (ontoloji çekirdeği):** Birlik/platform/iz yerine makine,
  üretim hattı, iş emri, ürün partisi, vardiya, bakım kaydı, kalite ölçümü
  tanımlanır. (Sensör olduğu gibi kalır!) İlişkiler de aynı yapıdadır: sensör
  makineye takılıdır, makine hatta bağlıdır, iş emri hatta atanmıştır.
- **Veri bağlama:** Fabrikanın zaten var olan sistemlerinin (MES, ERP, SCADA)
  veritabanları üstüne görünümler (view) yazılır ve eşleme dosyası güncellenir.
  Sorgu motoru bu görünümleri otomatik kullanır — tasarım zaten "gerçek kaynak
  geldiğinde sadece eşleme değişir" diye kurulmuştur.
- **Veri kaynakları:** Sensör simülatörlerinin yerini gerçek fabrika akışları
  alır (makinelerden OPC UA / MQTT, ERP olayları). Desen aynıdır: yeni kaynak =
  yeni mesaj kanalı + bir çeviri fonksiyonu. "Bilinmeyen makineyi kaydet, her
  ölçümü geçmişe ekle, son durumu güncelle" kuralı fabrikada da geçerlidir —
  titreşim ve sıcaklık geçmişi, izlerin uçuş geçmişiyle aynı zaman serisi
  altyapısında birikir.
- **Akıl yürütme içeriği:** Tehdit skoru, **arıza risk skoruna** dönüşür
  (etkenler: titreşim/sıcaklık eğilimi, son bakımdan geçen süre, kalite
  sapmaları — yine ağırlıklı, yine gerekçeli, yine deterministik). Hareket
  tarzı önerisi, **bakım önerisine** dönüşür (Durdur ve Bakıma Al / Yükü
  Azalt / İzlemeye Devam); angajman kurallarının yerini üretim kısıtları alır
  — "kritik parti işlenirken hat durdurulamaz", tıpkı "dost hedefe kinetik
  yasak" gibi. Kuralların iskeleti aynen kalır, içeriği değişir.
- **Vitrin:** Sahte demo verisi üreticisi ve varsayılan ekran yeniden yazılır
  (toplam iz yerine üretim verimliliği OEE, düşman iz sayısı yerine duruştaki
  makine sayısı; coğrafi haritanın yerini kat planı alabilir). Birkaç küçük
  ayar daha vardır: alarm penceresinin zaman kolonu, aramanın etiket alanları,
  asistanın örnek cümleleri.

Üstelik kurulum yaşarken "bir de tedarikçi tipi ekleyelim" dendiğinde bunun
için kod bile gerekmez — yeni tip, çalışan sisteme ontoloji uzantısı olarak
(onay hattından geçerek) yüklenir. Tek cümleyle: **domain paketi değişir,
platform değişmez.**

### Tam olarak hangi dosyalar değişir?

Merak edenler için dosya dosya liste (parantezde ne işe yaradığı):

| Dosya | Fabrikada ne olur |
|---|---|
| `src/ontology/dummy-ontology-provider.ts` | Demo çekirdek ontolojisi — makine/hat/iş emri tipleriyle yeniden yazılır |
| `src/mim/mim-ontology.ts` | Gerçek kaynağa eşlemeli ontoloji — MIM yerine MES/ERP alanlarına eşlenir |
| `src/mim/mim-mapping.ts` | Dataset ↔ görünüm (view) eşlemesi — fabrika görünümlerine çevrilir |
| `db/schema.sql` + `db/views.sql` | Ara depolama şeması ve görünümler — fabrika veri modeline uyarlanır |
| `src/datasets/dummy/generators.ts` | Sahte demo verisi — fabrika verisi üretecek şekilde yazılır |
| `src/ingest/producer-*.ts` + `ingest-service.ts`'e parse fonksiyonu | Kaynak bağlayıcıları — sensör simülatörü yerine OPC UA / MQTT / ERP akışları |
| `src/ingest/normalize.ts` | Sağlık kuralları — koordinat sınırları yerine ölçüm sınırları |
| `src/reasoning/threat-scorer.ts` | Skor içeriği — tehdit etkenleri yerine arıza risk etkenleri |
| `src/reasoning/coa-engine.ts` | Öneri içeriği — angajman yerine bakım seçenekleri, ROE yerine üretim kısıtları |
| `src/reasoning/reasoning.service.ts` + `reasoning-enricher.ts` | Ontoloji↔motor köprüsü ve skor yazıcı — yeni tip/kolon adlarıyla |
| `src/dashboards/sistem-dashboard.ts` | Varsayılan ekran — OEE, duruş sayısı, kat planı |
| İnce ayarlar | `alerts.service.ts` (pencere zaman kolonu), `search-provider.ts` (etiket alanları), `search-load.ts` (indekslenecek tipler), `assistant.service.ts` (örnek cümleler), `tool-schemas.ts` (harita sınıflandırma listesi), `graph-load.ts` (varlık listesi), `seed.ts`, `docker-compose.yml` |
| Frontend (`apps/client`) | Ekran adları, ikonlar, harita→kat planı — yapısal değil kozmetik |

Değişmeyen dosyaların listesi çok daha uzun: sözleşme katmanının tamamı,
iki sorgu motoru, object-set motoru, ifade dili, uzantı/kabul/yönetişim
hattı, OWL çevirileri, alarm ve dashboard çerçeveleri, asistan altyapısı,
depolar, auth.

### Fabrikada hangi veritabanları gerekir?

Zorunlu olan tek şey **bir ilişkisel veritabanıdır** (PostgreSQL önerilir;
ölçüm geçmişi büyükse TimescaleDB eklentisi bedava kazanım). Gerisi
opsiyoneldir, çünkü her birinin sistem içinde yedeği vardır:

- **Arama motoru (OpenSearch):** İstenirse; yoksa bellek-içi arama devreye girer.
- **Graf veritabanı (Neo4j):** Bağlantı analizi istenirse; yoksa bellek-içi
  komşuluk indeksi çalışır.
- **Mesaj omurgası (Kafka/Redpanda):** Canlı saniyelik akış istenirse; toplu
  aktarım (gece ETL'i) yeterliyse gerekmez.
- **Belge deposu:** Kayıtlı analizler için düz disk yeter (bulutta GCS).
- **Yapay zekâ anahtarı (OpenAI):** Asistan istenirse; yoksa asistan kibarca
  kapanır, sistemin geri kalanı tam çalışır.

Hatta hiçbir veritabanı olmadan da (deneme modu, bellek-içi) tüm arayüz
çalışır — satış öncesi demo için bilerek böyle tasarlanmıştır.

## Nasıl çalıştırılıyor?

Tek makinede `docker compose up` ile tüm yığın kalkar: veritabanı, mesaj
omurgası, üç kaynak simülatörü, toplayıcı, akıl yürütme servisi, graf ve arama
motorları ve uygulamanın kendisi. Aynı düzen bulutta da (Google Cloud Run)
çalışır; hatta demo adresi, açık bir tünel üzerinden herhangi bir geliştirici
makinesindeki lokal sisteme şeffafça bağlanabilir. Kapalı ağ (on-prem)
dağıtımının temeli de aynı compose dosyasıdır — sistemde buluta mecbur tek
bir parça yoktur.

## Teknik merak edenler için: soru-cevap

### "View" (görünüm) nedir?

Veritabanına kaydedilmiş, tablo gibi görünen bir sorgudur — **sanal tablo**.
Veriyi kopyalamaz; her okunduğunda altındaki gerçek tablolardan hesaplanır.
Verim'de `v_iz`, `v_birlik` gibi görünümler, standart veri modelinin (MIM)
dağınık tablolarını birleştirip kolonları tam Verim'in beklediği adlarla
sunar. Görünümün güzelliği bir **uyum sınırı** olmasıdır: yarın veri başka
bir sistemden gelse, değişen şey uygulama kodu değil, bu görünüm tanımlarıdır.

### Eşdeğerlik testi çalışma anında mı koşar?

Hayır. Eşdeğerlik denetimi (`equivalence-check`) bir **geliştirme ve kabul
aracıdır**: geliştirici ya da otomatik test hattı (CI) elle çalıştırır, aynı
sorguları iki motorda koşturup sonuçları karşılaştırır, fark varsa hata
koduyla durur. Canlı sistemde hiçbir sorgu iki kez çalıştırılmaz — bu maliyet
olurdu. Çalışma anındaki güvence iki şeyden gelir: bu eşitliğin bir kez
kanıtlanmış olması ve iki yolun zaten **aynı kod çekirdeğini paylaşması**
(SQL yolu, kalan adımları bellek-içi motorun doğrulanmış koduna devreder).

### SQL pushdown tam olarak nedir?

"İşi veriye götürmek." Saf yaklaşım şöyle olurdu: 1 milyon satırı
veritabanından uygulamaya çek, orada filtrele — ağ ve bellek israfı.
Pushdown'da tersi yapılır: kullanıcının kurduğu sorgu zinciri **SQL'e
derlenir** ve veritabanının içinde çalışır; uygulamaya yalnız eşleşen
satırlar döner (Harman bölümündeki senaryoda adım adım görülüyor).
Mercek'te sorgu ağacının tamamı itilir (ilişki gezintisi ve gruplama
dahil); Harman'da zincirin baştaki filtre kısmı itilir, kalan kartlar
bellek-içi motorun aynı koduyla — ama çoktan küçülmüş veri üzerinde —
işlenir. "Bellek-içi" hiçbir zaman "milyonlarca satır bellekte" demek
değildir: itilecek filtre hiç yoksa bile tarama tavanı devreye girer.

### Tarama tavanı (MIP_SCAN_LIMIT) sonuçların doğruluğunu etkiler mi?

Dürüst cevap: **etkileyebilir — ve sistem bunu saklamaz.** Harman'da SQL'e
itilemeyen kartlar, veritabanından en fazla tavan kadar satır (varsayılan
100 bin, birincil anahtar sırasıyla) çekilerek işlenir. Eşleşen satır sayısı
tavanın altındaysa sonuç kesindir. Üstündeyse hesap yalnız ilk 100 bin satır
üzerinden yapılır: histogram sayıları, ortalamalar o alt kümeyi yansıtır —
tavanı 500 bine çıkarırsanız rakamlar değişebilir. Üç güvence bunu yönetir:
(1) sonuç **kırpıldı bayrağı** (`truncated`) ve gerçek toplam eşleşme
sayısıyla döner — kullanıcı "1 milyonun 100 binine bakıyorum" olduğunu bilir;
(2) satırlar hep aynı sırayla çekildiği için sonuç rastgele değil,
**tekrarlanabilirdir** (aynı tavan → hep aynı rakam); (3) tam kesinlik
gereken yollar tavana hiç uğramaz — Mercek'in gruplama/sayma işlemleri
bütünüyle veritabanında, TÜM satırlar üzerinde koşar; alarmlar ve asistan da
bu yolu kullanır. Tavana takılan Harman analizi için çözüm bellidir: zincirin
başına eleyici filtre koymak, ara sonucu dataset olarak kaydetmek ya da
tavanı donanıma göre yükseltmek.

### Neden SQL olmak zorunda? Zorunda değil.

Sistemin veriyle konuştuğu yer soyut bir arayüzdür (port); SQL yalnızca bu
arayüzün bir gerçeklemesidir. Kanıtı sistemin kendisinde: deneme modunda
hiçbir veritabanı yokken aynı API bit-bit aynı cevabı verir. SQL'in tercih
edilme sebepleri pragmatiktir: kurumsal ve askeri veri dünyasının ortak dili
ilişkiseldir (MIP replikasyonu da ilişkiseldir), teknoloji olgundur,
görünüm (view) kavramı temiz bir uyum sınırı sunar ve filtrele/grupla/birleştir
tipi küme işlemleri SQL'e doğal oturur.

### Peki bütün veri bir graf veritabanında dursaydı?

Kazanç: çok adımlı ilişki gezintisi ("izden sensöre, oradan birliğe")
veritabanının ana dili olurdu. Ama kayıplar ağır basar:

- **Tablo tipi toplu analitik** (histogram, pivot, milyonlarca satırda
  gruplama) graf veritabanlarının zayıf alanıdır — Harman'ın işi tam budur.
- **Yüksek hacimli zaman serisi** (saniyede onlarca gözlemin yıllarca
  birikmesi) ilişkisel dünyanın kaslarıyla yönetilir: bölümleme (hypertable),
  tekrar-engelleme indeksi, toplu ekleme. Graf tarafında bunların karşılığı
  cılızdır.
- **Görünüm katmanı kaybolur** — graf veritabanlarında view kavramı yoktur;
  uyum sınırı koda taşınırdı.
- SQL üreten motorlar graf sorgu diline (Cypher) yeniden yazılırdı; tam metin
  arama için yine ayrı bir motor gerekirdi.

Verim'in cevabı zaten "ya biri ya öteki" değil, **çok depolu yaklaşımdır**
(polyglot persistence): her depo en iyi olduğu işte kullanılır — tablo ve
zaman serisi ilişkiselde, bağlantı analizi grafta, bulanık arama arama
motorunda. Hatta iz telemetrisi bilinçli olarak grafa **konmaz**; graf yalnız
varlık ağını tutar (varlık ağı ≠ telemetri deposu ilkesi).

## Teknoloji yığını (tech stack)

| Katman | Teknoloji |
|---|---|
| Dil / çalışma zamanı | TypeScript, Node.js ≥ 20 |
| Sunucu çatısı | NestJS 11 (Express üstünde), Swagger/OpenAPI belgeleri (`/docs`) |
| Doğrulama | Zod 4 (sözleşme şemaları — API belgeleri de bundan türetilir) |
| Arayüz | React 19 + Vite 8 (monorepo içinde apps/client; üretimde aynı adresten sunulur) |
| Ana veritabanı | PostgreSQL 17 + TimescaleDB (zaman serisi eklentisi, opsiyonel) |
| Mesaj omurgası | Redpanda (Kafka uyumlu) — kafkajs istemcisi, snappy sıkıştırma |
| Graf veritabanı | Neo4j (bolt protokolü) |
| Arama motoru | OpenSearch (bulanık/tam-metin arama) |
| Yapay zekâ | OpenAI SDK (varsayılan gpt-4o; `ASSISTANT_MODEL` ile değiştirilebilir) |
| Format çevirileri | fast-xml-parser (NATO tarzı XML), n3 (OWL/Turtle), faker (deterministik demo verisi) |
| Belge kalıcılığı | Yerel disk (`.data/`) veya Google Cloud Storage |
| Bildirimler | Webhook (Slack/Teams uyumlu) + nodemailer (SMTP e-posta) |
| Test | Jest 30 + supertest (9 uçtan uca senaryo + birim testleri) |
| Kod kalitesi | ESLint 9, Prettier |
| Dağıtım | Docker Compose (lokal/kapalı ağ), Google Cloud Run (bulut), cloudflared tüneli (demo) |

## Sistemin bilinen kısıtları

Dürüst bir mühendislik anlatımı sınırları da söyler:

- **Satır tavanları:** Harman'ın bellek-içi motoru tabloları en fazla 100 bin
  satırla çeker (`MIP_SCAN_LIMIT`, ayarlanabilir); sorgu yanıtı en çok 10 bin
  satır, Mercek yüklemesi 5 bin nesne, gruplama 500 grup, özet tablo 100
  kolonla sınırlıdır. Bunlar keyfî değil, arayüzü korumak için konmuş bilinçli
  tavanlardır — ama "sınırsız" da değildir.
- **Kolon tip sistemi kapalıdır:** 6 tip vardır (metin, tam sayı, ondalık,
  doğru/yanlış, tarih, zaman damgası); yeni tip kod değişikliği ister.
- **Uzantı kuralları:** Aynı anda tek aktif uzantı sürümü olur; uzantı
  çekirdeği değiştiremez, yalnız ekler; her uzantı tipi var olan bir veri
  kümesine bağlanmak zorundadır; uzantı aktifleşince arama ve graf indeksleri
  elle tazelenir.
- **Alarmlar anlık değildir:** Kurallar 15 saniyede bir denetlenir (polling);
  olay listesi bellekte tutulur (son 500), sunucu yeniden başlarsa olay
  geçmişi gider (kurallar ise kalıcıdır).
- **Kimlik doğrulama demo düzeyindedir:** Sabit kullanıcı/parola + rol
  sistemi vardır; gerçek kurumsal kimlik sağlayıcı (LDAP/SSO) entegrasyonu
  yapılmamıştır. Arama ve akıl yürütme uçları şu an kimlik istemez.
- **Asistan dışarıya bağımlıdır:** OpenAI hizmetine internet erişimi ister;
  kapalı ağda yerel bir dil modeli ucuna yönlendirilmesi gerekir (tek nokta
  değişikliği — istemci adresi).
- **Çift repo senkronu elle yürür:** Arayüz ile sunucunun ortak tip dosyaları
  iki repoda elle eş tutulur; sapmayı derleyici değil testler yakalar.
- **Tek kopya varsayımı:** Türetilmiş veri kümeleri ve alarm olayları bellekte
  tutulduğundan, sunucunun çoklu kopyayla yatay ölçeklenmesi paylaşımlı bir
  depo eklenmesini gerektirir.

## Tek cümlelik özet

Verim; dağınık ve sürekli akan harekât verisini ortak bir kavram diline
(ontoloji) oturtan, bu dil üzerinde tıklayarak ya da konuşarak analiz
yaptıran, tehdidi açıklanabilir kurallarla puanlayıp hareket tarzı öneren ve
tüm bunları herhangi bir veritabanına/kaynağa takılabilir sökülebilir bir
mimariyle yapan bir veri platformudur.
