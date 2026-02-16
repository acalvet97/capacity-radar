"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadTeamCapacityHoursPerCycle } from "@/lib/loadTeamCapacity";

export type UpdateBufferResult = { ok: true } | { ok: false; message: string };

/**
 * Update team's weekly structural buffer.
 * Validates: buffer >= 0 and buffer <= weekly capacity.
 */
export async function updateBufferAction(
  teamId: string,
  bufferHoursPerWeek: number
): Promise<UpdateBufferResult> {
  const buf = Math.round(bufferHoursPerWeek);
  if (!Number.isFinite(buf) || buf < 0) {
    return { ok: false, message: "Buffer must be a non-negative number." };
  }

  const cycleCapacity = await loadTeamCapacityHoursPerCycle(teamId);
  const weeklyCapacity = cycleCapacity / 4;
  if (buf > weeklyCapacity) {
    return {
      ok: false,
      message: `Buffer cannot exceed weekly capacity (${Math.round(weeklyCapacity)}h).`,
    };
  }

  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("teams")
    .update({ buffer_hours_per_week: buf })
    .eq("id", teamId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/evaluate");
  revalidatePath("/settings");
  return { ok: true };
}
