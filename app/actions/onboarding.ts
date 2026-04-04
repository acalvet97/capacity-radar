"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { redirect } from "next/navigation";

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

export async function markOnboardingCompleteAction(): Promise<void> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabaseAdmin()
    .from("teams")
    .update({ onboarding_completed: true })
    .eq("owner_user_id", user.id);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
