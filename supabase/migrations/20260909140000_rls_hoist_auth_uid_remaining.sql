-- Same (select auth.uid()) hoist as 20260909130000, applied to the seventeen
-- policies that migration did not cover.
--
-- WHY THESE WERE MISSED: these policies were created outside the migrations
-- directory (dashboard), so they are not in the repo. Their definitions below
-- were transcribed from pg_policies on the live database, which is why this
-- file also serves as the first checked-in record of them.
--
-- work_items matters most. getWorkItemsForTeam reads it through the anon key
-- with RLS enforced, and phases hang off it as a nested join -- so the parent
-- policy is evaluated before the work_item_phases one that 20260909130000
-- already fixed. Its subquery filters teams on owner_user_id, so it also uses
-- the index added in 20260909120000.
--
-- EVERY policy below is PERMISSIVE with roles {public}, matching what is live;
-- {public} is the default, so no TO clause is written. UPDATE policies carry
-- USING with no WITH CHECK, exactly as they do today -- Postgres then applies
-- USING to the new row too, and adding a WITH CHECK would change behaviour.
-- Note also that companies, teams and team_work_type_settings have no DELETE
-- policy; that is reproduced as-is, not filled in.
--
-- The only edit anywhere in this file is auth.uid() -> (select auth.uid()).

-- ---------------------------------------------------------------------------
-- work_items -- the hot path
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "work_items: owner read" ON work_items;
CREATE POLICY "work_items: owner read"
  ON work_items
  FOR SELECT
  USING (
    team_id IN (
      SELECT teams.id FROM teams
      WHERE teams.owner_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "work_items: owner insert" ON work_items;
CREATE POLICY "work_items: owner insert"
  ON work_items
  FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT teams.id FROM teams
      WHERE teams.owner_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "work_items: owner update" ON work_items;
CREATE POLICY "work_items: owner update"
  ON work_items
  FOR UPDATE
  USING (
    team_id IN (
      SELECT teams.id FROM teams
      WHERE teams.owner_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "work_items: owner delete" ON work_items;
CREATE POLICY "work_items: owner delete"
  ON work_items
  FOR DELETE
  USING (
    team_id IN (
      SELECT teams.id FROM teams
      WHERE teams.owner_user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- teams -- direct owner comparison, read by getTeamName through the anon key
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "teams: owner read" ON teams;
CREATE POLICY "teams: owner read"
  ON teams
  FOR SELECT
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "teams: owner insert" ON teams;
CREATE POLICY "teams: owner insert"
  ON teams
  FOR INSERT
  WITH CHECK (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "teams: owner update" ON teams;
CREATE POLICY "teams: owner update"
  ON teams
  FOR UPDATE
  USING (owner_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "team_members: owner read" ON team_members;
CREATE POLICY "team_members: owner read"
  ON team_members
  FOR SELECT
  USING (
    team_id IN (
      SELECT teams.id FROM teams
      WHERE teams.owner_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "team_members: owner insert" ON team_members;
CREATE POLICY "team_members: owner insert"
  ON team_members
  FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT teams.id FROM teams
      WHERE teams.owner_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "team_members: owner update" ON team_members;
CREATE POLICY "team_members: owner update"
  ON team_members
  FOR UPDATE
  USING (
    team_id IN (
      SELECT teams.id FROM teams
      WHERE teams.owner_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "team_members: owner delete" ON team_members;
CREATE POLICY "team_members: owner delete"
  ON team_members
  FOR DELETE
  USING (
    team_id IN (
      SELECT teams.id FROM teams
      WHERE teams.owner_user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- team_work_type_settings
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "team_work_type_settings: owner read" ON team_work_type_settings;
CREATE POLICY "team_work_type_settings: owner read"
  ON team_work_type_settings
  FOR SELECT
  USING (
    team_id IN (
      SELECT teams.id FROM teams
      WHERE teams.owner_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "team_work_type_settings: owner insert" ON team_work_type_settings;
CREATE POLICY "team_work_type_settings: owner insert"
  ON team_work_type_settings
  FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT teams.id FROM teams
      WHERE teams.owner_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "team_work_type_settings: owner update" ON team_work_type_settings;
CREATE POLICY "team_work_type_settings: owner update"
  ON team_work_type_settings
  FOR UPDATE
  USING (
    team_id IN (
      SELECT teams.id FROM teams
      WHERE teams.owner_user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- companies -- direct owner comparison
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "companies: owner read" ON companies;
CREATE POLICY "companies: owner read"
  ON companies
  FOR SELECT
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "companies: owner insert" ON companies;
CREATE POLICY "companies: owner insert"
  ON companies
  FOR INSERT
  WITH CHECK (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "companies: owner update" ON companies;
CREATE POLICY "companies: owner update"
  ON companies
  FOR UPDATE
  USING (owner_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Verify after applying
-- ---------------------------------------------------------------------------
-- No row should contain a bare auth.uid() any more. This should return zero
-- rows across the whole schema:
--
--   SELECT tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
--     AND COALESCE(qual, '') NOT LIKE '%SELECT auth.uid()%'
--     AND COALESCE(with_check, '') NOT LIKE '%SELECT auth.uid()%';
--
-- Then confirm access is unchanged in the app: a signed-in user still sees
-- their own work items, phases, team members and settings -- and no others.

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- Re-run each CREATE POLICY above with (select auth.uid()) replaced by
-- auth.uid(). Nothing else about these policies changed, so that restores the
-- exact definitions recorded from pg_policies before this migration.
