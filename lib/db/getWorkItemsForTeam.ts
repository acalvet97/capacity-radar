import { cache } from "react";
import { supabaseServer } from "@/lib/supabaseServer";
import { unstable_noStore as noStore } from "next/cache";
import {
  WORK_ITEM_PHASE_COLUMNS,
  type WorkItemPhaseRow,
} from "@/lib/db/workItemPhases";

export type WorkItemRow = {
  id: string;
  name?: string;
  estimated_hours: number;
  start_date: string | null;
  deadline: string | null;
  created_at: string;
  allocation_mode?: "even" | "fill_capacity" | null;
  /**
   * Ordered by sort_order. Empty while the work item is a stub awaiting its
   * first phase; when non-empty, estimated_hours is the sum of these.
   */
  phases: WorkItemPhaseRow[];
};

type WorkItemQueryRow = Omit<WorkItemRow, "estimated_hours" | "phases"> & {
  estimated_hours: number | string | null;
  work_item_phases:
    | (Omit<WorkItemPhaseRow, "estimated_hours"> & {
        estimated_hours: number | string | null;
      })[]
    | null;
};

/**
 * React.cache with a primitive argument, matching getTeamIdForUser and
 * getDefaultDashboardSnapshot: Dashboard and its layout both read work items in
 * one render, and this now carries a nested phases join. noStore stays inside
 * so results are still request-fresh -- cache only dedupes within a render.
 */
export const getWorkItemsForTeam = cache(
  async (teamId: string): Promise<WorkItemRow[]> => {
    noStore();
    const supabase = await supabaseServer();

    const { data, error } = await supabase
      .from("work_items")
      .select(
        `id, name, estimated_hours, start_date, deadline, created_at, allocation_mode, work_item_phases (${WORK_ITEM_PHASE_COLUMNS})`
      )
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .order("sort_order", {
        referencedTable: "work_item_phases",
        ascending: true,
      });

    if (error) throw new Error(error.message);

    // numeric columns can arrive as strings, and every caller does arithmetic
    // on hours.
    return ((data ?? []) as unknown as WorkItemQueryRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      estimated_hours: Number(row.estimated_hours ?? 0),
      start_date: row.start_date,
      deadline: row.deadline,
      created_at: row.created_at,
      allocation_mode: row.allocation_mode,
      phases: (row.work_item_phases ?? []).map((phase) => ({
        id: phase.id,
        name: phase.name,
        owner_member_id: phase.owner_member_id,
        start_date: phase.start_date ?? null,
        deadline: phase.deadline,
        estimated_hours: Number(phase.estimated_hours ?? 0),
        sort_order: phase.sort_order,
      })),
    }));
  }
);
