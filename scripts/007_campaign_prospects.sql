-- Campaign prospects: which contacts (prospects) are included in a campaign.
-- If a campaign has no rows here, "all active contacts" is used when queueing.
CREATE TABLE IF NOT EXISTS campaign_prospects (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (campaign_id, prospect_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_prospects_campaign ON campaign_prospects(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_prospects_prospect ON campaign_prospects(prospect_id);

COMMENT ON TABLE campaign_prospects IS 'Prospects (contacts) included in each campaign; empty means use all active when queueing';
