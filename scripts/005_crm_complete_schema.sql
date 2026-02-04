-- =============================================================================
-- Transparent City CRM - Complete Database Schema
-- =============================================================================
-- Run this migration against your PostgreSQL database to create all CRM tables.
-- 
-- IMPORTANT: The `anomaly_results` table is assumed to ALREADY EXIST in your database.
-- This migration does NOT modify anomaly_results - it creates a separate CRM metadata table.
--
-- ARCHITECTURE:
-- - anomaly_results remains untouched (owned by TransparentCity Platform)
-- - crm_anomaly_metadata stores CRM-specific data with a foreign key to anomaly_results.id
-- - The existing anomaly_results.id is SERIAL (integer), not UUID
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- NEW TABLE: crm_anomaly_metadata
-- =============================================================================
-- CRM-specific metadata for anomalies - separate from core anomaly_results table
-- This allows the CRM to track additional data without modifying the platform's tables

CREATE TABLE IF NOT EXISTS crm_anomaly_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anomaly_id INTEGER NOT NULL UNIQUE,  -- References anomaly_results.id (SERIAL/INTEGER)
    district_label TEXT,                  -- CRM-friendly district name (e.g., "D5", "District 11")
    is_citywide BOOLEAN DEFAULT false,    -- True if relevant to all officials regardless of district
    severity TEXT DEFAULT 'medium',       -- Severity level: low, medium, high, critical
    crm_status TEXT DEFAULT 'new',        -- CRM workflow status: new, sent, acknowledged, resolved
    notes TEXT,                            -- Internal CRM notes about this anomaly
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE crm_anomaly_metadata IS 'CRM-specific metadata for anomalies - does not modify anomaly_results table';
COMMENT ON COLUMN crm_anomaly_metadata.anomaly_id IS 'References anomaly_results.id (INTEGER/SERIAL from Platform)';
COMMENT ON COLUMN crm_anomaly_metadata.district_label IS 'CRM district label for matching officials (e.g., D5, District 11)';
COMMENT ON COLUMN crm_anomaly_metadata.is_citywide IS 'True if this anomaly is relevant to all contacts regardless of district';
COMMENT ON COLUMN crm_anomaly_metadata.severity IS 'CRM severity assessment: low, medium, high, critical';
COMMENT ON COLUMN crm_anomaly_metadata.crm_status IS 'CRM workflow status: new, sent, acknowledged, resolved';

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_crm_anomaly_metadata_anomaly_id ON crm_anomaly_metadata(anomaly_id);
CREATE INDEX IF NOT EXISTS idx_crm_anomaly_metadata_district_label ON crm_anomaly_metadata(district_label);
CREATE INDEX IF NOT EXISTS idx_crm_anomaly_metadata_is_citywide ON crm_anomaly_metadata(is_citywide);
CREATE INDEX IF NOT EXISTS idx_crm_anomaly_metadata_crm_status ON crm_anomaly_metadata(crm_status);
CREATE INDEX IF NOT EXISTS idx_crm_anomaly_metadata_severity ON crm_anomaly_metadata(severity);

-- =============================================================================
-- NEW TABLE: prospects (government officials/contacts)
-- =============================================================================
CREATE TABLE IF NOT EXISTS prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    title TEXT,
    department TEXT,
    organization TEXT,
    email TEXT,
    phone TEXT,
    jurisdiction TEXT,              -- District number (e.g., "D5", "District 11") - used for matching anomalies
    priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'unsubscribed')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE prospects IS 'Government officials and contacts for outreach';
COMMENT ON COLUMN prospects.jurisdiction IS 'District/area for matching anomalies (e.g., D5, District 11)';
COMMENT ON COLUMN prospects.priority IS '1=highest priority, 5=lowest priority';

CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_jurisdiction ON prospects(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(email);

-- =============================================================================
-- NEW TABLE: keywords (for topic-based matching)
-- =============================================================================
CREATE TABLE IF NOT EXISTS keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    category TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE keywords IS 'Keywords/topics for matching anomalies to contacts by interest area';

-- =============================================================================
-- NEW TABLE: prospect_keywords (join table)
-- =============================================================================
CREATE TABLE IF NOT EXISTS prospect_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    keyword_id UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(prospect_id, keyword_id)
);

COMMENT ON TABLE prospect_keywords IS 'Links prospects to their interest keywords';

CREATE INDEX IF NOT EXISTS idx_prospect_keywords_prospect ON prospect_keywords(prospect_id);
CREATE INDEX IF NOT EXISTS idx_prospect_keywords_keyword ON prospect_keywords(keyword_id);

-- =============================================================================
-- NEW TABLE: anomaly_keywords (join table)
-- =============================================================================
-- NOTE: anomaly_id is INTEGER to match existing anomaly_results.id (SERIAL)
CREATE TABLE IF NOT EXISTS anomaly_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anomaly_id INTEGER NOT NULL,    -- References anomaly_results(id) which is SERIAL/INTEGER
    keyword_id UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(anomaly_id, keyword_id)
);

COMMENT ON TABLE anomaly_keywords IS 'Links anomalies to topic keywords for interest-based matching';
COMMENT ON COLUMN anomaly_keywords.anomaly_id IS 'References anomaly_results.id (INTEGER/SERIAL)';

CREATE INDEX IF NOT EXISTS idx_anomaly_keywords_anomaly ON anomaly_keywords(anomaly_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_keywords_keyword ON anomaly_keywords(keyword_id);

-- =============================================================================
-- NEW TABLE: templates (email templates)
-- =============================================================================
CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
    category TEXT,
    variation_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE templates IS 'Email and SMS templates for campaigns';

-- =============================================================================
-- NEW TABLE: template_variations (for dynamic content)
-- =============================================================================
CREATE TABLE IF NOT EXISTS template_variations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    variation_key TEXT NOT NULL,    -- e.g., 'greeting', 'opening', 'closing'
    variations TEXT[] NOT NULL,     -- Array of variation strings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_variations_template ON template_variations(template_id);

-- =============================================================================
-- NEW TABLE: subject_variations
-- =============================================================================
CREATE TABLE IF NOT EXISTS subject_variations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    weight INTEGER DEFAULT 1,       -- Higher weight = more likely to be selected
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subject_variations_template ON subject_variations(template_id);

-- =============================================================================
-- NEW TABLE: campaigns
-- =============================================================================
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed')),
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE campaigns IS 'Email campaigns for organized outreach';

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- =============================================================================
-- NEW TABLE: messages (sent/pending messages)
-- =============================================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
    subject TEXT,
    body TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'sent', 'delivered', 'failed', 'bounced')),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    external_id TEXT,               -- ID from email provider (SendGrid, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE messages IS 'Individual messages sent or pending';

CREATE INDEX IF NOT EXISTS idx_messages_campaign ON messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_messages_prospect ON messages(prospect_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

-- =============================================================================
-- NEW TABLE: responses (tracking replies)
-- =============================================================================
CREATE TABLE IF NOT EXISTS responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'phone', 'other')),
    content TEXT,
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'needs_followup')),
    priority INTEGER DEFAULT 3,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'actioned', 'archived')),
    action_required BOOLEAN DEFAULT false,
    action_notes TEXT,
    responded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE responses IS 'Responses received from contacts';

CREATE INDEX IF NOT EXISTS idx_responses_prospect ON responses(prospect_id);
CREATE INDEX IF NOT EXISTS idx_responses_status ON responses(status);

-- =============================================================================
-- NEW TABLE: followups (scheduled follow-up tasks)
-- =============================================================================
CREATE TABLE IF NOT EXISTS followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    response_id UUID REFERENCES responses(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'overdue')),
    priority INTEGER DEFAULT 3,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE followups IS 'Scheduled follow-up tasks for contacts';

CREATE INDEX IF NOT EXISTS idx_followups_prospect ON followups(prospect_id);
CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);
CREATE INDEX IF NOT EXISTS idx_followups_due_date ON followups(due_date);

-- =============================================================================
-- NEW TABLE: send_queue (email queue for throttled sending)
-- =============================================================================
CREATE TABLE IF NOT EXISTS send_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
    personalized_subject TEXT,
    personalized_body TEXT,
    anomaly_snippet TEXT,           -- Pre-rendered anomaly content for this email
    variation_seed INTEGER,         -- Seed for deterministic variation selection
    priority INTEGER DEFAULT 3,
    status TEXT DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'queued', 'processing', 'sent', 'failed', 'cancelled')),
    scheduled_for TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE send_queue IS 'Queue for throttled email sending';

CREATE INDEX IF NOT EXISTS idx_send_queue_status ON send_queue(status);
CREATE INDEX IF NOT EXISTS idx_send_queue_scheduled ON send_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_send_queue_campaign ON send_queue(campaign_id);

-- =============================================================================
-- NEW TABLE: campaign_throttle_settings
-- =============================================================================
CREATE TABLE IF NOT EXISTS campaign_throttle_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    emails_per_minute INTEGER DEFAULT 5,
    emails_per_hour INTEGER DEFAULT 20,
    emails_per_day INTEGER DEFAULT 100,
    min_delay_seconds INTEGER DEFAULT 30,
    max_delay_seconds INTEGER DEFAULT 120,
    randomize_delay BOOLEAN DEFAULT true,
    active_hours_start INTEGER DEFAULT 9 CHECK (active_hours_start >= 0 AND active_hours_start <= 23),
    active_hours_end INTEGER DEFAULT 17 CHECK (active_hours_end >= 0 AND active_hours_end <= 23),
    active_days TEXT[] DEFAULT ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    respect_timezone BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE campaign_throttle_settings IS 'Rate limiting settings per campaign';

-- =============================================================================
-- NEW TABLE: tone_profiles (for AI-generated content)
-- =============================================================================
CREATE TABLE IF NOT EXISTS tone_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    formality_level INTEGER DEFAULT 3 CHECK (formality_level >= 1 AND formality_level <= 5),
    urgency_level INTEGER DEFAULT 3 CHECK (urgency_level >= 1 AND urgency_level <= 5),
    warmth_level INTEGER DEFAULT 3 CHECK (warmth_level >= 1 AND warmth_level <= 5),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE tone_profiles IS 'Voice/tone profiles for AI-generated email variations';

-- =============================================================================
-- SEED DATA: Default keywords for San Francisco
-- NOTE: Keywords are seeded in 003_seed_keywords.sql - see that file for the
-- comprehensive keyword list covering all city departments and topic areas
-- =============================================================================
-- (Seed data moved to 003_seed_keywords.sql to avoid duplicates)

-- =============================================================================
-- SEED DATA: Default tone profile
-- =============================================================================
INSERT INTO tone_profiles (name, description, formality_level, urgency_level, warmth_level) VALUES
    ('Professional Default', 'Standard professional tone for government correspondence', 4, 3, 3)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- HELPER FUNCTION: Update updated_at timestamp
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['crm_anomaly_metadata', 'prospects', 'templates', 'campaigns', 'campaign_throttle_settings', 'template_variations'])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
            CREATE TRIGGER update_%I_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END $$;

-- =============================================================================
-- VERIFICATION QUERY
-- =============================================================================
-- Run this to verify all tables were created:
--
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('crm_anomaly_metadata', 'prospects', 'keywords', 'prospect_keywords', 
--                    'anomaly_keywords', 'templates', 'campaigns', 'messages', 'responses', 
--                    'followups', 'send_queue', 'campaign_throttle_settings', 'tone_profiles',
--                    'template_variations', 'subject_variations');
--
-- Check crm_anomaly_metadata table structure:
--
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'crm_anomaly_metadata'
-- ORDER BY ordinal_position;
