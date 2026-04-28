-- 012_send_queue_draft_status.sql
--
-- Add a draft_status column to the CRM send_queue so each row records how
-- its draft was generated. The platform's CRM email drafter already
-- returns this in the dict it produces (llm_generated, template_fallback_*),
-- but the matcher / route layer was throwing the field away at insert
-- time. With this column the Review & Send UI can show a badge on each
-- draft so users can prioritize "actually-LLM-generated" over "fell back
-- to a template because the AI service was down".
--
-- Status values match the keys produced by CRMEmailDrafter.generate_draft:
--   llm_generated                    LLM produced parseable JSON
--   template_fallback_config         Auth/permission/config error
--   template_fallback_transient      Rate limit / network / 503
--   template_fallback_timeout        25s envelope blew
--   template_fallback_parse          LLM responded but unparseable
--   template_fallback_empty          LLM returned empty subject/body
--   template_fallback_error          Uncategorized failure
--
-- Default to llm_generated on existing rows so historical drafts don't
-- look retroactively suspect; new rows will carry the actual status.

ALTER TABLE send_queue
    ADD COLUMN IF NOT EXISTS draft_status TEXT NOT NULL DEFAULT 'llm_generated';

-- Lightweight CHECK so a typo in the matcher can't sneak a bogus value
-- past us. Allow NULL because the default handles new rows.
ALTER TABLE send_queue
    DROP CONSTRAINT IF EXISTS send_queue_draft_status_check;

ALTER TABLE send_queue
    ADD CONSTRAINT send_queue_draft_status_check CHECK (
        draft_status IN (
            'llm_generated',
            'template_fallback_config',
            'template_fallback_transient',
            'template_fallback_timeout',
            'template_fallback_parse',
            'template_fallback_empty',
            'template_fallback_error'
        )
    );

-- Useful for the Review & Send page: filter to "drafts that didn't
-- actually use the LLM" so users can quickly scan the ones that need
-- closer review.
CREATE INDEX IF NOT EXISTS idx_send_queue_draft_status_fallback
    ON send_queue (draft_status)
    WHERE draft_status != 'llm_generated';

COMMENT ON COLUMN send_queue.draft_status IS
    'How the draft was generated: llm_generated for clean LLM output, '
    'template_fallback_* for the various failure modes (config, transient, '
    'timeout, parse, empty, error). UI surfaces this as a per-row badge.';
