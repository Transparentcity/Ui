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
  ('City Council', 'Government', 'City council members and council offices')
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Austin City Council contacts (Mayor + 10 districts)
--    city_id 56718 = Austin, TX (platform cities.id, per public sitemap API)
--    Idempotent insert: only adds a row if the email is not already present.
-- -----------------------------------------------------------------------------
INSERT INTO prospects (name, title, organization, department, email, phone, jurisdiction, contact_type, city_id, city_name, priority, status, notes)
SELECT v.name, v.title, v.organization, v.department, v.email, v.phone, v.jurisdiction, 'city_staff', 56718, 'Austin', 2, 'active', v.notes
FROM (VALUES
  ('Kirk Watson',           'Mayor',                     'Austin City Council', 'Mayor''s Office',    'kirk.watson@austintexas.gov', '(512) 978-2100', 'Citywide',    'Mayor of Austin'),
  ('Natasha Harper-Madison','Council Member, District 1','Austin City Council', 'District 1 Office',  'district1@austintexas.gov',   '(512) 978-2101', 'District 1',  'Northeast Austin'),
  ('Vanessa Fuentes',       'Council Member, District 2','Austin City Council', 'District 2 Office',  'district2@austintexas.gov',   '(512) 978-2102', 'District 2',  'Southeast Austin'),
  ('Jose Velasquez',        'Council Member, District 3','Austin City Council', 'District 3 Office',  'district3@austintexas.gov',   '(512) 978-2103', 'District 3',  'East Austin'),
  ('Jose "Chito" Vela',     'Council Member, District 4','Austin City Council', 'District 4 Office',  'district4@austintexas.gov',   '(512) 978-2104', 'District 4',  'North Central Austin'),
  ('Ryan Alter',            'Council Member, District 5','Austin City Council', 'District 5 Office',  'district5@austintexas.gov',   '(512) 978-2105', 'District 5',  'South Austin'),
  ('Krista Laine',          'Council Member, District 6','Austin City Council', 'District 6 Office',  'district6@austintexas.gov',   '(512) 978-2106', 'District 6',  'Northwest Austin'),
  ('Mike Siegel',           'Council Member, District 7','Austin City Council', 'District 7 Office',  'district7@austintexas.gov',   '(512) 978-2107', 'District 7',  'North Austin'),
  ('Paige Ellis',           'Council Member, District 8','Austin City Council', 'District 8 Office',  'district8@austintexas.gov',   '(512) 978-2108', 'District 8',  'Southwest Austin'),
  ('Zohaib "Zo" Qadri',     'Council Member, District 9','Austin City Council', 'District 9 Office',  'district9@austintexas.gov',   '(512) 978-2109', 'District 9',  'Central Austin'),
  ('Marc Duchen',           'Council Member, District 10','Austin City Council','District 10 Office', 'district10@austintexas.gov',  '(512) 978-2110', 'District 10', 'Northwest/Central Austin')
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
-- 4. Weekly-update invitation email template
--    Casual, handwritten tone (intentional lowercase). Subject + lead headline
--    are real facts from the Austin feed. Personalization tokens supported by
--    src/lib/template-engine.ts: {{name}}, {{jurisdiction}}, {{city}}.
-- -----------------------------------------------------------------------------
INSERT INTO templates (name, subject, body, channel, category)
SELECT
  'Austin Council — Weekly District Update (invite)',
  'austin drug crime is up 29% this year — reversing a 5-year decline',
  E'hey {{name}},\n\n'
  || E'i''m adam — i run transparent city. we turn austin''s open data into a plain-english read so nobody has to dig through dashboards. couple things that jumped out this month:\n\n'
  || E'• austin drug crime up 29%, reversing a five-year decline\n'
  || E'• traffic crashes down 19% — the lowest pace in a decade\n'
  || E'• parking complaints up 27%, now driving the whole 311 surge\n\n'
  || E'heads up — i''ve gone ahead and subscribed you to a weekly transparent city update for {{jurisdiction}}. the first one lands THIS sunday, and you''ll get one every sunday after that. just the numbers that actually moved in your district, nothing else.\n\n'
  || E'if there''s stuff you care about more (housing? public safety? permits?) just hit reply and tell me — i''ll tune it to your interests. and if it''s not for you, reply "stop" and i''ll take you right off, no worries.\n\n'
  || E'talk soon,\nadam',
  'email',
  'Outreach'
WHERE NOT EXISTS (
  SELECT 1 FROM templates t WHERE t.name = 'Austin Council — Weekly District Update (invite)'
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
--   WHERE name = 'Austin Council — Weekly District Update (invite)';
