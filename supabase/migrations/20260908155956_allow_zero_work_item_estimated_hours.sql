-- Stubs created by name-only add / Ask Klira commit have no phases yet.
-- Hours live on phases; the work item total is 0 until the first phase exists.

ALTER TABLE public.work_items
  DROP CONSTRAINT work_items_estimated_hours_check;

ALTER TABLE public.work_items
  ADD CONSTRAINT work_items_estimated_hours_check
  CHECK (estimated_hours >= 0);
