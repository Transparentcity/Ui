-- =============================================================================
-- Transparent City CRM - Media & Reporters
-- =============================================================================
-- Adds media contacts as a distinct recipient type for anomaly/campaign outreach.
-- Media are city-focused and keyword-matched; they can have multiple article links.
--
-- Column mapping from source:
--   Name           -> name
--   Outlet/Platform -> outlet_platform
--   Title          -> title
--   Keywords       -> media_keywords (join to keywords)
--   Email          -> email
--   Phone          -> phone
--   Primary Beat/Topic -> primary_beat
--   Article Link   -> media_article_links (one-to-many)
--   City/Cities    -> primary_city, coverage_cities
--   Sub-geographies -> sub_geographies (districts, neighborhoods)
-- =============================================================================

-- =============================================================================
-- NEW TABLE: media_contacts
-- =============================================================================
CREATE TABLE IF NOT EXISTS media_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    outlet_platform TEXT,                 -- Outlet/Platform (e.g., "Boston Globe", "NPR")
    title TEXT,                           -- Job title (e.g., "City Hall Reporter")
    email TEXT,
    phone TEXT,
    primary_beat TEXT,                    -- Primary Beat/Topic (e.g., "Housing", "Public Safety")
    primary_city TEXT NOT NULL,           -- Primary city of coverage (e.g., "Boston", "San Francisco") - used for anomaly targeting
    coverage_cities TEXT[] DEFAULT '{}',  -- Additional cities they cover (optional)
    sub_geographies TEXT[] DEFAULT '{}',  -- Districts, neighborhoods within cities (e.g., "D5", "Mission", "Back Bay")
    priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'unsubscribed')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE media_contacts IS 'Media contacts and reporters - city-focused for anomaly targeting';
COMMENT ON COLUMN media_contacts.primary_city IS 'Primary city of coverage - anomaly city matches here for targeting';
COMMENT ON COLUMN media_contacts.coverage_cities IS 'Additional cities they cover - for multi-city reporters';
COMMENT ON COLUMN media_contacts.sub_geographies IS 'Districts/neighborhoods within cities (e.g., D5, Mission) for granular targeting';

CREATE INDEX IF NOT EXISTS idx_media_contacts_status ON media_contacts(status);
CREATE INDEX IF NOT EXISTS idx_media_contacts_primary_city ON media_contacts(primary_city);
CREATE INDEX IF NOT EXISTS idx_media_contacts_email ON media_contacts(email);
CREATE INDEX IF NOT EXISTS idx_media_contacts_name ON media_contacts(name);

-- GIN index for array containment queries (coverage_cities, sub_geographies)
CREATE INDEX IF NOT EXISTS idx_media_contacts_coverage_cities ON media_contacts USING GIN (coverage_cities);
CREATE INDEX IF NOT EXISTS idx_media_contacts_sub_geographies ON media_contacts USING GIN (sub_geographies);

-- =============================================================================
-- NEW TABLE: media_keywords (join table)
-- =============================================================================
-- Links media to their interest keywords - same keywords table as prospects
CREATE TABLE IF NOT EXISTS media_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_contact_id UUID NOT NULL REFERENCES media_contacts(id) ON DELETE CASCADE,
    keyword_id UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(media_contact_id, keyword_id)
);

COMMENT ON TABLE media_keywords IS 'Links media contacts to interest keywords for anomaly matching';

CREATE INDEX IF NOT EXISTS idx_media_keywords_media ON media_keywords(media_contact_id);
CREATE INDEX IF NOT EXISTS idx_media_keywords_keyword ON media_keywords(keyword_id);

-- =============================================================================
-- NEW TABLE: media_article_links
-- =============================================================================
-- URLs to reporter stories - one media contact can have many article links
CREATE TABLE IF NOT EXISTS media_article_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_contact_id UUID NOT NULL REFERENCES media_contacts(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,                           -- Optional article title
    published_at TIMESTAMP WITH TIME ZONE, -- Optional publication date
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE media_article_links IS 'Article/story URLs for media contacts';

CREATE INDEX IF NOT EXISTS idx_media_article_links_media ON media_article_links(media_contact_id);

-- =============================================================================
-- Updated_at trigger for media_contacts
-- =============================================================================
DROP TRIGGER IF EXISTS update_media_contacts_updated_at ON media_contacts;
CREATE TRIGGER update_media_contacts_updated_at
    BEFORE UPDATE ON media_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
