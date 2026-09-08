-- One-time cleanup: stacking requires phases with owners and dates.
-- No users yet, so unphased rows are deleted rather than accommodated.

DELETE FROM public.work_items wi
WHERE NOT EXISTS (
  SELECT 1
  FROM public.work_item_phases p
  WHERE p.work_item_id = wi.id
);
