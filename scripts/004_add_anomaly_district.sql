-- Add district/jurisdiction field to anomalies for location-based matching
-- Anomalies can be district-specific or citywide (null = citywide)

ALTER TABLE anomalies 
ADD COLUMN IF NOT EXISTS district text;

-- Add an index for fast district lookups
CREATE INDEX IF NOT EXISTS idx_anomalies_district ON anomalies(district);

-- Add a "citywide" boolean for anomalies that apply to everyone
ALTER TABLE anomalies 
ADD COLUMN IF NOT EXISTS is_citywide boolean DEFAULT false;

COMMENT ON COLUMN anomalies.district IS 'District number or jurisdiction name (e.g., "D1", "D5", "Mission"). Null means not district-specific.';
COMMENT ON COLUMN anomalies.is_citywide IS 'If true, this anomaly is relevant to all contacts regardless of district or keywords.';
