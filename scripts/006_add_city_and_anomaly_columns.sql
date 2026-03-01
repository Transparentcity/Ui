-- =============================================================================
-- Migration 006: Add city columns to prospects, anomaly columns to send_queue
-- =============================================================================
-- Required for CRM city-based anomaly matching and compose flow.
-- Run after 005_crm_complete_schema.sql
-- =============================================================================

-- 1. Add city_id and city_name to prospects
--    city_id references the platform's cities table (integer PK)
--    city_name is a denormalized display name for fast rendering
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS city_id INTEGER;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS city_name TEXT;

COMMENT ON COLUMN prospects.city_id IS 'References cities.id from the platform database';
COMMENT ON COLUMN prospects.city_name IS 'Denormalized city display name for fast rendering';

CREATE INDEX IF NOT EXISTS idx_prospects_city_id ON prospects(city_id);

-- 2. Add anomaly_result_id and chart_url to send_queue
--    anomaly_result_id links the draft to the specific anomaly it references
--    chart_url is the pre-generated chart link for the anomaly
ALTER TABLE send_queue ADD COLUMN IF NOT EXISTS anomaly_result_id INTEGER;
ALTER TABLE send_queue ADD COLUMN IF NOT EXISTS chart_url TEXT;

COMMENT ON COLUMN send_queue.anomaly_result_id IS 'References anomaly_results.id used in this draft';
COMMENT ON COLUMN send_queue.chart_url IS 'Pre-generated chart URL for the referenced anomaly';

CREATE INDEX IF NOT EXISTS idx_send_queue_anomaly ON send_queue(anomaly_result_id);

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- Run these to verify:
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'prospects' AND column_name IN ('city_id', 'city_name');
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'send_queue' AND column_name IN ('anomaly_result_id', 'chart_url');
