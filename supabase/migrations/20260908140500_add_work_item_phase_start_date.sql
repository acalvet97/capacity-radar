-- Optional explicit start for a phase. When null, the app infers start as the
-- day after the previous phase's deadline, or the parent work item's start.
-- Day-by-day front-load allocation is derived on read, not stored.

ALTER TABLE work_item_phases
  ADD COLUMN start_date date NULL;

COMMENT ON COLUMN work_item_phases.start_date IS
  'Optional explicit start. Null means infer from the previous phase or the work item.';


-- CREATE OR REPLACE cannot add parameters, so drop the 5-arg signatures first.
DROP FUNCTION IF EXISTS public.create_work_item_phase(uuid, text, date, numeric, uuid);
DROP FUNCTION IF EXISTS public.update_work_item_phase(uuid, text, date, numeric, uuid);


CREATE OR REPLACE FUNCTION public.create_work_item_phase(
  p_work_item_id uuid,
  p_name text,
  p_deadline date,
  p_estimated_hours numeric,
  p_owner_member_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL
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
    work_item_id, name, owner_member_id, deadline, estimated_hours, sort_order, start_date
  )
  VALUES (
    p_work_item_id,
    trim(p_name),
    p_owner_member_id,
    p_deadline,
    p_estimated_hours,
    v_sort_order,
    p_start_date
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
  p_owner_member_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL
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
      estimated_hours = p_estimated_hours,
      start_date = p_start_date
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


REVOKE ALL ON FUNCTION public.create_work_item_phase(uuid, text, date, numeric, uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_work_item_phase(uuid, text, date, numeric, uuid, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_work_item_phase(uuid, text, date, numeric, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_work_item_phase(uuid, text, date, numeric, uuid, date) TO authenticated;
