-- Per-day availability on team_members. daily_hours is the source of truth;
-- hours_per_cycle becomes a generated 4-week total (weekly sum * 4) so existing
-- capacity-engine readers stay unchanged.
--
-- Existing members are backfilled with an even Mon–Fri split of their previous
-- weekly hours and left unconfirmed. Weekends default to 0.

ALTER TABLE team_members
  ADD COLUMN daily_hours jsonb NOT NULL
    DEFAULT '{"mon":8,"tue":8,"wed":8,"thu":8,"fri":8,"sat":0,"sun":0}'::jsonb,
  ADD COLUMN is_daily_hours_confirmed boolean NOT NULL DEFAULT false;

UPDATE team_members
SET daily_hours = jsonb_build_object(
  'mon', ROUND((hours_per_cycle / 4.0 / 5.0)::numeric, 2),
  'tue', ROUND((hours_per_cycle / 4.0 / 5.0)::numeric, 2),
  'wed', ROUND((hours_per_cycle / 4.0 / 5.0)::numeric, 2),
  'thu', ROUND((hours_per_cycle / 4.0 / 5.0)::numeric, 2),
  'fri', ROUND((hours_per_cycle / 4.0 / 5.0)::numeric, 2),
  'sat', 0,
  'sun', 0
);

ALTER TABLE team_members
  DROP COLUMN hours_per_cycle;

ALTER TABLE team_members
  ADD COLUMN hours_per_cycle numeric
    GENERATED ALWAYS AS (
      (
        COALESCE((daily_hours->>'mon')::numeric, 0) +
        COALESCE((daily_hours->>'tue')::numeric, 0) +
        COALESCE((daily_hours->>'wed')::numeric, 0) +
        COALESCE((daily_hours->>'thu')::numeric, 0) +
        COALESCE((daily_hours->>'fri')::numeric, 0) +
        COALESCE((daily_hours->>'sat')::numeric, 0) +
        COALESCE((daily_hours->>'sun')::numeric, 0)
      ) * 4
    ) STORED
    NOT NULL
    CHECK (hours_per_cycle > 0::numeric);
