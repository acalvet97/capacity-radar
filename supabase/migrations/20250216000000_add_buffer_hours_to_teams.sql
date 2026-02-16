-- Add weekly structural buffer to teams
-- Buffer represents operational time not tracked as work items (emails, meetings, admin, delays)
-- Counts as committed hours; does not reduce total capacity
--
-- Run via: supabase db push
-- Or manually in Supabase SQL Editor

ALTER TABLE teams
ADD COLUMN IF NOT EXISTS buffer_hours_per_week INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN teams.buffer_hours_per_week IS 'Weekly structural buffer (hours) - operational load not in work items. Counts as committed.';
