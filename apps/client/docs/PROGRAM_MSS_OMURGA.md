# Program: MSS Omurga — Füzyon, Akıl Yürütme, Açık Mimari

Maven Smart System'in dört omurgasını (Data Fusion → ATR → AI Reasoning → Karar
Destek), Verim'in mevcut hexagonal mimarisi üzerine **tak-çıkar (MOSA)** biçimde
inşa eder. Bu doküman objektiftir: her sprint bir omurgayı sağlamlaştırır, çıktısı
testlerle bağlanır. Felsefe değişmez: **derlenmez→yüklenmez**, tek doğruluk kaynağı,
acemi-önce UX, Türkçe arayüz / İngilizce kod.

## Görev → Omurga → Kod eşlemesi

| Kullanıcı görevi | MSS omurgası | Verim'de bugün | Boşluk |
|---|---|---|---|
| **1** Veri entegrasyon altyapısını profesyonelleştir | 1 Data Fusion & Ingestion | `src/ingest/*` çalışıyor ama **doğrulama/karantina/dedup/geo/gözlemlenebilirlik yok** | Sağlamlaştırma |
| **2** AI Reasoning Engine'i güçlendir | 3 AI Reasoning (AIP Hub) | Asistan güçlü (ontoloji-türevli araç sözleşmesi) ama **skorlama/önceliklendirme/ROE/COA/durum özeti kodu YOK** — tehdit alanları rastgele | Sıfırdan akıl yürütme katmanı |
| **3** Open Architecture / MOSA | Mimari karakteristik | Port/adapter DI var (DATA_BACKEND) | Reasoning modüllerini de tak-çıkar port haline getir |
| (ek) Otomatik Hedef Tanıma | 2 ATR (Computer Vision) | Yok (simülatör hostility üretir) | Pluggable ATR sağlayıcı portu (adapter'lar sonradan) |

## Sprintler

### Sprint 1 — Füzyon Omurgası: ingest sağlamlaştırma  ⟵ ŞİMDİ
Devasa akışı **temizleyen, doğrulayan, geo-referanslayan, kaybetmeyen** hale getir.
- **1.1 Sözleşmeli giriş (zod):** her kaynak mesajı `gozlemNormalize`/`istihbaratNormalize`
  ile geçer. **Yalnız evrensel/fiziksel değişmezler** doğrulanır (tip, sonluluk, koordinat
  sınırı, ISO zaman, ≥0, açı 0..360, yüzde 0..100). **Enum/değer kümeleri ontolojinindir,
  ingest'te DAYATILMAZ** — ontoloji değişince doğrulayıcıya dokunulmaz. Ham `JSON.parse+as` biter.
- **1.2 Geo-referanslama:** koordinat sınır doğrulaması (enlem −90..90, boylam −180..180),
  irtifa/sürat/rota aralıkları; geçersiz koordinat karantinaya. Kaba `geohash5` bölge
  etiketi (hızlı alan/AOI sorguları için, PostGIS'siz).
- **1.3 Ölü-mektup kuyruğu (karantina):** bozuk/eşleşmeyen mesaj sessizce ATILMAZ →
  `ingest_karantina` tablosuna (ham payload + sebep + zaman + sayaç). Sessiz `filter` biter.
- **1.4 Dedup/idempotency:** `reporting_data`'ya `UNIQUE(subject, reporting_datetime, source)`
  + `ON CONFLICT DO NOTHING` — Kafka yeniden teslimi geçmişi çiftlemez.
- **1.5 Gözlemlenebilirlik:** ingest sürecine küçük HTTP — `/saglik`, `/metrik`
  (tüketilen, yazılan, yaratılan, karantina, düşen, son-batch-ms, kaynak/başlık kırılımı).
- **1.6 Optimizasyon:** havuz/batch ayarları, prepared-benzeri tek round-trip korunur.

### Sprint 2 — Tehdit Skorlama Motoru (deterministik, portlanabilir)
Rastgele `tehdit_seviyesi` yerine **hesaplanan** skor: kinematik (sürat/irtifa/yön),
düşmanlık kodu, dost varlığa/AOI'ye yakınlık (CPA/kesişme süresi), istihbarat teyidi
(ilgili raporların güvenilirlik×doğruluk). `THREAT_SCORER` portu → `HeuristicThreatScorer`
adapter (ileride ML adapter takılabilir — MOSA). İz başına `skor`, `oncelik`, `gerekçe`.

### Sprint 3 — ROE / Angajman + COA Üreteci
Yeni ontoloji kavramları: `roe_kurali`, `angajman`, `senaryo(COA)`. Bir hedef için
ROE kısıtları altında **saldırı/savunma seçenekleri** üretir; her seçenek için en yakın
uygun varlığı/mühimmatı önerir (AI Asset Tasking Recommender), başarı/maliyet/risk
tahmini. `COA_ENGINE` portu. İnsan-döngüde: öneri → komutan onayı → aksiyon.

### Sprint 4 — Durum Özeti & Akıl Yürütme Döngüsü
Asistana `durum_ozeti` aracı: bir AOI/zaman penceresi için çok-kaynak füzyonu
(izler + istihbarat + skorlar) → önceliklendirilmiş, provenance'lı Türkçe özet.
Alarm→reasoning tetiklemesi (olay olunca özet/COA taslağı). Yanıt akışı (SSE) opsiyonel.

### Sprint 5 — MOSA sağlamlaştırma + ATR portu
Tüm reasoning modüllerini (`THREAT_SCORER`, `COA_ENGINE`, `ATR_PROVIDER`) env ile
seçilebilir port yap; sözleşme/drift testleri; "modülü sök-tak" belgelenir. ATR için
`ATR_PROVIDER` portu + `SimulatorAtrProvider` (bugünkü hostility) — gerçek CV adapter'ı
ana omurgayı bozmadan takılabilir.

## Uygulama Durumu (canlı doğrulanmış)

| Sprint | Kod | Test | Canlı (local :8080, mim backend) |
|---|---|---|---|
| 1 Füzyon | `ingest/normalize.ts`, `metrics.ts`, `ingest-service.ts`, `schema.sql` | 10 birim | ✅ `/metrik`: 13.7k tüketilen, dedup 12 yinelenen yakaladı, geohash bölgeler; karantina tablosu çalışıyor |
| 2 Skorlama | `reasoning/threat-scorer.ts`, `geo.ts`, `reasoning-enricher.ts` | 9 birim | ✅ 524 iz canlı skorlandı, `object_item_threat` writeback, `v_iz.tehdit_skoru` dolu (max 86, Kritik) |
| 3 ROE/COA | `reasoning/coa-engine.ts`, `reasoning.service.ts` | 6 birim | ✅ API: `/reasoning/coa` |
| 4 Durum Özeti | `reasoning.service.ts#durumOzeti` | (servis) | ✅ API: `/reasoning/durum` |
| 5 MOSA | `reasoning.module.ts` (THREAT_SCORER, COA_ENGINE portları) | — | ✅ portlar bağlı, adapter tak-çıkar |
| UI | `verim-frontend/src/karar/*` (tehdit tablosu + COA drawer + durum) | tsc temiz | Karar Destek sayfası (`/karar`) |

Parite: dummy `iz` de aynı skorlayıcıyı kullanır → 53/53 e2e + drift testi geçiyor.

### Canlı bulgu (C-lesson): Snappy poison-message crash-loop
`rpk` ile enjekte edilen mesajlar Snappy-sıkıştırılmıştı; kafkajs Snappy'yi yerleşik
çözemez ve tüketiciyi **decode katmanında** çökertir (batch-içi try/catch ULAŞAMAZ,
çünkü çökme eachBatch'ten ÖNCE olur) → `process.exit(1)` → container yeniden başlar →
aynı offset'i tekrar okur → sonsuz crash-loop. Gerçek Kafka üreticileri sık sık
Snappy/lz4 kullandığından bu üretim riskidir. Çözüm: `kafkajs-snappy` codec kaydı
(`CompressionCodecs[Snappy]=…`). Ders: kafkajs sıkıştırma codec'leri elle kaydedilmeli;
poison-message'a karşı codec desteği + (ileride) undecodable-batch atlatma gerekir.

## İlke: neden deterministik skorlama/COA (LLM değil)
Skorlama ve COA **açıklanabilir, test edilebilir, tekrarlanabilir** olmalı (askeri
denetlenebilirlik). LLM (Asistan) bunların ÜSTÜNDE durur: deterministik motorların
çıktısını okur, insana anlatır, senaryoları karşılaştırır. Motor = gerçek; LLM = anlatı.
[[KARAR_TRIPLE_VS_ILISKISEL]] ile aynı sınır felsefesi.
