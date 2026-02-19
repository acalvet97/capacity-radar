// app/actions/workItems.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { isValidYmd } from "@/lib/dates";

export async function deleteWorkItemAction(input: {
  teamId: string;
  workItemId: string;
}) {
  const supabase = supabaseServer();

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
  estimatedHours: number;
  startDate: string;
  deadline: string | null;
};

export async function updateWorkItemAction(
  input: UpdateWorkItemInput
): Promise<
  | { ok: true; item: { id: string } }
  | { ok: false; message: string }
> {
  const supabase = supabaseServer();

  const name = input.name?.trim() ?? "";
  if (!name) {
    return { ok: false, message: "Name is required." };
  }

  const hours = Number(input.estimatedHours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return { ok: false, message: "Estimated hours must be greater than 0." };
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
    estimated_hours: hours,
    start_date: start,
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

  revalidatePath("/dashboard");
  revalidatePath("/evaluate");
  revalidatePath("/committed-work");

  return { ok: true, item: { id: input.workItemId } };
}


