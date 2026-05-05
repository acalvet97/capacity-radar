-- Explicit indexes on team_id for hot filter columns.
-- Postgres does not auto-create indexes for FK columns, so these ensure fast
-- lookups as team data grows.
CREATE INDEX IF NOT EXISTS idx_work_items_team_id ON work_items (team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members (team_id);
