-- Indexes for the three hottest read paths. All additive: no table is rewritten
-- and no existing index is dropped, so this is safe to roll back by dropping
-- the three indexes below.
--
-- NOTE ON LOCKING: plain CREATE INDEX takes a SHARE lock, which blocks writes
-- to the table until it completes. That is milliseconds on small tables. If any
-- of these tables has grown large, run the CONCURRENTLY variants noted below
-- instead -- but those cannot run inside a transaction, so they must be applied
-- outside this migration (e.g. from the SQL editor), one statement at a time.

-- 1. teams (owner_user_id, id)
--
-- The single most valuable index here: owner_user_id had no index at all, yet
-- it is the most frequently filtered column in the app.
--
-- Serves readOwnedTeam in lib/db/ensurePersonalTeamForUser.ts, which runs on
-- essentially every authenticated request:
--     WHERE owner_user_id = $1 ORDER BY id LIMIT 1
-- Including id as the second column lets that ORDER BY ... LIMIT 1 be answered
-- from the index directly, with no sort step.
--
-- Also serves app/actions/account.ts and app/actions/onboarding.ts, and -- the
-- reason it matters most -- the four work_item_phases RLS policies, which each
-- join `teams t ON t.owner_user_id = auth.uid()` while filtering phase rows.
-- CONCURRENTLY variant:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teams_owner_user_id ON teams (owner_user_id, id);
CREATE INDEX IF NOT EXISTS idx_teams_owner_user_id
  ON teams (owner_user_id, id);

-- 2. work_items (team_id, deadline)
--
-- Serves the staleness-notification scan in lib/notifications.ts:
--     WHERE team_id = $1 AND deadline >= $2 AND deadline <= $3
-- Only team_id was indexed, so the deadline range was filtered by re-checking
-- every one of the team's work items.
-- CONCURRENTLY variant:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_items_team_deadline ON work_items (team_id, deadline);
CREATE INDEX IF NOT EXISTS idx_work_items_team_deadline
  ON work_items (team_id, deadline);

-- 3. work_items (team_id, created_at DESC)
--
-- Serves getWorkItemsForTeam in lib/db/getWorkItemsForTeam.ts, which backs the
-- dashboard, committed-work and evaluate pages:
--     WHERE team_id = $1 ORDER BY created_at DESC
-- The DESC matches the query's direction so the sort is eliminated rather than
-- reversed.
-- CONCURRENTLY variant:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_items_team_created_at ON work_items (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_items_team_created_at
  ON work_items (team_id, created_at DESC);

-- FOLLOW-UP, deliberately not done here: idx_work_items_team_id (added in
-- 20260505000000) is now redundant -- both new indexes lead with team_id, so
-- either can serve a team_id-only lookup. Dropping it would reclaim space and
-- remove write overhead, but that should be a separate change made after
-- checking pg_stat_user_indexes shows the new indexes are actually being used:
--
--   SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
--   WHERE relname = 'work_items';
