-- MIM (MIP Information Model, MIP 4) pragmatik alt kümesi — Verim staging.
-- MIM ontoloji tabanlı kavramsal bir modeldir; burada onun çekirdek
-- entity'lerinin (ObjectItem, Organisation, Materiel, Action/ActionTask,
-- ReportingData, ObjectItemLocation, HostilityStatus, Holding,
-- ObjectItemAssociation) ilişkisel bir izdüşümü kurulur. Gerçek MIM
-- verisi geldiğinde (MIP4-IES XML alışverişi) ingest bu tabloları besler;
-- Verim yalnızca views.sql'deki v_* görünümlerini okur.
--
-- Adlandırma: MIM entity/attribute adlarının snake_case izdüşümü
-- (ObjectItem.alternateIdentificationText → alternate_identification_text).

DROP VIEW IF EXISTS v_birlik, v_platform, v_gorev, v_sensor, v_iz, v_iz_gecmis, v_personel, v_istihbarat CASCADE;
DROP SEQUENCE IF EXISTS object_item_ingest_seq;
-- reporting_data TimescaleDB hypertable olabilir; hypertable ÇOKLU DROP'ta
-- düşürülemez ("cannot drop a hypertable along with other objects") — ayrı düşür
DROP TABLE IF EXISTS reporting_data CASCADE;
DROP TABLE IF EXISTS meta, intel_report, action_resource, action_task,
  action, holding, object_item_association, object_item_hostility_status,
  object_item_location, person_assignment, person, materiel, organisation,
  object_item CASCADE;

-- ObjectItem: MIM'in kök entity'si (Organisation / Materiel / iz hepsi buna bağlanır)
CREATE TABLE object_item (
  object_item_id                  bigint PRIMARY KEY,
  category_code                   text NOT NULL,  -- ORGANISATION | MATERIEL | TRACK
  alternate_identification_text   text NOT NULL UNIQUE,  -- BRL-001, PLT-0001, IZ-000001
  name_text                       text
);

-- Organisation (birlik) — durum alanları pragmatik olarak gömülü
-- (MIM'de OrganisationStatus ayrı entity'dir). commander_person_id: birliğin
-- komutanı (Person'a FK); garrison_text: üs/garnizon adı.
CREATE TABLE organisation (
  organisation_id               bigint PRIMARY KEY REFERENCES object_item,
  echelon_code                  text NOT NULL,
  domain_code                   text NOT NULL,
  region_text                   text NOT NULL,
  operational_status_code       text NOT NULL,
  personnel_strength_quantity   int  NOT NULL,
  readiness_rate_quantity       int  NOT NULL,
  commander_person_id           bigint REFERENCES object_item,
  garrison_text                 text NOT NULL DEFAULT ''
);

-- Materiel (platform + sensör; materiel_category_code ayırır)
CREATE TABLE materiel (
  materiel_id             bigint PRIMARY KEY REFERENCES object_item,
  materiel_category_code  text NOT NULL,   -- PLATFORM | SENSOR
  type_text               text NOT NULL,
  domain_code             text,
  operational_status_code text NOT NULL,
  fuel_rate_quantity      int,
  speed_quantity_knots    int,
  range_quantity_km       int,
  serial_identification_text text,          -- kuyruk no (platform)
  manufacturer_text       text,             -- üretici (platform + sensör)
  frequency_band_text     text              -- frekans bandı (sensör)
);

-- Person (personel) + PersonStatus (durum gömülü)
CREATE TABLE person (
  person_id                 bigint PRIMARY KEY REFERENCES object_item,
  rank_code                 text NOT NULL,
  rank_level_code           int  NOT NULL,
  functional_role_code      text NOT NULL,
  specialty_text            text NOT NULL,
  operational_status_code   text NOT NULL,
  security_clearance_code   text NOT NULL,
  experience_years_quantity int  NOT NULL,
  flight_hours_quantity     int  NOT NULL
);

-- PersonAssignment (personel → mensup birlik + görevli platform)
CREATE TABLE person_assignment (
  person_id       bigint PRIMARY KEY REFERENCES object_item,
  organisation_id bigint NOT NULL REFERENCES object_item,
  materiel_id     bigint REFERENCES object_item
);

-- ObjectItemLocation (platform konumu + iz kinematiği)
CREATE TABLE object_item_location (
  object_item_id        bigint PRIMARY KEY REFERENCES object_item,
  latitude_coordinate   double precision,
  longitude_coordinate  double precision,
  altitude_feet_quantity int,
  speed_quantity_knots  int,
  bearing_angle_degrees int
);

-- ObjectItemHostilityStatus (iz sınıflandırması)
CREATE TABLE object_item_hostility_status (
  object_item_id        bigint PRIMARY KEY REFERENCES object_item,
  hostility_status_code text NOT NULL     -- FR / HO / SUSPECT / UNK
);

-- TrackCurrent — iz başına EN SON RAPOR ÖZETİ (denormalize "son durum").
-- location/hostility gibi ingest'te iz-başına UPSERT edilir. v_iz'in "son gözlem"
-- LATERAL'ının yerini alır: 37M satırlık reporting_data'yı iz başına gezmek
-- (özellikle gözlemi olmayan ~20k "ölü iz" için sıkıştırılmış chunk decompress)
-- yerine bu 1-satır/iz tablodan JOIN → harita/board yükü ~4000× hızlanır
-- (17307ms→4.3ms ölçüldü). Reporting_data hâlâ tam geçmişi tutar (Harman/timeseries).
CREATE TABLE track_current (
  object_item_id      bigint PRIMARY KEY REFERENCES object_item,
  reporting_datetime  timestamptz NOT NULL,
  source_materiel_id  bigint NOT NULL,
  dimension_code      text NOT NULL,       -- Hava/Deniz/Kara/…
  threat_level_code   int                  -- 1..5 (rapor kaynaklı ham seviye)
) WITH (
  fillfactor = 80,                         -- sık upsert → sayfa-içi HOT update
  autovacuum_vacuum_scale_factor = 0.05
);

-- ObjectItemAssociation (sensör INSTALLED_ON platform)
CREATE TABLE object_item_association (
  subject_object_item_id bigint NOT NULL REFERENCES object_item,
  object_object_item_id  bigint NOT NULL REFERENCES object_item,
  category_code          text   NOT NULL,
  PRIMARY KEY (subject_object_item_id, object_object_item_id, category_code)
);

-- Holding (birlik → elindeki platformlar)
CREATE TABLE holding (
  organisation_id bigint NOT NULL REFERENCES object_item,
  materiel_id     bigint NOT NULL REFERENCES object_item,
  PRIMARY KEY (organisation_id, materiel_id)
);

-- Action / ActionTask (görev) / ActionResource (icra eden birlik)
CREATE TABLE action (
  action_id                     bigint PRIMARY KEY,
  alternate_identification_text text NOT NULL UNIQUE,   -- GRV-0001
  category_code                 text NOT NULL DEFAULT 'TASK'
);
CREATE TABLE action_task (
  action_id               bigint PRIMARY KEY REFERENCES action,
  task_type_text          text NOT NULL,
  priority_code           int  NOT NULL,
  planned_start_datetime  timestamptz NOT NULL,
  duration_hours_quantity int  NOT NULL,
  operational_status_code text NOT NULL,
  success_rate_quantity   int,
  target_region_text      text NOT NULL DEFAULT ''
);
CREATE TABLE action_resource (
  action_id           bigint PRIMARY KEY REFERENCES action,
  organisation_id     bigint NOT NULL REFERENCES object_item,
  commander_person_id bigint REFERENCES object_item
);

-- ReportingData (iz GÖZLEMİ: hangi sensör, ne zaman, nerede — her rapor
-- yeni satırdır; iz başına gözlem GEÇMİŞİ birikir. Canlı sistemde
-- simülatör/ingest buraya sürekli ekler; v_iz en son gözlemi gösterir.)
CREATE TABLE reporting_data (
  reporting_data_id      bigserial,
  subject_object_item_id bigint NOT NULL REFERENCES object_item,  -- iz
  source_materiel_id     bigint NOT NULL REFERENCES object_item,  -- tespit eden sensör
  reporting_datetime     timestamptz NOT NULL,
  -- PK zaman kolonunu içerir: TimescaleDB hypertable bölmeleme kolonunu
  -- unique index'te ZORUNLU kılar (plain PG'de de geçerli/zararsız)
  PRIMARY KEY (reporting_datetime, reporting_data_id),
  dimension_code         text NOT NULL,                           -- Hava/Deniz/Kara
  threat_level_code      int  NOT NULL,
  -- gözlem anındaki kinematik (ObjectItemLocation'ın rapor kopyası)
  latitude_coordinate    double precision,
  longitude_coordinate   double precision,
  altitude_feet_quantity int,
  speed_quantity_knots   int,
  bearing_angle_degrees  int
);
-- v_iz'in "iz başına SON gözlem" LATERAL'ı bu index'i TAM karşılar: sıralama
-- (subject, reporting_datetime DESC, reporting_data_id DESC) → track başına O(log n)
-- index seek. reporting_data_id tiebreaker'ı ŞART: yoksa planner PK'yı (datetime)
-- geriye tarar ve güncel ~2.7GB chunk'ta her track için pahalı olur (ölçüldü:
-- 3237ms → 10ms, ~324×). Palantir "son durum" okumasının deterministik + hızlı hali.
CREATE INDEX reporting_data_subject_time_idx
  ON reporting_data (subject_object_item_id, reporting_datetime DESC, reporting_data_id DESC);
CREATE INDEX reporting_data_source_idx ON reporting_data (source_materiel_id);
-- NOT: ayrı (reporting_datetime) index'i YOK — PK (reporting_datetime, reporting_data_id)
-- zaten reporting_datetime'ı öncü kolon yapıyor; zaman-aralığı/sıralama sorgularını
-- PK + hypertable chunk-exclusion karşılar (fazladan ~257MB/chunk index'ten kaçınılır).
-- Idempotency/dedup: aynı (iz, an, tespit eden sensör) yeniden teslimi geçmişi
-- ÇİFTLEMESİN (Kafka at-least-once). Partition kolonu (reporting_datetime)
-- unique index'te ZORUNLU — burada mevcut. Ingest INSERT'i ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX reporting_data_dedup_idx
  ON reporting_data (subject_object_item_id, reporting_datetime, source_materiel_id);

-- TimescaleDB hypertable: reporting_data zaman-serisi (gözlem geçmişi) sürekli
-- büyür; TimescaleDB imajında zaman-bölmeli (chunk) hypertable'a dönüştürülür
-- → zaman-aralığı sorguları ve retention chunk bazında hızlanır. Extension
-- yoksa (plain Postgres / Cloud SQL) blok SESSIZCE atlanır: aynı tablo, aynı
-- sorgular çalışır (yalnız bölmeleme optimizasyonu olmaz).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    CREATE EXTENSION IF NOT EXISTS timescaledb;
    -- birincil anahtar reporting_data_id; hypertable zaman kolonuyla bölünür
    PERFORM create_hypertable('reporting_data', 'reporting_datetime',
                              chunk_time_interval => interval '1 day',
                              migrate_data => true, if_not_exists => true);
    -- SIKIŞTIRMA: gözlem firehose'u çok büyür (sıkıştırmasız ~7.4GB). Track
    -- bazında segment (aynı iz'in gözlemleri bir arada → son-gözlem/track
    -- sorgularına uygun), zaman DESC sırala. 8 saatten eski chunk'lar otomatik
    -- sıkışır (tipik ~8× küçülme); güncel chunk yazılabilir kalır. Düşük-RAM'de
    -- working-set page cache'e sığar → soğuk sorgular diske düşmez.
    ALTER TABLE reporting_data SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'subject_object_item_id',
      timescaledb.compress_orderby   = 'reporting_datetime DESC'
    );
    PERFORM add_compression_policy('reporting_data', INTERVAL '8 hours', if_not_exists => true);
    RAISE NOTICE 'reporting_data → TimescaleDB hypertable (1 günlük chunk, 8h sonra sıkışır)';
  ELSE
    RAISE NOTICE 'timescaledb yok — reporting_data düz tablo (plain PG)';
  END IF;
END $$;
CREATE INDEX object_item_category_idx   ON object_item (category_code);
CREATE INDEX materiel_category_idx      ON materiel (materiel_category_code);
CREATE INDEX person_assignment_org_idx  ON person_assignment (organisation_id);
CREATE INDEX person_assignment_mat_idx  ON person_assignment (materiel_id);

-- IntelReport (istihbarat raporu — MIM ReportingData[categoryCode=INTREP]
-- izdüşümü): SIGINT/IMINT/OSINT/HUMINT disiplinlerinden akan raporlar.
-- İz referansı DEĞER bazlıdır (related_track_code, FK yok): rapor henüz
-- görmediğimiz bir ize işaret edebilir; ontoloji linki değer join'iyle çözer.
-- STANAG 2511: reliability A–F (kaynak güvenilirliği), credibility 1–6
-- (bilgi doğruluğu).
CREATE TABLE intel_report (
  intel_report_id       bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  report_code           text NOT NULL UNIQUE,          -- RPT-...
  intel_discipline_code text NOT NULL,                 -- SIGINT/IMINT/OSINT/HUMINT
  report_title          text NOT NULL,
  report_text           text NOT NULL,
  source_name           text NOT NULL,                 -- emitter/kamera/hesap/saha kaynağı
  reliability_code      text NOT NULL,                 -- A..F
  credibility_code      int  NOT NULL,                 -- 1..6
  priority_code         text NOT NULL,                 -- Acil/Yüksek/Rutin
  threat_type_text      text,                          -- disiplin konusu / tehdit sınıfı
  confidence_percent    int,                           -- IMINT/OSINT güven yüzdesi
  related_track_code    text,                          -- iz_no (değer-bazlı link)
  latitude_coordinate   double precision,
  longitude_coordinate  double precision,
  reporting_datetime    timestamptz NOT NULL
);
CREATE INDEX intel_report_time_idx  ON intel_report (reporting_datetime DESC);
CREATE INDEX intel_report_disc_idx  ON intel_report (intel_discipline_code);
CREATE INDEX intel_report_track_idx ON intel_report (related_track_code);

-- Ingest'in yarattığı yeni nesneler için kimlik aralığı (seed blokları
-- 1M-6M aralığını kullanır; ingest 8M'den başlar — çakışma imkânsız)
CREATE SEQUENCE object_item_ingest_seq START 8000000;

-- Ölü-mektup kuyruğu: sözdizimi/şema/sınır ihlali olan ya da bilinmeyen sensörlü
-- gelen mesajlar SESSIZCE ATILMAZ — sebebiyle burada saklanır (incele/replay).
CREATE TABLE ingest_karantina (
  karantina_id bigserial PRIMARY KEY,
  topic        text NOT NULL,
  sebep        text NOT NULL,       -- normalize sebebi (örn. "enlem: ... ≤ 90")
  ham_payload  text NOT NULL,       -- orijinal mesaj (ilk 8000 karakter)
  zaman        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ingest_karantina_zaman_idx ON ingest_karantina (zaman DESC);

-- Tehdit skoru — akıl yürütme motorunun WRITEBACK'i (dinamik ontoloji, Palantir
-- "Functions/Actions" deseni): reasoning-enricher canlı izleri sürekli skorlar,
-- sonucu buraya yazar. v_iz LEFT JOIN ile skoru gösterir; okuma O(1) çünkü skor
-- ÖNCEDEN hesaplanmış+indeksli (çok büyük veride performans). Skor açıklanabilir:
-- rationale jsonb her etkenin katkısını taşır.
-- PERFORMANS: enricher bu tabloyu ~10 sn'de bir TÜM canlı izler için upsert eder
-- (yoğun UPDATE). fillfactor=70 sayfa-içi HOT update'e yer bırakır; agresif
-- autovacuum ölü-tuple'ı hızla toplar → tablo şişmez (aksi halde 1.7k satır 130MB'a
-- çıkıyordu). threat_score üzerinde AYRI index YOK: minik tabloda (~1.7k satır)
-- seq-scan+sort <1ms, ama indeksli kolonun her skor değişiminde UPDATE'i non-HOT
-- yapıp tabloyu şişirmesi çok daha pahalı — bilinçli olarak indekssiz.
CREATE TABLE object_item_threat (
  object_item_id bigint PRIMARY KEY REFERENCES object_item,
  threat_score   int  NOT NULL,          -- 0..100
  threat_level   int  NOT NULL,          -- 1..5 kova
  priority_text  text NOT NULL,          -- Kritik/Yüksek/Orta/Düşük/Asgari
  approaching    boolean NOT NULL DEFAULT false, -- kinetik: dost varlığa yaklaşıyor mu
  rationale      jsonb NOT NULL,         -- etken kırılımı (açıklanabilirlik)
  scored_at      timestamptz NOT NULL DEFAULT now()
) WITH (
  fillfactor = 70,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 200,
  autovacuum_vacuum_cost_delay = 0
);

-- Seed damgası — DatasetProvider'ın version/lastUpdated kaynağı
CREATE TABLE meta (
  version   text NOT NULL,
  seeded_at timestamptz NOT NULL DEFAULT now()
);
