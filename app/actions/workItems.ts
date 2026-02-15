"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";

type DeleteWorkItemParams = {
  teamId: string;
  workItemId: string;
};

export async function deleteWorkItemAction(params: DeleteWorkItemParams) {
  const { teamId, workItemId } = params;

  const supabase = supabaseServer();

  const { error } = await supabase
    .from("work_items")
    .delete()
    .eq("id", workItemId)
    .eq("team_id", teamId);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true as const };
}

