-- Dynamic Email Template System with Variations and Throttling

-- Template variations: Different phrasings for template sections
CREATE TABLE IF NOT EXISTS template_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  variation_key TEXT NOT NULL, -- e.g., 'greeting', 'opening', 'closing', 'signature'
  variations JSONB NOT NULL DEFAULT '[]', -- Array of alternative phrases
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(template_id, variation_key)
);

-- Subject line variations for A/B testing and spam avoidance
CREATE TABLE IF NOT EXISTS subject_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  weight INTEGER DEFAULT 1, -- Higher weight = more likely to be selected
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Send queue for managing throttled delivery
CREATE TABLE IF NOT EXISTS send_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  personalized_subject TEXT,
  personalized_body TEXT,
  anomaly_snippet TEXT, -- Unique anomaly content for this recipient
  variation_seed INTEGER, -- Seed for reproducible variation selection
  priority INTEGER DEFAULT 3,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'cancelled')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Throttle settings for campaigns
CREATE TABLE IF NOT EXISTS campaign_throttle_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE UNIQUE,
  emails_per_minute INTEGER DEFAULT 10,
  emails_per_hour INTEGER DEFAULT 100,
  emails_per_day INTEGER DEFAULT 500,
  min_delay_seconds INTEGER DEFAULT 5, -- Minimum delay between emails
  max_delay_seconds INTEGER DEFAULT 30, -- Maximum delay (randomized)
  randomize_delay BOOLEAN DEFAULT TRUE,
  active_hours_start INTEGER DEFAULT 8, -- 8 AM
  active_hours_end INTEGER DEFAULT 18, -- 6 PM
  active_days TEXT[] DEFAULT ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  respect_timezone BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tone profiles for dynamic content generation
CREATE TABLE IF NOT EXISTS tone_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  formality_level INTEGER DEFAULT 3 CHECK (formality_level >= 1 AND formality_level <= 5), -- 1=casual, 5=very formal
  urgency_level INTEGER DEFAULT 3 CHECK (urgency_level >= 1 AND urgency_level <= 5),
  warmth_level INTEGER DEFAULT 3 CHECK (warmth_level >= 1 AND warmth_level <= 5),
  settings JSONB DEFAULT '{}', -- Additional tone settings
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-seed default tone profiles
INSERT INTO tone_profiles (name, description, formality_level, urgency_level, warmth_level) VALUES
  ('formal', 'Professional formal tone for senior officials', 5, 2, 2),
  ('professional', 'Standard professional business tone', 4, 3, 3),
  ('friendly', 'Warm but still professional', 3, 2, 4),
  ('urgent', 'Time-sensitive matter requiring attention', 4, 5, 2)
ON CONFLICT (name) DO NOTHING;

-- Link templates to tone profiles
ALTER TABLE templates ADD COLUMN IF NOT EXISTS tone_profile_id UUID REFERENCES tone_profiles(id) ON DELETE SET NULL;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS variation_enabled BOOLEAN DEFAULT TRUE;

-- Add organization grouping for same-office detection
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS office_group TEXT; -- Group contacts in same office

-- Track which variations were used for each message (for analytics and deduplication)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS variation_data JSONB;

-- Indexes for send queue performance
CREATE INDEX IF NOT EXISTS idx_send_queue_status ON send_queue(status);
CREATE INDEX IF NOT EXISTS idx_send_queue_scheduled ON send_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_send_queue_campaign ON send_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_office_group ON contacts(office_group);

-- Updated_at triggers
DROP TRIGGER IF EXISTS update_template_variations_updated_at ON template_variations;
CREATE TRIGGER update_template_variations_updated_at
  BEFORE UPDATE ON template_variations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_throttle_settings_updated_at ON campaign_throttle_settings;
CREATE TRIGGER update_throttle_settings_updated_at
  BEFORE UPDATE ON campaign_throttle_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
