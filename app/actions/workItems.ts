// app/actions/workItems.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";

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

  return { ok: true as const };
}


