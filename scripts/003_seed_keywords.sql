-- Seed keywords for TransparentCity CRM
-- Designed to cover the major topic areas that different city employees and departments care about
-- Keywords are intentionally kept general to enable broad matching

-- PUBLIC SAFETY category - covers police, fire, emergency management
INSERT INTO keywords (name, category, description) VALUES
  ('Public Safety', 'Public Safety', 'Crime trends, emergency response, and general safety metrics'),
  ('Emergency Response', 'Public Safety', '911 calls, response times, and emergency services'),
  ('Fire Services', 'Public Safety', 'Fire incidents, fire department operations, and fire safety')
ON CONFLICT (name) DO NOTHING;

-- TRANSPORTATION category - covers SFMTA, traffic enforcement, mobility
INSERT INTO keywords (name, category, description) VALUES
  ('Transportation', 'Transportation', 'Transit, traffic patterns, parking, and mobility'),
  ('Traffic Safety', 'Transportation', 'Traffic incidents, Vision Zero, and road safety'),
  ('Transit Operations', 'Transportation', 'Muni, BART connections, and public transit metrics')
ON CONFLICT (name) DO NOTHING;

-- CITY SERVICES category - covers Public Works, DPW, 311
INSERT INTO keywords (name, category, description) VALUES
  ('City Services', 'City Services', '311 requests, service delivery, and resident concerns'),
  ('Infrastructure', 'City Services', 'Streets, sidewalks, utilities, and public infrastructure'),
  ('Sanitation', 'City Services', 'Street cleaning, trash collection, and waste management')
ON CONFLICT (name) DO NOTHING;

-- HOUSING & DEVELOPMENT category - covers planning, building, housing authority
INSERT INTO keywords (name, category, description) VALUES
  ('Housing', 'Housing & Development', 'Affordable housing, rent, and housing stability'),
  ('Building & Construction', 'Housing & Development', 'Building permits, construction, and development projects'),
  ('Land Use & Planning', 'Housing & Development', 'Zoning, planning applications, and neighborhood development')
ON CONFLICT (name) DO NOTHING;

-- BUDGET & FINANCE category - covers controller, assessor, budget office
INSERT INTO keywords (name, category, description) VALUES
  ('Budget & Spending', 'Budget & Finance', 'City budget, department spending, and fiscal health'),
  ('Revenue & Taxes', 'Budget & Finance', 'Tax collection, revenue trends, and assessments')
ON CONFLICT (name) DO NOTHING;

-- HEALTH & HUMAN SERVICES category - covers DPH, HSA, social services
INSERT INTO keywords (name, category, description) VALUES
  ('Public Health', 'Health & Human Services', 'Health statistics, disease prevention, and healthcare access'),
  ('Human Services', 'Health & Human Services', 'Social services, benefits, and support programs'),
  ('Homelessness', 'Health & Human Services', 'Homeless services, encampments, and outreach programs')
ON CONFLICT (name) DO NOTHING;

-- BUSINESS & ECONOMY category - covers OEWD, small business, workforce
INSERT INTO keywords (name, category, description) VALUES
  ('Business', 'Business & Economy', 'Business registrations, licenses, and economic activity'),
  ('Workforce & Employment', 'Business & Economy', 'Jobs, unemployment, and workforce development')
ON CONFLICT (name) DO NOTHING;

-- ENVIRONMENT & PARKS category - covers SFEnvironment, Parks & Rec
INSERT INTO keywords (name, category, description) VALUES
  ('Environment', 'Environment & Parks', 'Environmental quality, sustainability, and climate initiatives'),
  ('Parks & Recreation', 'Environment & Parks', 'Parks, recreation programs, and open spaces')
ON CONFLICT (name) DO NOTHING;

-- PERMITS & LICENSING category - covers DBI, business licenses, special permits
INSERT INTO keywords (name, category, description) VALUES
  ('Permits', 'Permits & Licensing', 'Building permits, special permits, and approval timelines')
ON CONFLICT (name) DO NOTHING;
