-- Anonymous page feedback (accurate / wrong)
CREATE TABLE IF NOT EXISTS page_feedback (
  id            SERIAL PRIMARY KEY,
  page_url      TEXT NOT NULL,
  page_type     TEXT,
  feedback_type TEXT NOT NULL,  -- 'accurate' or 'wrong'
  explanation   TEXT,
  ip_hash       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_feedback_url ON page_feedback(page_url);
CREATE INDEX IF NOT EXISTS idx_page_feedback_created ON page_feedback(created_at);
