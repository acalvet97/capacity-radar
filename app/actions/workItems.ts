// app/actions/workItems.ts
"use server";

import type { ActionResult } from "@/lib/actionResult";
import { revalidateWorkSurfaces } from "@/lib/revalidate";
import { supabaseServer } from "@/lib/supabaseServer";
import { isValidYmd } from "@/lib/dates";

export async function deleteWorkItemAction(input: {
  teamId: string;
  workItemId: string;
}) {
  const supabase = await supabaseServer();

  const { error } = await supabase
    .from("work_items")
    .delete()
    .eq("id", input.workItemId)
    .eq("team_id", input.teamId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  revalidateWorkSurfaces();

  return { ok: true as const };
}

type UpdateWorkItemInput = {
  teamId: string;
  workItemId: string;
  name: string;
  /**
   * Omitted once the work item has phases, where the total is derived from them.
   * Passing it anyway is rejected rather than ignored.
   */
  estimatedHours?: number;
  startDate: string;
  deadline: string | null;
};

export async function updateWorkItemAction(
  input: UpdateWorkItemInput
): Promise<ActionResult<{ item: { id: string } }>> {
  const supabase = await supabaseServer();

  const name = input.name?.trim() ?? "";
  if (!name) {
    return { ok: false, message: "Name is required." };
  }

  // Hours are owned by phases. Reject an explicit total rather than silently
  // dropping it, including on a stub that does not have phases yet. The count
  // only picks which message to show, so it stays inside this branch -- every
  // normal save used to pay for it and discard the result.
  if (input.estimatedHours !== undefined) {
    const { count: phaseCount, error: phaseCountError } = await supabase
      .from("work_item_phases")
      .select("id", { count: "exact", head: true })
      .eq("work_item_id", input.workItemId);

    if (phaseCountError) {
      return {
        ok: false,
        message: `Update failed: ${phaseCountError.message}`,
      };
    }

    return {
      ok: false,
      message:
        (phaseCount ?? 0) > 0
          ? "Estimated hours are derived from this work item's phases. Edit the phase hours instead."
          : "Add a phase to set this work item's hours.",
    };
  }

  const start = input.startDate?.trim() ?? "";
  if (start && !isValidYmd(start)) {
    return { ok: false, message: "Start date must be a valid YYYY-MM-DD date." };
  }

  const deadlineRaw = (input.deadline ?? "").trim();
  const deadline = deadlineRaw.length ? deadlineRaw : null;

  if (deadline && !isValidYmd(deadline)) {
    return { ok: false, message: "Deadline must be a valid YYYY-MM-DD date." };
  }

  if (deadline && start && deadline < start) {
    return { ok: false, message: "Deadline cannot be before start date." };
  }

  const payload = {
    name,
    start_date: start || null,
    deadline,
  };

  const { error } = await supabase
    .from("work_items")
    .update(payload)
    .eq("id", input.workItemId)
    .eq("team_id", input.teamId);

  if (error) {
    return { ok: false, message: `Update failed: ${error.message}` };
  }

  revalidateWorkSurfaces();

  return { ok: true, item: { id: input.workItemId } };
}


