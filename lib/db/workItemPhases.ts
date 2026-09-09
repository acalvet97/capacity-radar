/**
 * A named stage of a work item, with its own owner, deadline and hours.
 *
 * Phases carry owner, dates, and hours. A work item with none is a stub
 * (name-only create) until the first phase is saved. When phases exist,
 * `work_items.estimated_hours` is their sum, kept in sync by the phase RPCs.
 */
export type WorkItemPhaseRow = {
  id: string;
  name: string;
  /** References team_members.id. Null only after ON DELETE SET NULL. */
  owner_member_id: string | null;
  /** Explicit start. Null means infer from the previous phase or work item. */
  start_date: string | null;
  deadline: string;
  estimated_hours: number;
  /** Display sequence, not necessarily chronological. */
  sort_order: number;
};

/** Columns selected for a phase, as a PostgREST nested-select fragment. */
export const WORK_ITEM_PHASE_COLUMNS =
  "id, name, owner_member_id, start_date, deadline, estimated_hours, sort_order";
