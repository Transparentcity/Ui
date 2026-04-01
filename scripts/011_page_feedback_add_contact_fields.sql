-- Add optional name and email fields to page feedback
ALTER TABLE page_feedback ADD COLUMN IF NOT EXISTS submitter_name  TEXT;
ALTER TABLE page_feedback ADD COLUMN IF NOT EXISTS submitter_email TEXT;
