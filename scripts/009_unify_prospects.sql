-- =============================================================================
-- Unify media and city staff into single prospects table
-- =============================================================================
-- Both media and city staff are prospects. contact_type: 'city_staff' | 'media'
-- Migrates media_contacts data into prospects, then drops media tables.
-- =============================================================================

-- 1. Add contact_type and media columns to prospects
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS contact_type TEXT DEFAULT 'city_staff'
    CHECK (contact_type IN ('city_staff', 'media')),
  ADD COLUMN IF NOT EXISTS outlet_platform TEXT,
  ADD COLUMN IF NOT EXISTS primary_beat TEXT,
  ADD COLUMN IF NOT EXISTS primary_city TEXT,
  ADD COLUMN IF NOT EXISTS coverage_cities TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sub_geographies TEXT[] DEFAULT '{}';

COMMENT ON COLUMN prospects.contact_type IS 'city_staff = government officials, media = reporters';
COMMENT ON COLUMN prospects.outlet_platform IS 'Outlet/Platform (media only, e.g. Boston Globe)';
COMMENT ON COLUMN prospects.primary_city IS 'Primary city for media - used for anomaly targeting';

-- Set existing prospects to city_staff (they have no contact_type yet)
UPDATE prospects SET contact_type = 'city_staff' WHERE contact_type IS NULL;

-- 2. Create prospect_article_links (for media article URLs)
CREATE TABLE IF NOT EXISTS prospect_article_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prospect_article_links_prospect ON prospect_article_links(prospect_id);

-- 3. Migrate media_contacts → prospects (only if media_contacts exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'media_contacts') THEN
    INSERT INTO prospects (
      id, name, title, email, phone, contact_type,
      organization, outlet_platform, primary_beat, primary_city, coverage_cities, sub_geographies,
      priority, status, notes, created_at, updated_at
    )
    SELECT
      id, name, title, email, phone, 'media',
      outlet_platform, outlet_platform, primary_beat, primary_city,
      COALESCE(coverage_cities, '{}'), COALESCE(sub_geographies, '{}'),
      priority, status, notes, created_at, updated_at
    FROM media_contacts
    ON CONFLICT (id) DO NOTHING;

    -- 4. Migrate media_keywords → prospect_keywords
    INSERT INTO prospect_keywords (prospect_id, keyword_id, created_at)
    SELECT media_contact_id, keyword_id, created_at FROM media_keywords
    ON CONFLICT (prospect_id, keyword_id) DO NOTHING;

    -- 5. Migrate media_article_links → prospect_article_links
    INSERT INTO prospect_article_links (prospect_id, url, title, published_at, created_at)
    SELECT media_contact_id, url, title, published_at, created_at FROM media_article_links;

    -- 6. Drop media tables
    DROP TABLE IF EXISTS media_article_links;
    DROP TABLE IF EXISTS media_keywords;
    DROP TABLE IF EXISTS media_contacts;
  END IF;
END $$;

-- 7. Index for contact_type filtering
CREATE INDEX IF NOT EXISTS idx_prospects_contact_type ON prospects(contact_type);
CREATE INDEX IF NOT EXISTS idx_prospects_primary_city ON prospects(primary_city);
