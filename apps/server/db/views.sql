-- Verim ontoloji görünümleri — MIM entity izdüşümünden Verim'in beklediği
-- kolon adlarına (apiName) birebir eşleme. Adapter'lar YALNIZCA bunları okur;
-- MIM entity join'leri bu katmanda saklı kalır. Gerçek MIM replikasına
-- geçişte muhtemelen sadece bu dosya uyarlanır.

CREATE OR REPLACE VIEW v_birlik AS
SELECT
  oi.alternate_identification_text  AS birlik_no,
  oi.name_text                      AS ad,
  o.domain_code                     AS domain,
  o.echelon_code                    AS kademe,
  o.region_text                     AS bolge,
  o.operational_status_code         AS durum,
  o.personnel_strength_quantity     AS personel,
  o.readiness_rate_quantity         AS hazirlik_orani,
  koi.alternate_identification_text AS komutan_no,
  o.garrison_text                   AS us_adi
FROM organisation o
JOIN object_item oi       ON oi.object_item_id = o.organisation_id
LEFT JOIN object_item koi ON koi.object_item_id = o.commander_person_id;

CREATE OR REPLACE VIEW v_platform AS
SELECT
  oi.alternate_identification_text  AS platform_no,
  oi.name_text                      AS cagri_adi,
  m.type_text                       AS tip,
  m.domain_code                     AS domain,
  boi.alternate_identification_text AS birlik_no,
  m.operational_status_code         AS durum,
  m.fuel_rate_quantity              AS yakit_orani,
  m.speed_quantity_knots            AS surat_knot,
  l.latitude_coordinate             AS enlem,
  l.longitude_coordinate            AS boylam,
  m.serial_identification_text      AS kuyruk_no,
  m.manufacturer_text               AS uretici
FROM materiel m
JOIN object_item oi ON oi.object_item_id = m.materiel_id
LEFT JOIN holding h              ON h.materiel_id = m.materiel_id
LEFT JOIN object_item boi        ON boi.object_item_id = h.organisation_id
LEFT JOIN object_item_location l ON l.object_item_id = m.materiel_id
WHERE m.materiel_category_code = 'PLATFORM';

CREATE OR REPLACE VIEW v_sensor AS
SELECT
  oi.alternate_identification_text  AS sensor_no,
  m.type_text                       AS tip,
  poi.alternate_identification_text AS platform_no,
  m.range_quantity_km               AS menzil_km,
  m.operational_status_code         AS durum,
  m.manufacturer_text               AS uretici,
  m.frequency_band_text             AS frekans_bandi
FROM materiel m
JOIN object_item oi ON oi.object_item_id = m.materiel_id
LEFT JOIN object_item_association a ON a.subject_object_item_id = m.materiel_id
                                   AND a.category_code = 'INSTALLED_ON'
LEFT JOIN object_item poi ON poi.object_item_id = a.object_object_item_id
WHERE m.materiel_category_code = 'SENSOR';

CREATE OR REPLACE VIEW v_gorev AS
SELECT
  a.alternate_identification_text   AS gorev_no,
  t.task_type_text                  AS tip,
  t.operational_status_code         AS durum,
  t.priority_code                   AS oncelik,
  t.planned_start_datetime          AS baslangic,
  t.duration_hours_quantity         AS sure_saat,
  ooi.alternate_identification_text AS birlik_no,
  o.domain_code                     AS domain,
  t.success_rate_quantity           AS basari_puani,
  t.target_region_text              AS hedef_bolge,
  koi.alternate_identification_text AS komutan_no
FROM action_task t
JOIN action a ON a.action_id = t.action_id
LEFT JOIN action_resource r ON r.action_id = t.action_id
LEFT JOIN object_item ooi   ON ooi.object_item_id = r.organisation_id
LEFT JOIN object_item koi   ON koi.object_item_id = r.commander_person_id
LEFT JOIN organisation o    ON o.organisation_id = r.organisation_id;

-- v_personel: Person + PersonStatus + PersonAssignment izdüşümü
CREATE OR REPLACE VIEW v_personel AS
SELECT
  oi.alternate_identification_text   AS personel_no,
  oi.name_text                       AS ad_soyad,
  p.rank_code                        AS rutbe,
  p.rank_level_code                  AS rutbe_seviye,
  p.functional_role_code             AS rol,
  p.specialty_text                   AS uzmanlik,
  boi.alternate_identification_text  AS birlik_no,
  moi.alternate_identification_text  AS platform_no,
  p.operational_status_code          AS durum,
  p.security_clearance_code          AS guvenlik_belgesi,
  p.experience_years_quantity        AS tecrube_yili,
  p.flight_hours_quantity            AS ucus_saati
FROM person p
JOIN object_item oi        ON oi.object_item_id = p.person_id
LEFT JOIN person_assignment pa ON pa.person_id = p.person_id
LEFT JOIN object_item boi  ON boi.object_item_id = pa.organisation_id
LEFT JOIN object_item moi  ON moi.object_item_id = pa.materiel_id;

-- v_iz: her izin SON DURUMU — kinematik ObjectItemLocation'dan (upsert'li),
-- rapor bilgisi iz-başına denormalize track_current'tan (ingest upsert eder).
-- Eski LATERAL "son gözlem" 37M reporting_data'yı iz başına geziyordu; ölü izler
-- + sıkıştırma bunu ~17s'e çıkarıyordu → track_current JOIN'i ile ~4000× hızlı.
CREATE OR REPLACE VIEW v_iz AS
SELECT
  oi.alternate_identification_text AS iz_no,
  CASE h.hostility_status_code
    WHEN 'FR'      THEN 'Dost'
    WHEN 'HO'      THEN 'Düşman'
    WHEN 'SUSPECT' THEN 'Şüpheli'
    ELSE 'Bilinmeyen'
  END                                AS siniflandirma,
  r.dimension_code                   AS domain,
  r.reporting_datetime               AS tespit_zamani,
  soi.alternate_identification_text  AS sensor_no,
  l.speed_quantity_knots             AS surat_knot,
  l.altitude_feet_quantity           AS irtifa_ft,
  l.bearing_angle_degrees            AS rota_derece,
  l.latitude_coordinate              AS enlem,
  l.longitude_coordinate             AS boylam,
  r.threat_level_code                AS tehdit_seviyesi,
  -- Akıl yürütme motoru WRITEBACK'i (hesaplanan, açıklanabilir tehdit):
  t.threat_score                     AS tehdit_skoru,
  t.priority_text                    AS tehdit_onceligi,
  COALESCE(t.approaching, false)     AS yaklasiyor,
  t.rationale                        AS tehdit_gerekce
FROM object_item oi
JOIN object_item_hostility_status h ON h.object_item_id = oi.object_item_id
JOIN track_current r                ON r.object_item_id = oi.object_item_id
JOIN object_item soi                ON soi.object_item_id = r.source_materiel_id
LEFT JOIN object_item_location l    ON l.object_item_id = oi.object_item_id
LEFT JOIN object_item_threat t      ON t.object_item_id = oi.object_item_id
WHERE oi.category_code = 'TRACK';

-- v_iz_gecmis: gözlem GEÇMİŞİ — her rapor bir satır (Harman'da zaman
-- serisi/hareket analizi için ayrı dataset olarak sunulur).
CREATE OR REPLACE VIEW v_iz_gecmis AS
SELECT
  'GZL-' || r.reporting_data_id      AS gozlem_no,
  oi.alternate_identification_text   AS iz_no,
  r.reporting_datetime               AS tespit_zamani,
  soi.alternate_identification_text  AS sensor_no,
  r.dimension_code                   AS domain,
  r.threat_level_code                AS tehdit_seviyesi,
  r.latitude_coordinate              AS enlem,
  r.longitude_coordinate             AS boylam,
  r.speed_quantity_knots             AS surat_knot,
  r.altitude_feet_quantity           AS irtifa_ft,
  r.bearing_angle_degrees            AS rota_derece
FROM reporting_data r
JOIN object_item oi  ON oi.object_item_id = r.subject_object_item_id
JOIN object_item soi ON soi.object_item_id = r.source_materiel_id;

-- v_istihbarat: multi-INT istihbarat raporları (intel_report düz izdüşümü).
-- Kaynaklar omurga üzerinden akıtır (source-intel → ingest); iz bağlantısı
-- değer bazlıdır (ilgili_iz_no = iz_no ise ontoloji linki çözer).
CREATE OR REPLACE VIEW v_istihbarat AS
SELECT
  report_code            AS rapor_no,
  intel_discipline_code  AS tur,
  report_title           AS baslik,
  report_text            AS ozet,
  source_name            AS kaynak,
  reliability_code       AS kaynak_guvenilirligi,
  credibility_code       AS bilgi_dogrulugu,
  priority_code          AS oncelik,
  threat_type_text       AS tehdit_tipi,
  confidence_percent     AS guven_yuzde,
  related_track_code     AS ilgili_iz_no,
  latitude_coordinate    AS enlem,
  longitude_coordinate   AS boylam,
  reporting_datetime     AS rapor_zamani
FROM intel_report;
