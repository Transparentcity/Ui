-- =============================================================================
-- Migration 013: Seed Austin City Council contacts + weekly-update invite template
-- =============================================================================
-- Adds the Austin Mayor + 10 district council members to the CRM `prospects`
-- table, tags them with the "Government" and "City Council" keywords, and seeds
-- a casual weekly-update invitation email template.
--
-- Run after 012_send_queue_draft_status.sql:
--   psql "$DATABASE_URL" -f scripts/013_seed_austin_city_council.sql
--
-- Idempotent: re-running will not create duplicates (guarded on email / name).
--
-- Sources (verified June 2026):
--   https://www.austintexas.gov/council
--   https://en.wikipedia.org/wiki/Austin_City_Council
-- Council office email format is district<N>@austintexas.gov; the Mayor uses a
-- named mailbox (kirk.watson@austintexas.gov).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Keyword tags: "Government" and "City Council"
-- -----------------------------------------------------------------------------
INSERT INTO keywords (name, category, description) VALUES
  ('Government',   'Government', 'Elected officials, public agencies, and government bodies'),
  ('City Council', 'Government', 'City council members and council offices'),
  ('Staff',        'Government', 'Council/agency staff (chiefs of staff, senior aides)')
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Austin City Council contacts (Mayor + 10 districts)
--    city_id 56718 = Austin, TX (platform cities.id, per public sitemap API)
--    Idempotent insert: only adds a row if the email is not already present.
-- -----------------------------------------------------------------------------
INSERT INTO prospects (name, title, organization, department, email, phone, jurisdiction, contact_type, city_id, city_name, priority, status, notes)
SELECT v.name, v.title, v.organization, v.department, v.email, v.phone, v.jurisdiction, 'city_staff', 56718, 'Austin', 2, 'active', v.notes
FROM (VALUES
  ('Kirk Watson',           'Mayor',                     'Austin City Council', 'Mayor''s Office',    'kirk.watson@austintexas.gov', '(512) 978-2100', 'Citywide',    'Mayor of Austin · CoS: Colleen Pate <colleen.pate@austintexas.gov> (cc on outreach; email inferred, verify)'),
  ('Natasha Harper-Madison','Council Member, District 1','Austin City Council', 'District 1 Office',  'district1@austintexas.gov',   '(512) 978-2101', 'District 1',  'Northeast Austin · CoS: Sharon Mays <sharon.mays@austintexas.gov> (cc on outreach)'),
  ('Vanessa Fuentes',       'Council Member, District 2','Austin City Council', 'District 2 Office',  'district2@austintexas.gov',   '(512) 978-2102', 'District 2',  'Southeast Austin · CoS: Jason Lopez <jason.lopez@austintexas.gov> (cc on outreach)'),
  ('Jose Velasquez',        'Council Member, District 3','Austin City Council', 'District 3 Office',  'district3@austintexas.gov',   '(512) 978-2103', 'District 3',  'East Austin · CoS: Sobeyda Gomez-Chou <sobeyda.gomez-chou@austintexas.gov> (cc on outreach)'),
  ('Jose "Chito" Vela',     'Council Member, District 4','Austin City Council', 'District 4 Office',  'district4@austintexas.gov',   '(512) 978-2104', 'District 4',  'North Central Austin · CoS: Solomon Ortiz <solomonortiz@austintexas.gov> (cc on outreach)'),
  ('Ryan Alter',            'Council Member, District 5','Austin City Council', 'District 5 Office',  'district5@austintexas.gov',   '(512) 978-2105', 'District 5',  'South Austin · CoS: Ben Leffler <ben.leffler@austintexas.gov> (cc on outreach)'),
  ('Krista Laine',          'Council Member, District 6','Austin City Council', 'District 6 Office',  'district6@austintexas.gov',   '(512) 978-2106', 'District 6',  'Northwest Austin · CoS: Jenna Hanes <jennahanes@austintexas.gov> (cc on outreach)'),
  ('Mike Siegel',           'Council Member, District 7','Austin City Council', 'District 7 Office',  'district7@austintexas.gov',   '(512) 978-2107', 'District 7',  'North Austin · CoS: Emily Gerrick <emily.gerrick@austintexas.gov> (cc on outreach)'),
  ('Paige Ellis',           'Council Member, District 8','Austin City Council', 'District 8 Office',  'district8@austintexas.gov',   '(512) 978-2108', 'District 8',  'Southwest Austin · CoS: Julie Montgomery <julie.montgomery@austintexas.gov> (cc on outreach)'),
  ('Zohaib "Zo" Qadri',     'Council Member, District 9','Austin City Council', 'District 9 Office',  'district9@austintexas.gov',   '(512) 978-2109', 'District 9',  'Central Austin · CoS: Sara Barge <sara.barge@austintexas.gov> (cc on outreach; email inferred, verify)'),
  ('Marc Duchen',           'Council Member, District 10','Austin City Council','District 10 Office', 'district10@austintexas.gov',  '(512) 978-2110', 'District 10', 'Northwest/Central Austin · CoS: Carrie Smith <carrie.smith@austintexas.gov> (cc on outreach)')
) AS v(name, title, organization, department, email, phone, jurisdiction, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM prospects p WHERE lower(p.email) = lower(v.email)
);

-- -----------------------------------------------------------------------------
-- 3. Tag every Austin council contact with Government + City Council
-- -----------------------------------------------------------------------------
INSERT INTO prospect_keywords (prospect_id, keyword_id)
SELECT p.id, k.id
FROM prospects p
JOIN keywords k ON k.name IN ('Government', 'City Council')
WHERE p.city_id = 56718
  AND p.email IN (
    'kirk.watson@austintexas.gov',
    'district1@austintexas.gov','district2@austintexas.gov','district3@austintexas.gov',
    'district4@austintexas.gov','district5@austintexas.gov','district6@austintexas.gov',
    'district7@austintexas.gov','district8@austintexas.gov','district9@austintexas.gov',
    'district10@austintexas.gov'
  )
ON CONFLICT (prospect_id, keyword_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3b. Chiefs of staff / most-senior staffer per office (additional records)
--     Verified June 2026 against austintexas.gov staff directories. Two emails
--     (Mayor / District 9) are inferred from the firstname.lastname pattern
--     because the official page masked them — flagged in notes, verify before send.
-- -----------------------------------------------------------------------------
INSERT INTO prospects (name, title, organization, department, email, phone, jurisdiction, contact_type, city_id, city_name, priority, status, notes)
SELECT v.name, v.title, v.organization, v.department, v.email, v.phone, v.jurisdiction, 'city_staff', 56718, 'Austin', 3, 'active', v.notes
FROM (VALUES
  ('Colleen Pate',      'Chief of Staff', 'Austin City Council', 'Mayor''s Office',    'colleen.pate@austintexas.gov',      '(512) 978-2100', 'Citywide',    'Chief of Staff to Mayor Kirk Watson (cc) · email inferred, verify'),
  ('Sharon Mays',       'Chief of Staff', 'Austin City Council', 'District 1 Office',  'sharon.mays@austintexas.gov',       '(512) 978-2136', 'District 1',  'Chief of Staff to CM Natasha Harper-Madison (cc)'),
  ('Jason Lopez',       'Chief of Staff', 'Austin City Council', 'District 2 Office',  'jason.lopez@austintexas.gov',       '(512) 978-2165', 'District 2',  'Chief of Staff to CM Vanessa Fuentes (cc)'),
  ('Sobeyda Gomez-Chou','Chief of Staff', 'Austin City Council', 'District 3 Office',  'sobeyda.gomez-chou@austintexas.gov','(512) 978-2151', 'District 3',  'Chief of Staff to CM Jose Velasquez (cc)'),
  ('Solomon Ortiz',     'Chief of Staff', 'Austin City Council', 'District 4 Office',  'solomonortiz@austintexas.gov',      '(512) 978-2104', 'District 4',  'Chief of Staff to CM Jose "Chito" Vela (cc)'),
  ('Ben Leffler',       'Chief of Staff', 'Austin City Council', 'District 5 Office',  'ben.leffler@austintexas.gov',       '(512) 978-2105', 'District 5',  'Chief of Staff to CM Ryan Alter (cc)'),
  ('Jenna Hanes',       'Chief of Staff', 'Austin City Council', 'District 6 Office',  'jennahanes@austintexas.gov',        '(512) 978-2106', 'District 6',  'Chief of Staff to CM Krista Laine (cc)'),
  ('Emily Gerrick',     'Chief of Staff', 'Austin City Council', 'District 7 Office',  'emily.gerrick@austintexas.gov',     '(512) 978-2185', 'District 7',  'Chief of Staff to CM Mike Siegel (cc)'),
  ('Julie Montgomery',  'Chief of Staff', 'Austin City Council', 'District 8 Office',  'julie.montgomery@austintexas.gov',  '(512) 978-2108', 'District 8',  'Chief of Staff to CM Paige Ellis (cc)'),
  ('Sara Barge',        'Chief of Staff', 'Austin City Council', 'District 9 Office',  'sara.barge@austintexas.gov',        '(512) 978-2109', 'District 9',  'Chief of Staff to CM Zohaib "Zo" Qadri (cc) · email inferred, verify'),
  ('Carrie Smith',      'Chief of Staff', 'Austin City Council', 'District 10 Office', 'carrie.smith@austintexas.gov',      '(512) 978-2110', 'District 10', 'Chief of Staff to CM Marc Duchen (cc)')
) AS v(name, title, organization, department, email, phone, jurisdiction, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM prospects p WHERE lower(p.email) = lower(v.email)
);

-- Tag every chief of staff with Government + City Council + Staff
INSERT INTO prospect_keywords (prospect_id, keyword_id)
SELECT p.id, k.id
FROM prospects p
JOIN keywords k ON k.name IN ('Government', 'City Council', 'Staff')
WHERE p.city_id = 56718
  AND p.email IN (
    'colleen.pate@austintexas.gov',
    'sharon.mays@austintexas.gov','jason.lopez@austintexas.gov','sobeyda.gomez-chou@austintexas.gov',
    'solomonortiz@austintexas.gov','ben.leffler@austintexas.gov','jennahanes@austintexas.gov',
    'emily.gerrick@austintexas.gov','julie.montgomery@austintexas.gov','sara.barge@austintexas.gov',
    'carrie.smith@austintexas.gov'
  )
ON CONFLICT (prospect_id, keyword_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Per-district weekly-update invitation templates (Mayor + D1..D10)
--    Casual, handwritten tone (intentional lowercase). Each office gets its own
--    district stories; subject + lead bullet are real facts from that district.
--    Shared frame kept DRY via the `frame` CTE. Personalization tokens supported
--    by src/lib/template-engine.ts: {{name}}, {{jurisdiction}}, {{city}}.
--    Idempotent: guarded on template name.
-- -----------------------------------------------------------------------------
WITH frame AS (
  SELECT
    E'hey {{name}},\n\ni''m adam — i run transparent city. we turn austin''s open data into a plain-english read so nobody has to dig through dashboards. a few things from {{jurisdiction}} (and citywide) that jumped out this month:\n\n' AS head_d,
    E'\n\nheads up — i''ve gone ahead and subscribed you to a weekly transparent city update for {{jurisdiction}}. first one lands THIS sunday, then one every sunday after — just the numbers that actually moved in your district, nothing else.\n\nif there''s stuff you care about more (housing? public safety? permits?) just hit reply and tell me — i''ll tune it to your interests. not for you? reply "stop" and i''ll take you right off, no worries.\n\np.s. i cc''d your chief of staff so this doesn''t get buried — either of you can reply.\n\ntalk soon,\nadam' AS tail_d,
    E'hey {{name}},\n\ni''m adam — i run transparent city. we turn austin''s open data into a plain-english read so nobody has to dig through dashboards. a few citywide things that jumped out this month:\n\n' AS head_m,
    E'\n\nheads up — i''ve gone ahead and subscribed you to a weekly transparent city update for austin. first one lands THIS sunday, then one every sunday after — just the numbers that actually moved across the city, nothing else.\n\nif there''s stuff you care about more (housing? public safety? permits?) just hit reply and tell me — i''ll tune it to your interests. not for you? reply "stop" and i''ll take you right off, no worries.\n\np.s. i cc''d your chief of staff so this doesn''t get buried — either of you can reply.\n\ntalk soon,\nadam' AS tail_m
)
INSERT INTO templates (name, subject, body, channel, category)
SELECT
  v.name,
  v.subject,
  CASE WHEN v.kind = 'mayor' THEN f.head_m || v.bullets || f.tail_m
       ELSE f.head_d || v.bullets || f.tail_d END,
  'email',
  'Outreach'
FROM (VALUES
  ('Austin Mayor — Weekly Update (invite)', 'mayor',
   'austin graffiti removal requests fell 99% in june — from 142 a month to 1',
   E'• graffiti removal requests through 311 fell 99% in june — from ~142 a month to a single request (almost certainly a reporting change, worth a q to development services)\n• rodent + pest complaints dropped 85% the same month — ~100 a month down to 15 (austin public health would know)\n• animal bite reports hit a 6-month high in march — up 33% citywide, and loose-animal reports doubled'),

  ('Austin D1 — Weekly District Update (invite)', 'district',
   'district 1''s 911 calls are down 12% this year — the biggest drop in austin',
   E'• apd 911 calls in d1 are down 12% so far this year — 1,310 fewer calls, the biggest drop of any district (citywide only fell ~2%)\n• new home construction permits in d1 are down 46% this year — the steepest decline in the city (completions are actually up 28%)\n• citywide: graffiti removal requests fell 99% in june, ~142 a month down to 1 (probably a reporting change)'),

  ('Austin D2 — Weekly District Update (invite)', 'district',
   'district 2 residential permits hit a 6-month high in march — up 33%',
   E'• d2 residential building permits hit a 6-month high in march — 484, up 33%, and d2 led every district in new permits this year\n• narcotic possession records in d2 fell 33% in march — a statistically big drop\n• citywide: graffiti removal requests fell 99% in june (~142/mo to 1) — looks like a reporting change'),

  ('Austin D3 — Weekly District Update (invite)', 'district',
   'district 3 property crime just hit a 6-month low — down 26%',
   E'• d3 property crime fell 26% in february to a 6-month low — notable since d3 usually carries the city''s highest volume\n• violent crime is the flip side though: d3 leads the city this year (256), and neighboring d1 is up 20% — the biggest rise in austin\n• citywide: graffiti removal requests fell 99% in june (~142/mo to 1), likely a reporting change'),

  ('Austin D4 — Weekly District Update (invite)', 'district',
   'active building permits in district 4 more than doubled — up 145%',
   E'• active building permits in d4 more than doubled in march — up 145%, the biggest jump of any district (work actually underway, not just filed)\n• property crime in d4 fell 31% in february to a 6-month low\n• citywide: graffiti removal requests fell 99% in june (~142/mo to 1) — smells like a reporting change'),

  ('Austin D5 — Weekly District Update (invite)', 'district',
   'district 5 had austin''s sharpest property crime drop — down 36%',
   E'• d5 had the sharpest property crime drop in the city in february — down 36% to a 6-month low\n• finalized building permits fell 57% in march though — fewer projects crossing the finish line\n• citywide: graffiti removal requests fell 99% in june (~142/mo to 1), likely a reporting change'),

  ('Austin D6 — Weekly District Update (invite)', 'district',
   'district 6 911 calls are up 29% — bucking the citywide drop',
   E'• d6 apd 911 calls spiked in april, up ~29% — a counter-trend while the city is down ~2%\n• austin animal bite reports hit a 6-month high in march, up 33% (and loose-animal reports doubled)\n• citywide: graffiti removal requests fell 99% in june (~142/mo to 1) — probably a reporting change'),

  ('Austin D7 — Weekly District Update (invite)', 'district',
   'district 7 had austin''s steepest drop in finished permits — down 55%',
   E'• d7 finalized building permits fell 55% in march — the steepest drop in the city (completed, inspected projects)\n• disturbance 911 calls in d7 fell 11% in april to a 6-month low\n• citywide: graffiti removal requests fell 99% in june (~142/mo to 1), likely a reporting change'),

  ('Austin D8 — Weekly District Update (invite)', 'district',
   'disorderly conduct calls in district 8 tripled in april — up 194%',
   E'• disorderly conduct 911 calls in d8 tripled in april — up 194% off a low, stable baseline\n• catalytic converter thefts jumped 243% in march (1.75/mo to 6) — d8 had mostly dodged this trend\n• citywide: graffiti removal requests fell 99% in june (~142/mo to 1) — looks like a reporting change'),

  ('Austin D9 — Weekly District Update (invite)', 'district',
   'marijuana possession records in district 9 more than doubled — up 133%',
   E'• marijuana possession records in d9 more than doubled in march — up 133% (recorded enforcement, not a legal change)\n• 6th street disorderly calls fell 30% in april — and the butcher''s daughter is opening on south congress\n• citywide: graffiti removal requests fell 99% in june (~142/mo to 1), likely a reporting change'),

  ('Austin D10 — Weekly District Update (invite)', 'district',
   'simple assault calls in district 10 fell 48% in april — a 6-month low',
   E'• simple assault 911 calls in d10 fell 48% in april to a 6-month low\n• citywide rodent + pest complaints dropped 85% in june (~100/mo to 15) — probably a reporting change, austin public health would know\n• citywide: graffiti removal requests fell 99% in june (~142/mo to 1), same story')
) AS v(name, kind, subject, bullets)
CROSS JOIN frame f
WHERE NOT EXISTS (
  SELECT 1 FROM templates t WHERE t.name = v.name
);

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- SELECT name, email, jurisdiction, contact_type, city_name
--   FROM prospects WHERE city_id = 56718 ORDER BY jurisdiction;
--
-- SELECT p.name, array_agg(k.name) AS tags
--   FROM prospects p
--   JOIN prospect_keywords pk ON pk.prospect_id = p.id
--   JOIN keywords k ON k.id = pk.keyword_id
--   WHERE p.city_id = 56718 GROUP BY p.name;
--
-- SELECT name, subject FROM templates
--   WHERE name LIKE 'Austin %Weekly%' ORDER BY name;
