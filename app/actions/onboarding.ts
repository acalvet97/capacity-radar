"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function updateWorkspaceNameAction(name: string): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: "Team name cannot be empty." };

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not authenticated." };

  const { error } = await supabaseAdmin()
    .from("teams")
    .update({ name: trimmed })
    .eq("owner_user_id", user.id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/onboarding");
  return { ok: true };
}

