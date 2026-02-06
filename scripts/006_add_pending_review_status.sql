-- =============================================================================
-- Migration 006: Add pending_review status to send_queue
-- =============================================================================
-- This migration adds a new 'pending_review' status to the send_queue table
-- to support the message review workflow before sending.
-- =============================================================================

-- Drop existing constraint and add new one with pending_review status
ALTER TABLE send_queue 
DROP CONSTRAINT IF EXISTS send_queue_status_check;

ALTER TABLE send_queue 
ADD CONSTRAINT send_queue_status_check 
CHECK (status IN ('pending_review', 'queued', 'processing', 'sent', 'failed', 'cancelled'));

-- Add an index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_send_queue_status ON send_queue(status);

-- Add index for pending review items specifically (partial index)
CREATE INDEX IF NOT EXISTS idx_send_queue_pending_review 
ON send_queue(created_at) 
WHERE status = 'pending_review';

COMMENT ON COLUMN send_queue.status IS 'Message status: pending_review (awaiting approval), queued (approved), processing (being sent), sent, failed, cancelled';
