-- Project phases: split a work item into ordered phases, each with its own
-- owner, deadline and estimated hours.
--
-- work_items.estimated_hours becomes derived (sum of phases) whenever phases
-- exist. The capacity engine still reads that stored column, so phase mutations
-- and the hours sync MUST commit together -- hence the RPCs at the bottom of
-- this file rather than two sequential writes from the application.

CREATE TABLE work_item_phases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id    uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  -- Nullable: a phase can stay unassigned, and removing a team member must not
  -- delete their phases.
  owner_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  deadline        date NOT NULL,
  estimated_hours numeric(7,2) NOT NULL CHECK (estimated_hours > 0),
  -- Display sequence, not necessarily chronological. Never unique: reorder
  -- rewrites the whole set to 0..n-1, which would trip a unique constraint
  -- mid-statement.
  sort_order      integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_item_phases_work_item_id
  ON work_item_phases (work_item_id);

CREATE INDEX idx_work_item_phases_work_item_id_sort_order
  ON work_item_phases (work_item_id, sort_order);

-- For future "my phases" style queries.
CREATE INDEX idx_work_item_phases_owner_member_id
  ON work_item_phases (owner_member_id);

CREATE TRIGGER trg_work_item_phases_updated_at
  BEFORE UPDATE ON work_item_phases
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- RLS: mirrors the owner-scoped pattern on work_items / team_members, reached
-- through the parent work item.
ALTER TABLE work_item_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_item_phases: owner read"
  ON work_item_phases
  FOR SELECT
  USING (
    work_item_id IN (
      SELECT wi.id
      FROM work_items wi
      JOIN teams t ON t.id = wi.team_id
      WHERE t.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "work_item_phases: owner insert"
  ON work_item_phases
  FOR INSERT
  WITH CHECK (
    work_item_id IN (
      SELECT wi.id
      FROM work_items wi
      JOIN teams t ON t.id = wi.team_id
      WHERE t.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "work_item_phases: owner update"
  ON work_item_phases
  FOR UPDATE
  USING (
    work_item_id IN (
      SELECT wi.id
      FROM work_items wi
      JOIN teams t ON t.id = wi.team_id
      WHERE t.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "work_item_phases: owner delete"
  ON work_item_phases
  FOR DELETE
  USING (
    work_item_id IN (
      SELECT wi.id
      FROM work_items wi
      JOIN teams t ON t.id = wi.team_id
      WHERE t.owner_user_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- Atomic mutations
-- ---------------------------------------------------------------------------
-- All functions are SECURITY INVOKER so the policies above (and those on
-- work_items) still apply -- a caller can only touch phases of a work item on
-- a team they own.

-- Recompute work_items.estimated_hours from the phase rows.
--
-- SUM over zero rows is NULL, so deleting the last phase keeps the previous
-- total and the manual hours field becomes editable again. That also makes this
-- a no-op for any work item whose stored total is already consistent, which is
-- why it is safe to expose.
CREATE OR REPLACE FUNCTION public.sync_work_item_estimated_hours(
  p_work_item_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.work_items wi
  SET estimated_hours = COALESCE(
    (
      SELECT SUM(p.estimated_hours)
      FROM public.work_item_phases p
      WHERE p.work_item_id = p_work_item_id
    ),
    wi.estimated_hours
  )
  WHERE wi.id = p_work_item_id;
$$;

COMMENT ON FUNCTION public.sync_work_item_estimated_hours(uuid) IS
  'Sets work_items.estimated_hours to the sum of its phases. No-op when the work item has no phases.';


-- Guard: an owner must be a member of the same team as the parent work item.
-- The FK to team_members alone does not enforce that.
CREATE OR REPLACE FUNCTION public.assert_phase_owner_in_team(
  p_owner_member_id uuid,
  p_team_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_owner_member_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.id = p_owner_member_id
      AND tm.team_id = p_team_id
  ) THEN
    RAISE EXCEPTION 'Phase owner must be a member of the same team as the work item'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.create_work_item_phase(
  p_work_item_id uuid,
  p_name text,
  p_deadline date,
  p_estimated_hours numeric,
  p_owner_member_id uuid DEFAULT NULL
)
RETURNS public.work_item_phases
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_team_id uuid;
  v_sort_order integer;
  v_phase public.work_item_phases;
BEGIN
  -- RLS hides work items on other teams, so "not visible" and "does not exist"
  -- collapse into the same error on purpose.
  SELECT wi.team_id INTO v_team_id
  FROM public.work_items wi
  WHERE wi.id = p_work_item_id;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Work item not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.assert_phase_owner_in_team(p_owner_member_id, v_team_id);

  SELECT COALESCE(MAX(p.sort_order) + 1, 0) INTO v_sort_order
  FROM public.work_item_phases p
  WHERE p.work_item_id = p_work_item_id;

  INSERT INTO public.work_item_phases (
    work_item_id, name, owner_member_id, deadline, estimated_hours, sort_order
  )
  VALUES (
    p_work_item_id,
    trim(p_name),
    p_owner_member_id,
    p_deadline,
    p_estimated_hours,
    v_sort_order
  )
  RETURNING * INTO v_phase;

  PERFORM public.sync_work_item_estimated_hours(p_work_item_id);

  RETURN v_phase;
END;
$$;


CREATE OR REPLACE FUNCTION public.update_work_item_phase(
  p_phase_id uuid,
  p_name text,
  p_deadline date,
  p_estimated_hours numeric,
  p_owner_member_id uuid DEFAULT NULL
)
RETURNS public.work_item_phases
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_work_item_id uuid;
  v_team_id uuid;
  v_phase public.work_item_phases;
BEGIN
  SELECT p.work_item_id INTO v_work_item_id
  FROM public.work_item_phases p
  WHERE p.id = p_phase_id;

  IF v_work_item_id IS NULL THEN
    RAISE EXCEPTION 'Phase not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT wi.team_id INTO v_team_id
  FROM public.work_items wi
  WHERE wi.id = v_work_item_id;

  PERFORM public.assert_phase_owner_in_team(p_owner_member_id, v_team_id);

  UPDATE public.work_item_phases p
  SET name = trim(p_name),
      owner_member_id = p_owner_member_id,
      deadline = p_deadline,
      estimated_hours = p_estimated_hours
  WHERE p.id = p_phase_id
  RETURNING * INTO v_phase;

  IF v_phase.id IS NULL THEN
    RAISE EXCEPTION 'Phase not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.sync_work_item_estimated_hours(v_work_item_id);

  RETURN v_phase;
END;
$$;


-- Returns true when the work item has no phases left, so the UI can tell the
-- user their manual hours field is editable again.
CREATE OR REPLACE FUNCTION public.delete_work_item_phase(
  p_phase_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_work_item_id uuid;
  v_remaining integer;
BEGIN
  SELECT p.work_item_id INTO v_work_item_id
  FROM public.work_item_phases p
  WHERE p.id = p_phase_id;

  IF v_work_item_id IS NULL THEN
    RAISE EXCEPTION 'Phase not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.work_item_phases p
  WHERE p.id = p_phase_id;

  -- Close the gap left in the sequence.
  WITH ordered AS (
    SELECT p.id, ROW_NUMBER() OVER (ORDER BY p.sort_order, p.created_at) - 1 AS new_order
    FROM public.work_item_phases p
    WHERE p.work_item_id = v_work_item_id
  )
  UPDATE public.work_item_phases p
  SET sort_order = ordered.new_order
  FROM ordered
  WHERE p.id = ordered.id
    AND p.sort_order <> ordered.new_order;

  PERFORM public.sync_work_item_estimated_hours(v_work_item_id);

  SELECT COUNT(*) INTO v_remaining
  FROM public.work_item_phases p
  WHERE p.work_item_id = v_work_item_id;

  RETURN v_remaining = 0;
END;
$$;


-- p_phase_ids must list every phase of the work item, in the desired order.
CREATE OR REPLACE FUNCTION public.reorder_work_item_phases(
  p_work_item_id uuid,
  p_phase_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_existing integer;
  v_supplied integer;
  v_distinct integer;
BEGIN
  SELECT COUNT(*) INTO v_existing
  FROM public.work_item_phases p
  WHERE p.work_item_id = p_work_item_id;

  IF v_existing = 0 THEN
    RAISE EXCEPTION 'Work item has no phases to reorder'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_supplied := COALESCE(array_length(p_phase_ids, 1), 0);

  SELECT COUNT(DISTINCT x) INTO v_distinct
  FROM unnest(p_phase_ids) AS x;

  IF v_supplied <> v_existing OR v_distinct <> v_existing THEN
    RAISE EXCEPTION 'Reorder must list each phase of the work item exactly once'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.work_item_phases p
  SET sort_order = ids.ord - 1
  FROM unnest(p_phase_ids) WITH ORDINALITY AS ids(phase_id, ord)
  WHERE p.id = ids.phase_id
    AND p.work_item_id = p_work_item_id;

  -- Reordering cannot change the total, but keeping the sync here means every
  -- phase mutation leaves the derived hours provably correct.
  PERFORM public.sync_work_item_estimated_hours(p_work_item_id);
END;
$$;


-- Functions in public are executable by PUBLIC by default, and Supabase's
-- default privileges also grant anon. RLS would already block a signed-out
-- caller, but keep the exposed surface to signed-in callers only.
REVOKE ALL ON FUNCTION public.sync_work_item_estimated_hours(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_phase_owner_in_team(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_work_item_phase(uuid, text, date, numeric, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_work_item_phase(uuid, text, date, numeric, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_work_item_phase(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reorder_work_item_phases(uuid, uuid[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.sync_work_item_estimated_hours(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_phase_owner_in_team(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_work_item_phase(uuid, text, date, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_work_item_phase(uuid, text, date, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_work_item_phase(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_work_item_phases(uuid, uuid[]) TO authenticated;
