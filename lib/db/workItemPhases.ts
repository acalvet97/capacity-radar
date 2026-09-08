/**
 * A named stage of a work item, with its own owner, deadline and hours.
 *
 * Phases are optional: a work item with none keeps its single manual estimate.
 * When phases exist, `work_items.estimated_hours` is their sum, kept in sync by
 * the phase RPCs (see the add_work_item_phases migration) rather than here, so
 * the value the capacity engine reads can never drift from the phase rows.
 */
export type WorkItemPhaseRow = {
  id: string;
  name: string;
  /** References team_members.id. Null when the phase is unassigned. */
  owner_member_id: string | null;
  deadline: string;
  estimated_hours: number;
  /** Display sequence, not necessarily chronological. */
  sort_order: number;
};

/** Columns selected for a phase, as a PostgREST nested-select fragment. */
export const WORK_ITEM_PHASE_COLUMNS =
  "id, name, owner_member_id, deadline, estimated_hours, sort_order";

/**
 * Owner is captured for accountability and display only. Capacity stays
 * team-level in this release, so nothing here feeds the capacity engine.
 */
export function phaseOwnerName(
  phase: WorkItemPhaseRow,
  members: { id: string; name: string | null }[]
): string | null {
  if (!phase.owner_member_id) return null;
  const member = members.find((m) => m.id === phase.owner_member_id);
  return member?.name?.trim() || null;
}
