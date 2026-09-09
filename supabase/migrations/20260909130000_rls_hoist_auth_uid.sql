-- Wrap auth.uid() as (select auth.uid()) in every RLS policy.
--
-- WHY: a bare auth.uid() is treated as volatile, so Postgres re-evaluates it
-- once per candidate row. Wrapping it in a scalar subquery lets the planner
-- hoist it into an InitPlan, evaluating it once per statement. This is the
-- standard Supabase RLS optimization and changes performance only.
--
-- WHAT IS NOT CHANGING: every predicate, role target (TO authenticated),
-- USING/WITH CHECK split, and policy name is reproduced exactly as it was.
-- The only edit is auth.uid() -> (select auth.uid()). If you diff a policy
-- below against its original definition, that substitution should be the sole
-- difference.
--
-- RISK: unlike the index migration, this DROPs and recreates security policies.
-- Between the DROP and the CREATE inside this transaction the table has no
-- policy, but because the whole migration runs in one transaction, no other
-- session observes that gap. Rollback is at the bottom of this file.

-- ---------------------------------------------------------------------------
-- work_item_phases -- the hot path
-- ---------------------------------------------------------------------------
-- These matter most: getWorkItemsForTeam reads through the anon key with RLS
-- enforced and pulls a nested phases join, so the subquery below was being
-- re-run while filtering every phase row of every work item.

DROP POLICY IF EXISTS "work_item_phases: owner read" ON work_item_phases;
CREATE POLICY "work_item_phases: owner read"
  ON work_item_phases
  FOR SELECT
  USING (
    work_item_id IN (
      SELECT wi.id
      FROM work_items wi
      JOIN teams t ON t.id = wi.team_id
      WHERE t.owner_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "work_item_phases: owner insert" ON work_item_phases;
CREATE POLICY "work_item_phases: owner insert"
  ON work_item_phases
  FOR INSERT
  WITH CHECK (
    work_item_id IN (
      SELECT wi.id
      FROM work_items wi
      JOIN teams t ON t.id = wi.team_id
      WHERE t.owner_user_id = (select auth.uid())
    )
  );

-- Note: the original UPDATE policy declares USING with no WITH CHECK, which
-- means Postgres applies the USING expression to the new row as well. That is
-- preserved deliberately -- adding a WITH CHECK here would change behaviour.
DROP POLICY IF EXISTS "work_item_phases: owner update" ON work_item_phases;
CREATE POLICY "work_item_phases: owner update"
  ON work_item_phases
  FOR UPDATE
  USING (
    work_item_id IN (
      SELECT wi.id
      FROM work_items wi
      JOIN teams t ON t.id = wi.team_id
      WHERE t.owner_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "work_item_phases: owner delete" ON work_item_phases;
CREATE POLICY "work_item_phases: owner delete"
  ON work_item_phases
  FOR DELETE
  USING (
    work_item_id IN (
      SELECT wi.id
      FROM work_items wi
      JOIN teams t ON t.id = wi.team_id
      WHERE t.owner_user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
-- Same antipattern, smaller payoff (a plain column comparison on a small,
-- indexed table). Included so the codebase does not keep one copy of a fixed
-- bug. Note TO authenticated is part of these policies and is preserved.

DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Verify after applying
-- ---------------------------------------------------------------------------
-- Every qual/with_check below should read (SELECT auth.uid()), and there should
-- be six rows -- four for work_item_phases, two for notifications:
--
--   SELECT tablename, policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('work_item_phases', 'notifications')
--   ORDER BY tablename, policyname;
--
-- Then confirm access is unchanged by signing in as a real user and checking
-- that the phase count they can see is the same as before this migration.

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- Re-running the original definitions restores the previous behaviour exactly.
-- Kept commented so it is here if needed, rather than reconstructed under
-- pressure from the 20260908091143 and 20260409000000 migrations:
--
--   DROP POLICY IF EXISTS "work_item_phases: owner read" ON work_item_phases;
--   CREATE POLICY "work_item_phases: owner read" ON work_item_phases FOR SELECT
--     USING (work_item_id IN (SELECT wi.id FROM work_items wi
--       JOIN teams t ON t.id = wi.team_id WHERE t.owner_user_id = auth.uid()));
--
--   DROP POLICY IF EXISTS "work_item_phases: owner insert" ON work_item_phases;
--   CREATE POLICY "work_item_phases: owner insert" ON work_item_phases FOR INSERT
--     WITH CHECK (work_item_id IN (SELECT wi.id FROM work_items wi
--       JOIN teams t ON t.id = wi.team_id WHERE t.owner_user_id = auth.uid()));
--
--   DROP POLICY IF EXISTS "work_item_phases: owner update" ON work_item_phases;
--   CREATE POLICY "work_item_phases: owner update" ON work_item_phases FOR UPDATE
--     USING (work_item_id IN (SELECT wi.id FROM work_items wi
--       JOIN teams t ON t.id = wi.team_id WHERE t.owner_user_id = auth.uid()));
--
--   DROP POLICY IF EXISTS "work_item_phases: owner delete" ON work_item_phases;
--   CREATE POLICY "work_item_phases: owner delete" ON work_item_phases FOR DELETE
--     USING (work_item_id IN (SELECT wi.id FROM work_items wi
--       JOIN teams t ON t.id = wi.team_id WHERE t.owner_user_id = auth.uid()));
--
--   DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
--   CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT
--     TO authenticated USING (auth.uid() = user_id);
--
--   DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
--   CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE
--     TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
