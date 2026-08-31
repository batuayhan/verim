# Sync Matrix — Kullanım Kılavuzu

**Rota:** `/senkron` · üst menüde **Sync Matrix**

Sync Matrix, harekâtın **zaman/kaynak/senaryo orkestrasyon** aracıdır: hangi
varlık, neyi, ne zaman, hangi sırayla yapacak — tek ekranda planlanır, izlenir
ve komuta edilir. Palantir MSS'teki Sync Matrix'in Verim karşılığıdır; satırlar
ontolojiden gelir, motor deterministiktir (LLM değil — her sonuç açıklanabilir
ve aynı girdiyle hep aynıdır).

---

## 1. Ekran anatomisi — Komuta Konsolu

Sayfa tek ekrandır (kaydırma yok); matris sayfanın kendisidir:

```
┌─ Sync Matrix ─────────────────────────────── [WHAT-IF rozeti] ─┐
│ ╔═ BAŞLIK ÇUBUĞU ══════════════════════════════════════════╗  │
│ ║ Plan▾ · H=23/07 23:08 · What-if ┊ +Görev ⋯ [Deniz][Hava] ║  │
│ ║ [Kara]                    ┊karantina┊ Tehdit izi▾ ANGAJE  ║  │
│ ╠═ KANVAS (iç kaydırma; cetvel+başlıklar yapışkan) ════════╣  │
│ ║  cetvel H±/UTC              [⊖⊕⛶ D ? ↶↷] ← kontrol kümesi ║  │
│ ║  ▼ HAVA (4)  bloklar · oklar · ŞİMDİ · playhead           ║  │
│ ╠═ DURUM ÇUBUĞU ═══════════════════════════════════════════╣  │
│ ║ H+7:20 Bitiş 10 Görev 1 Kritik 0 İhlal │ ▶──●── ● CANLI  ║  │
│ ╠═ KRİTİK YOL: SEAD → Taarruz → BDA (Kritik rozeti kapatır) ╣  │
│ ╚══════════════════════════════════════════════════════════╝  │
│ ✨ Asistana söyle… (AIP dock — örnekler odakta, cevap üstte)   │
└────────────────────────────────────────────────────────────────┘
```

- **Başlık çubuğu** = plan bağlamı + eylemler. Domain çipleri hem **filtre hem
  lejant** (domain renginde). Sağdaki ayrılmış bölge **karantina**: Angaje
  çerçevedeki tek kırmızı düğmedir (yanlış tık koruması).
- **Durum çubuğu** = KPI rozetleri (İhlal/Çakışma rozetine tıkla → mesajlar +
  asistan önerileri) · playback aktarımı · tur modunda renk anahtarı.
- **AIP dock** = alt komut satırı; cevap sayfayı itmez, üstte yüzer.

- **Satır** = ontoloji varlığı (platform/birlik); soldaki renk şeridi domain'i
  gösterir. Varlık adına tıkla → Mercek tarzı sonsuz-ilişki **nesne detayı**.
- **Blok** = görev adımı. İkonlar: ⚡ elektronik harp · 👁 keşif · ▣ görev ·
  ✜ angajman · ⛽ lojistik · → intikal · ◆ kilometre taşı (süresiz karar noktası).
- **Ok** = bağımlılık. Düz ok = "bitince başla" (FS), **kesik ok** = "birlikte
  başla" (SS). **Kırmızı ok/çerçeve** = kritik yol.
- **Kırmızı dikey çizgi (ŞİMDİ)** = H-saatine göre şu an; canlı ilerler.
- **Taralı blok** = gecikmiş · **soluk** = iptal · **çift tik** = tamamlandı ·
  **turuncu kesik çerçeve + ⚠** = kaynak çakışması.
- Aynı varlığın zamanı çakışan görevleri **alt şeritlerde** üst üste binmeden
  gösterilir (satır otomatik yükselir).

## 2. Kavram Sözlüğü (Terminoloji)

Ders başlamadan dil birliği — tüm ekran bu terimlerle konuşur:

| Kavram | Anlamı |
|---|---|
| **H-saati** | Harekâtın referans anı (H = 0). Tüm zamanlar H±dakikadır: `H+0:30` = H'den 30 dk sonra. Araç çubuğundaki **🕐 H** düğmesiyle ayarlanır. |
| **DTG / Zulu (Z)** | Cetvelin ikinci satırındaki duvar saati, UTC ("22:30Z"). Farklı saat dilimlerindeki karargâhlar aynı anı aynı görür. |
| **Gecikme (lag) / Öne alma (lead)** | Bağa eklenen kayma: "+5 dk" = öncül bittikten 5 dk sonra; "−15 dk" = bitişinden 15 dk önce (örtüşmeye izin verir). |
| **CPM** | Critical Path Method — kritik yolu ve bollukları hesaplayan deterministik algoritma. |
| **COA** | Course of Action (hareket tarzı) — akıl yürütme motorunun ROE-uyumlu angajman seçenekleri. |
| **ROE** | Rules of Engagement (angajman kuralları) — kim, hangi koşulda ateş serbestisine sahip. |
| **Ontology Action** | Ekrandaki onayın sahaya inen karşılığı: görev onaylanınca icra emri writeback ile ilgili unsura iletilir. |
| **Baz plan / Terfi** | What-if senaryosunun dallandığı dondurulmuş kopya; beğenilen senaryo canlının yerine "terfi" ettirilir. |
| **Sensörden-atıcıya** | Tespit edilen tehdidin COA motoru üzerinden plana otomatik angajman görevi olarak inmesi. |
| **AIP** | Doğal-dil komut katmanı — planı konuşarak düzenlersin; hesap yine deterministik motorda. |
| **Zamanlama bağı — Bitince başlar (FS)** | Ön koşul: "X bitmeden Y başlayamaz" — ör. SEAD bitmeden taarruz başlamaz. Gecikme (lag) eklenebilir: "bitiminden +5 dk sonra". |
| **Zamanlama bağı — Birlikte başlar (SS)** | Eş zamanlı başlama (senkronizasyon; ön koşul DEĞİLDİR). |
| **Kritik yol** | Gecikirse TÜM operasyonu geciktiren zincir. Kırmızıyla çizilir; alttaki şeritte sıralı listelenir. |
| **Bolluk (slack)** | Bir görevin, plan bitişini etkilemeden ne kadar gecikebileceği. Bloğun üzerine gel → tooltip'te. |
| **Bağımlılık ihlali** | Bir görevi ön koşulundan ÖNCEYE koyduysan sarı uyarı çıkar (engellenmez — operatör bilinçli risk alabilir). |
| **Kaynak çakışması** | Aynı varlık aynı anda iki görevde — fiziksel imkânsızlık. Turuncu vurgulanır ve KPI'da sayılır. |

## 2b. Görev kartı — taktik alanlar (ATO/OPORD karşılıkları)

Her görev bloğu zamanın ötesinde bir **taktik kart** taşır (tooltip'te özet,
çekmecede "TAKTİK KART" bölümünde düzenlenir; asistan da doğal dille doldurur):

| Alan | Doktrin karşılığı | Nerede görünür |
|---|---|---|
| **Görev no** (SEAD-301) | ATO mission number — türe göre önek, otomatik üretilir | Tooltip başlığı, harita etiketi |
| **Çağrı adı** | Callsign (PARS, ŞAHİN) | Tooltip 📻 satırı |
| **Öncelik P1–P5** | Precedence — P1 en yüksek (tehdit kaynaklı angajman doğuştan P1) | Tooltip çipi (P1/P2 kırmızı) |
| **İstenen etki** | Desired effect (JP 3-60): imha/etkisizleştir/baskıla/tespit/koru/aldat | Tooltip çipi |
| **Konum** (enlem/boylam) | Görev icra noktası — CAP istasyonu, devriye merkezi | Haritada görev noktası (varlık konumunun yerine geçer) |
| **Bölge yarıçapı (km)** | Görev koordinasyon alanı — killbox/ROZ benzeri | Haritada kesikli mavi çember (lejant: ⬡ koordinasyon alanı) |
| **Hedef koordinatı** | Sabit hedef (DMPI benzeri) — canlı iz hedefine (hedefIz) alternatif | Haritada sarı halkalı hedef + atıcı→hedef rotası |
| **Kontrol makamı** | C2 ajansı: AWACS/CRC/JTAC/HRK MRK | Tooltip 📻 satırı |
| **Frekans** | Muhabere kanalı (251.750 UHF) | Tooltip 📻 satırı |
| **Mühimmat** | Ordnance/faydalı yük (4× PGB + 2× A/A) | Tooltip ⚙ satırı |

Hepsi opsiyoneldir — boş alan kartı kirletmez. Sensörden-atıcıya görevleri
doğuştan zengin gelir (P1 · imha · COA'nın angajman tipi mühimmat olarak).
Asistan örneği: *"MSN-401'in hedef koordinatını 41.2, 36.5 yap, önceliği P1"*.

## 3. Canlı plan, senaryo ve görev durumları — zihinsel model

### Canlı plan nedir, neden önemli?
**Canlı plan = harekâtın tek resmî gerçeği.** Haritadaki katman, sensörden-atıcıya
görevleri, asistanın bağlamı, onay/icra emirleri — hepsi bu tek plana bakar.
Karargâhtaki herkes aynı resmi görür (3 sn'de bir tazelenir); "kimde hangi
sürüm var" sorunu yoktur. Doktrindeki karşılığı yürürlükteki OPORD'dur.

### Canlı plan üzerinde doğrudan düzenleme doğru mu?
İkisi de meşru, amaçları farklı:

| Durum | Doğru yol |
|---|---|
| **İcra anı gerçeği** — konvoy rötar yaptı, görev tamamlandı, acil angajman | **Doğrudan canlıda** düzenle: gerçek DEĞİŞTİ, plan gerçeğe uydurulur. Zincirleme kaydırma + Ctrl+Z güvenlik ağıdır. |
| **Tasarlanmış değişiklik** — "taarruzu 1 saat erteleyelim mi?" gibi HENÜZ karar verilmemiş fikir | **What-if senaryosunda** dene → "Farkı gör" → uygunsa **Canlıya terfi**. Canlı resim, fikir jimnastiğinden etkilenmez. |

Kısa kural: **olan** canlıya işlenir, **olabilecek** senaryoda denenir.

### Görev durumları (yaşam döngüsü)
Bir görev şu çizgide ilerler — durumu sağ-tık menüsü/çekmece değiştirir:

| Durum | Anlamı | Kim/nasıl |
|---|---|---|
| **Planlı** | Taslak: planda var, icra yetkisi YOK. Varsayılan. | Görev oluşturulunca. |
| **Onaylı ✓** | Komutan onayı verildi → **icra emri sahaya iletildi** (Ontology Action). Artık taahhüttür. | Sağ-tık → Onayla (iki aşamalı). |
| **İcrada ▶** | Unsur görevi fiilen yürütüyor. | İcra başlayınca operatör işaretler. |
| **Tamam ✔✔** | Bitti; grileşir, zincirleme kaydırmalardan artık etkilenmez. | İcra bitince. |
| **Gecikme ⬚** | Öncülü kaydığı için OTOMATİK ötelendi (taralı görünür) — "yeniden değerlendir" bayrağıdır; onay durumunu değiştirmez. | Motor, zincirleme kaydırmada. |
| **İptal ∅** | Vazgeçildi; soluklaşır, CPM/çakışma hesaplarından çıkar. | Operatör/AIP. |

Önemli ayrım: **Planlı→Onaylı** sınırı "fikir"le "emir" arasındaki çizgidir —
bu yüzden onay iki aşamalıdır ve gecikme yayılımı onaylı görevi kendiliğinden
onaysıza düşürmez (yalnız gecikme bayrağı basar; kararı insan verir).

## 4. Günlük kullanım

### Planı okumak
Üstteki KPI şeridi: **Plan bitişi** (son görevin bitişi), **Görev** sayısı,
**Kritik adım** (sıfır-bolluklu görev sayısı), **ihlal** ve **çakışma** sayıları.
Sıfır olmayan ihlal/çakışma altta sarı uyarı bandı açar.

### Bir görevi yeniden zamanlamak (dinamik kaydırma)
Bloğu **fareyle sürükle** (5 dk adımlara yuvarlanır) veya bloğu seçip
**← / → ok tuşları** (±5 dk). Sürüklerken **zincir CANLI önizlenir**: bağlı
adımlar mavi kesik çerçeveyle birlikte akar, bloğun üstündeki mavi rozet
"Δ +20 dk · 3 adım birlikte kayar" der — bırakmadan sonucu görürsün.
**Esc** ile vazgeç (blok eski yerine döner). Bıraktığın an hesap sunucuda
(otorite) yapılır ve plan kaydedilir. Kaydırma yalnız İLERİ yayılır (erken
çekiş bağlıları geri çekmez) ve tamamlanmış/iptal görevlere dokunmaz.

### Grafik-içi yetenekler (her şey kanvasta)
Sayfada gezinmeden, doğrudan bloklar üzerinde:

| Etkileşim | Ne yapar |
|---|---|
| **Üzerine gel (hover)** | Zengin kart tooltip: zaman aralığı+DTG, durum/varlık/kritiklik çipleri, **öncül ⬅ / ardıl ➡ görev adları**, gerekçe — tek bakışta bağlam. Ayrıca imlecin altında tüm satırları kesen **zaman kılavuzu** (H±/UTC okumalı) belirir; bağımlılık zinciri aydınlanır. |
| **Sağ tık** | Bağlam menüsü: **Onayla** (iki aşamalı — "Emin misin?" yanlış tık koruması), İcraya al, Tamamlandı, İptal, Bağımlılık başlat, Düzenle, Sil. |
| **Sağ kenarı çek** | Süreyi boyutlandır (5 dk adım; küçük bloklarda önce seç). |
| **⭘ port → hedef blok** | Zamanlama bağı kur: bloğun sağındaki halkaya tıkla, sonra hedef bloğun herhangi bir yerine tıkla (Esc/boş alan: iptal). |
| **Oka tıkla** | Bağ menüsü: türü çevir (Bitince↔Birlikte başlar), gecikme ±5 dk, **kaldır** — yerinde düzenleme. |
| **Ctrl+tekerlek** | Zaman ekseninde yakınlaş/uzaklaş. |
| **Space + sürükle / orta tuş / ✋ düğmesi** | **Pan**: kanvası tutup kaydır (tasarım aracı deseni). Space basılıyken imleç ✊'a döner; kontrol kümesindeki **✋** düğmesi kalıcı pan modunu açar; orta tuş her an çalışır. Pan sırasında blok sürüklemesi başlamaz (kazara plan mutasyonu engellenir). |
| **⠿ grip** | Satır etiketinin sağındaki tutamaç — satırı aynı bölümde yukarı/aşağı taşı (taşınabilirlik göstergesi). |

### Görev detayı ve düzenleme (çekmece)
Bloğa **tıkla** → sağ çekmece: ad/tür/varlık/başlangıç/süre düzenle, **Sil**,
CPM bilgisi (erken/geç başlangıç, bolluk, kritiklik) ve **ön koşullar** —
buradan da bağımlılık **kur/kaldır** (döngü yaratan bağımlılık reddedilir).

### Yeni görev
Araç çubuğunda **+ GÖREV** → ad, tür, varlık (ontolojiden açılır liste),
başlangıç, süre.

### Onay — Ontology Action
Çekmecedeki **Onayla** düğmesi (onay diyaloğu ile) görevi `onaylı` yapar ve
**icra emrini ilgili unsura iletir** (writeback). *İcraya al → Tamamlandı*
akışıyla durum sahadan güncellenir. Onaylı görev bloğunda ✓ görünür.

### Toplu kaydırma
**−15DK TÜMÜ / +15DK TÜMÜ** düğmeleri tüm planı kaydırır (AIP ile domain'e
özel de yapılabilir: "hava görevlerini 10 dk ileri al").

### Geri al / ileri al (undo-redo)
Her değişiklik (kaydırma, ekleme/silme, durum, toplu kaydırma, hatta **terfi**)
öncesi anlık görüntü alınır. ↶/↷ düğmeleri veya **Ctrl+Z / Ctrl+Shift+Z**
(Ctrl+Y) ile 25 adıma kadar geri-ileri gidilir. Yanlış terfi tek tuşla döner.
(Not: geçmiş sunucu belleğindedir — sunucu yeniden başlarsa sıfırlanır.)

### Satırları taşıma (sürükle-bırak)
Soldaki **varlık etiketini** tut ve aynı bölüm (domain) içinde yukarı/aşağı
taşı — mavi çizgi bırakma yerini gösterir; sıralama planla birlikte kaydedilir.

## 4. What-if (senaryo) akışı

1. **WHAT-IF** düğmesi → canlı planın o anki kopyası bir **senaryo dalı** olur
   ve baz plan **dondurulur** (sonraki canlı değişiklikler farkı kirletmez).
   Plan seçici otomatik senaryoya geçer; turuncu "WHAT-IF SENARYO" rozeti çıkar.
2. Senaryo üzerinde her şeyi dene — canlı plan etkilenmez.
3. **Farkı gör** → proje bitişi kaç dk kaydı, kaç değişiklik, **kritik yol
   değişti mi**.
4. **Baz overlay** → değişen blokların dallanma anındaki konumları haritada
   kesikli **hayalet** olarak çizilir (ne kadar oynattığını görürsün).
5. Beğendiysen **Canlıya terfi** (onay diyaloğu ile) → senaryo canlı planın
   yerine yazılır. Vazgeçtiysen 🗑️ ile sil, seçiciden 🟢 Canlı Plan'a dön.

## 5. Sensörden-atıcıya

Sağ üstte **Tehdit izi** listesinden bir iz seç (Karar Destek'in tehdit
skorlarıyla sıralı) → **ANGAJE**. COA motoru en uygun varlığı, kesişme süresini
ve başarı ihtimalini hesaplar; plana ✜ **angajman görevi** olarak ŞİMDİ'ye
ekler (gerekçesinde ROE durumu + öneri + başarı % yazar). Tespit → angajman
planı köprüsü tek tıktır.

## 6. AIP — doğal dille plan düzenleme

Üstteki ✨ kutusuna Türkçe yaz → asistan planı **aynı deterministik motorla**
değiştirir (LLM yalnız komutu çözümler; hesap motorundadır). Kutunun altındaki
**örnek çipler** tıklanınca kutuya dolar — düzenleyip UYGULA'ya bas.

| Söyle | Ne olur |
|---|---|
| "Tüm birimleri 15 dakika geri çek" | Tüm plan −15 dk kayar |
| "Hava görevlerini 10 dk ileri al" | Yalnız Hava domain'i +10 dk |
| "SEAD görevini onayla" | Görev adıyla bulunur → onaylı + icra emri |
| "BDA görevini H+90'a taşı" | Görev o zamana kayar, bağlılar zincirlenir |
| "45 dakikalık yeni bir keşif görevi ekle" | Yeni 👁 görev eklenir |
| "B planı adında bir what-if senaryosu oluştur" | Senaryo dalı açılır |
| "Planı oku ve kritik yolu özetle" | Asistan planı okuyup özetler |
| "En tehlikeli iz için angajman görevi ekle" | Sensörden-atıcıya akışı |
| "Deniz füze desteğini iptal et" | Görev durumu iptal olur |
| *(senaryodayken)* "Senaryoyu canlı plana terfi ettir" | Terfi |

Görevlere **id yerine adıyla** hitap edebilirsin — asistan isimden çözer;
emin değilse önce planı okur. Senaryo görüntülerken verdiğin komutlar o
senaryoya uygulanır (canlıya değil).

**Bağlam farkındalığı:** `/senkron`'dayken asistan güncel planın özetini
(görevler, kritik yol, ihlaller, çakışmalar) otomatik görür — önerileri canlı
veriye dayanır. Kutunun altındaki **turuncu çipler** plandan türetilen
proaktif önerilerdir (ör. "ATMACA-34 üzerindeki çakışmayı çöz"). Asistan
cevabı **Markdown** ise (liste/tablo/başlık) o biçimde görüntülenir.

## 7. Görünüm kontrolleri

- **Domain çipleri** — tıkla: o domain'in satırları gizlenir/gösterilir
  (CPM tam plandan hesaplanmaya devam eder).
- **Bölümler (Kairos sections)** — soldaki domain başlığına tıkla → o bölüm
  katlanır/açılır (▼/▶).
- **Kanvas kontrol çubuğu (sağ üst)** — zoom ⊖/⊕, ⛶ sığdır ve ↶/↷ geri-ileri
  artık grafiğin KENDİ köşesinde (bileşen nereye gömülürse oraya taşınır —
  haritadaki mini matriste de aynı kontroller).
- **Playback takibi** — imleç oynarken görünüm bandın dışına çıkınca kaydırma
  otomatik izler (timeline editör davranışı); elle kaydırmayla kavga etmez.
- **Optimistik sürükleme** — bloğu bıraktığında zinciriyle birlikte ANINDA yeni
  yerinde kalır; sunucu reddeder/hata verirse eski konumuna döner ve hata
  bildirimi görünür.
- **Renk modu: Domain | Görev tipi** — Kairos tarzı görev-tipi renkleri
  (Angajman=kırmızı, Keşif/ISR=sarı, EW=mor, İntikal=mavi, Lojistik=yeşil);
  lejant otomatik güncellenir.
- **Çift cetvel** — H± satırının altında duvar saati (UTC, `hh:mmZ`).
- **Varlık adına tıkla** — nesne detayı (ilişkileriyle sonsuz gezinme).
- **Kritik yol şeridi** — çipe tıkla → o görevin çekmecesi açılır.

## 7a. Playback (zamanda oynatma)

Araç çubuğundaki **PLAYBACK** satırı: ▶ ile mavi imleç planın başından sona
akar (kaydırıcıyla elle tara). İmlecin ÜZERİNDEKİ görevler parlar, diğerleri
soluklaşır — "H+45'te kim ne yapıyor olacak?" sorusunun cevabı tek bakışta.
**● CANLI** çipine tıkla → playback kapanır, ŞİMDİ çizgisine dönülür.

## 7b. Harita entegrasyonu (Kairos↔Gaia)

Harita sayfasında **Katmanlar → "Sync Matrix planı"** anahtarı (asistanla:
*"harekât planını haritada göster"*):

- **Görev noktaları** varlıkların GÜNCEL konumunda, görev-tipi renkli ve
  etiketli; **hedefler** sarı halkalı kırmızı; **angajman rotaları** atıcıdan
  hedefe kesikli kırmızı çizgi.
- Haritanın altında **gömülü mini Sync Matrix** — senkron sayfasıyla **tam
  yetenek paritesi**: sürükle/boyutlandır, sağ-tık menüsü (durum, zamanlama
  bağı, sil), ⭘ portundan bağ kurma, ok menüsünden bağ düzenleme, satır
  taşıma, çift-tık ile görev ekleme, geri al / ileri al (↶↷), D-T renk modu,
  zoom/sığdır. Her mutasyon gerçek planı değiştirir; hata olursa blok eski
  yerine döner ve mesaj haritada görünür.
- **Playback ↔ kamera takibi**: panel başlığındaki ▶ ile planı oynat —
  zaman imleci ilerlerken **o anda icrada olan görevler haritada büyüyerek
  vurgulanır** ve yeni bir görev başladığında **kamera o görevin konumuna
  süzülür** (sensörden-atıcıya akışın harekât sahasında film gibi provası).
  Kaydırıcıyla elle tarama yapılırsa kamera uçmaz, yalnız vurgu değişir;
  "● CANLI" çipi imleci kapatır. Bloğa tıkla → harita o görevin konumuna
  uçar; noktaya tıkla → varlık/iz nesne detayı.
- Konumlar her tazelemede ontolojiden okunur — plan haritada CANLI yaşar.

## 7c. Bileşenler birbiriyle konuşur

Sync Matrix bir ada değil — işaret ettiğin şey, onu gösteren her bileşende
aynı anda yanar:

| Sen bunu yapınca | Bu olur |
|---|---|
| **Kritik yol şeridinde** çipe gel | Kanvasta o görevin bağımlılık zinciri aydınlanır (ilgisizler söner). |
| Kritik yol çipine **tıkla** | Görev seçilir, çekmece açılır ve kanvas bloğa **kayarak** getirir. |
| **İhlal/Çakışma** rozetine tıklayıp mesaja gel/tıkla | İlgili görevin zinciri yanar; tıklarsan görev seçilir ve kanvas ona kayar. |
| Bloğa **sağ tık → 🗺 Haritada göster** | Harita sayfası açılır, kamera görevin konumuna uçar, paneldeki matriste blok **seçili** gelir (`?odak=` köprüsü). |
| **Haritadaki** matriste bloğa tıkla | Kamera göreve uçar + blok seçilir; hover haritadaki karşılığını büyütür; ▶ oynatım kamerayı görevden göreve taşır. |
| Haritadaki matriste **sağ tık → ✎ Düzenle** | Senkron sayfasındaki çekmecenin aynısı haritada açılır (ad/tür/varlık/zaman/bağlar). |
| **Karar Destek'te** tehdit satırına gel | Angajman matrisinde o izin rozetleri vurgulanır — tersi de geçerli (rozete gel → tablo satırı yanar). |
| Karar Destek satırında **🗺** | Harita o tehdidin konumuna uçar ve izi etiketler. |
| Varlık adına tıkla (her yerde) | Mercek tarzı sonsuz-ilişki nesne detayı açılır. |

Kural: **bir bilgi nerede görünüyorsa, oradan diğer görünümlerine atlanabilir.**

## 8. Plan yaşam döngüsü — ilk plan nereden geliyor?

İlk açılışta sistem, ontolojideki platformlardan **deterministik bir müşterek
harekât şablonu** türetir: Kara intikali → İHA keşif → SEAD/EW → Hava taarruz →
Deniz desteği → BDA, doğru ön koşul zinciriyle (H-saati o an damgalanır).
Sonrası: operatör düzenler → AIP düzenler → sensörden-atıcıya ekler →
what-if'te denenir → terfi ile canlıya yazılır. Plan kalıcıdır
(yerel `.data/`, bulutta GCS) — sayfa/uygulama yeniden açılınca aynen döner.

## 9. İpuçları ve bilinen davranışlar

- Sürükleme 5 dk'ya yuvarlanır; 5 dk'dan küçük sürükleme hiçbir şey yapmaz.
- Sürükleyip bırakma çekmeceyi AÇMAZ; çekmece için tıkla (sürüklemeden).
- İhlal uyarısı engel değildir — motor "en erken H+X'te başlamalı" der, karar
  operatöründür.
- Bağımlılık eklerken döngü oluşturacak seçimler reddedilir ("döngü yaratır").
- Canlı mod (üst bar) açıkken plan 3 sn'de bir tazelenir — başka operatörün
  değişikliği ekranına düşer.
- Klavye: blok seçiliyken `Enter` = çekmece, `←/→` = ±5 dk.
- Taktik kartta bir alanı boşaltıp Kaydet → o alan SİLİNİR ("null = sil"); bayat
  frekans/koordinat kalmaz. Koordinat girişi ±90/±180 doğrulamasından geçer.
- Sensörden-atıcıya angajman görevinin istenen etkisi ve önceliği **ROE'den
  türetilir**: serbest ROE + kinetik → İmha/P1; kısıtlı → Etkisizleştirme/P2;
  yasak/takip → Tespit/P3 (koşulsuz imha yok — JP 3-60 + ROE saygısı).
- Sonraki tur (yol haritası): koordinat için **MGRS** giriş/gösterim ve haritadan
  seçme; tam **FSCM/ACM** katmanı (FSCL/CFL/ACA/NFA) — şu an killbox çemberi
  koordinasyon alanını asgari düzeyde temsil eder.

## 10. API uçları (entegrasyon için)

| Uç | İş |
|---|---|
| `GET /senkron/plan` | Canlı plan + CPM + çakışmalar |
| `GET /senkron/planlar` · `GET /senkron/plan/:id` | Liste / tekil |
| `POST /senkron/plan/:id/kaydir` | `{gorevId, baslangicDk}` — zincirleme kaydırma |
| `POST /senkron/plan/:id/gorev` · `PATCH …/gorev/:gid` · `DELETE …/gorev/:gid` | Görev CRUD |
| `POST /senkron/plan/:id/bagimlilik` · `POST …/bagimlilik/sil` | Bağımlılık kur/kaldır |
| `POST /senkron/plan/:id/gorev/:gid/durum` | Durum/onay (Ontology Action) |
| `POST /senkron/plan/:id/toplu-kaydir` | `{deltaDk, domain?}` |
| `POST /senkron/senaryo` · `GET …/:id/fark` · `POST …/:id/terfi` | What-if akışı |
| `POST /senkron/sensor-to-shooter` | `{izNo, planId?}` — COA'dan angajman görevi |
| `GET /senkron/varliklar` | Ontoloji varlıkları (atama listeleri) |

Motor: `verim-server/src/senkron/sync-engine.ts` (CPM, yayılım, çakışma —
birim testli) · Mimari bağlam: [MIMARI.md §6](MIMARI.md).


---

## Uygulamalı ders: ilk 10 dakikan

Sıfırdan yetkinliğe — sırayla uygula, her adım bir yeteneği öğretir:

1. **Oku** — KPI şeridine bak: plan bitişi, kritik adım, ihlal/çakışma. Alttaki
   KRİTİK YOL şeridini incele: bu zincir gecikirse operasyon gecikir.
2. **Hover** — imleci bloklarda gezdir: kart tooltip'i (zaman+DTG, öncül/ardıl),
   bağımlılık zincirinin aydınlanması ve dikey zaman kılavuzunu gör.
3. **Sürükle** — "Kara unsur intikali"ni 20 dk sağa çek: bağlı adımların canlı
   önizlemeyle birlikte aktığını, Δ rozetini gör; bırak → zincir yeniden planlanır.
   **Ctrl+Z** ile geri al.
4. **Bağ kur/düzenle** — bir bloğun ⭘ portuna tıkla → hedef bloğa tıkla ("Bağ
   kuruldu"). Oka tıkla → türünü "Birlikte başlar" yap, gecikme ekle, ya da kaldır.
5. **Sağ tık** — bloğa sağ tıkla: durum menüsü. "Onayla"nın iki aşamalı olduğuna
   dikkat (icra emri gider).
6. **What-if** — WHAT-IF düğmesi → senaryoda tüm planı −30 dk çek → "Farkı gör" →
   beğenmediysen sil, beğendiysen "Canlıya terfi".
7. **AIP** — komut kutusuna yaz: "Hava görevlerini 10 dk ileri al" → asistanın
   doğrulamalı (çakışma/ihlal kontrollü) uyguladığını gör.
8. **Playback** — ▶ ile planı zamanda akıt; görünümün imleci takip ettiğini gör.
9. **Harita** — Harita → Katmanlar → "Sync Matrix planı": görev/rotalar haritada;
   mini matriste bloğa tıkla → harita uçar; panelde ▶ → oynatım boyunca kamera
   icradaki görevleri izler; ize sağ tık → "Angaje et".
10. **Sensörden-atıcıya** — "Tehdit izi" seç → ANGAJE: COA'nın plana görev olarak
    indiğini kritik yolda gör.

Bu on adımı yapan bir operatör, aracın tüm yüzeyini kullanıyor demektir.
