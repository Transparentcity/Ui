-- Page feedback table for collecting user accuracy reports
CREATE TABLE IF NOT EXISTS page_feedback (
  id            SERIAL PRIMARY KEY,
  page_url      TEXT NOT NULL,
  page_type     TEXT,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('accurate', 'wrong')),
  explanation   TEXT DEFAULT '',
  ip_address    TEXT,
  submitter_name  TEXT,
  submitter_email TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_page_feedback_page_url ON page_feedback (page_url);
CREATE INDEX idx_page_feedback_created_at ON page_feedback (created_at);
