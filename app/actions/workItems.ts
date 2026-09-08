// app/actions/workItems.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { isValidYmd } from "@/lib/dates";
import { sanitizeHoursInput } from "@/lib/hours";

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

  revalidatePath("/dashboard");
  revalidatePath("/evaluate");
  revalidatePath("/committed-work");

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
): Promise<
  | { ok: true; item: { id: string } }
  | { ok: false; message: string }
> {
  const supabase = await supabaseServer();

  const name = input.name?.trim() ?? "";
  if (!name) {
    return { ok: false, message: "Name is required." };
  }

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

  const hasPhases = (phaseCount ?? 0) > 0;

  // Reject rather than silently drop: the total is owned by the phase RPCs, and
  // quietly discarding the field would hide client bugs and API misuse.
  if (hasPhases && input.estimatedHours !== undefined) {
    return {
      ok: false,
      message:
        "Estimated hours are derived from this work item's phases. Edit the phase hours instead.",
    };
  }

  if (!hasPhases && input.estimatedHours === undefined) {
    return { ok: false, message: "Estimated hours are required." };
  }

  let hours: number | undefined;
  if (!hasPhases) {
    hours = sanitizeHoursInput(input.estimatedHours as number);
    if (hours <= 0) {
      return { ok: false, message: "Estimated hours must be greater than 0." };
    }
  }

  const start = input.startDate?.trim() ?? "";
  if (!isValidYmd(start)) {
    return { ok: false, message: "Start date must be a valid YYYY-MM-DD date." };
  }

  const deadlineRaw = (input.deadline ?? "").trim();
  const deadline = deadlineRaw.length ? deadlineRaw : null;

  if (deadline && !isValidYmd(deadline)) {
    return { ok: false, message: "Deadline must be a valid YYYY-MM-DD date." };
  }

  if (deadline && deadline < start) {
    return { ok: false, message: "Deadline cannot be before start date." };
  }

  const payload = {
    name,
    start_date: start,
    deadline,
    ...(hours === undefined ? {} : { estimated_hours: hours }),
  };

  const { error } = await supabase
    .from("work_items")
    .update(payload)
    .eq("id", input.workItemId)
    .eq("team_id", input.teamId);

  if (error) {
    return { ok: false, message: `Update failed: ${error.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/evaluate");
  revalidatePath("/committed-work");

  return { ok: true, item: { id: input.workItemId } };
}


