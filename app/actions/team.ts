"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadTeamCapacityHoursPerCycle } from "@/lib/loadTeamCapacity";
import { sanitizeHoursInput, sanitizeHoursInputAllowZero } from "@/lib/hours";

export type UpdateBufferResult = { ok: true } | { ok: false; message: string };
export type UpdateTeamMembersResult = { ok: true } | { ok: false; message: string };
export type UpdateReservedCapacityResult = { ok: true } | { ok: false; message: string };

export type TeamMemberUpdate = {
  id: string;
  name?: string | null;
  hours_per_cycle: number;
};

/**
 * Update team members: name and/or hours_per_cycle. Sanitizes hours to 0.5 increments (allow 0).
 */
export async function updateTeamMembersHoursAction(
  teamId: string,
  updates: TeamMemberUpdate[]
): Promise<UpdateTeamMembersResult> {
  if (!updates.length) {
    return { ok: false, message: "No updates provided." };
  }

  const supabase = supabaseAdmin();
  for (const u of updates) {
    const sanitized = sanitizeHoursInputAllowZero(u.hours_per_cycle);
    if (!Number.isFinite(sanitized) || sanitized < 0) {
      return { ok: false, message: "Invalid hours for a team member." };
    }
    const payload: { hours_per_cycle: number; name?: string | null } = {
      hours_per_cycle: sanitized,
    };
    if (u.name !== undefined) {
      payload.name = typeof u.name === "string" ? u.name.trim() || null : null;
    }
    const { error } = await supabase
      .from("team_members")
      .update(payload)
      .eq("id", u.id)
      .eq("team_id", teamId);
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/evaluate");
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Create a new team member.
 */
export async function createTeamMemberAction(
  teamId: string,
  name: string,
  hours_per_cycle: number
): Promise<UpdateTeamMembersResult> {
  const trimmedName = name.trim() || null;
  const sanitized = sanitizeHoursInputAllowZero(hours_per_cycle);
  if (!Number.isFinite(sanitized) || sanitized < 0) {
    return { ok: false, message: "Invalid hours for a team member." };
  }

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("team_members").insert({
    team_id: teamId,
    name: trimmedName,
    hours_per_cycle: sanitized,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/evaluate");
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Delete a team member.
 */
export async function deleteTeamMemberAction(
  teamId: string,
  memberId: string
): Promise<UpdateTeamMembersResult> {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("id", memberId)
    .eq("team_id", teamId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/evaluate");
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Update reserved capacity (stored as buffer_hours_per_week: 0 when disabled).
 * Hours sanitized to 0.5 increments; when enabled min 0.5, max weekly capacity.
 */
export async function updateReservedCapacityAction(
  teamId: string,
  enabled: boolean,
  hoursPerWeek: number
): Promise<UpdateReservedCapacityResult> {
  const weeklyCapacity = (await loadTeamCapacityHoursPerCycle(teamId)) / 4;
  const maxHours = Math.round(weeklyCapacity * 2) / 2; // round to 0.5

  if (!enabled) {
    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from("teams")
      .update({ buffer_hours_per_week: 0 })
      .eq("id", teamId);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/dashboard");
    revalidatePath("/evaluate");
    revalidatePath("/settings");
    return { ok: true };
  }

  const sanitized = sanitizeHoursInput(hoursPerWeek);
  if (sanitized <= 0) {
    return { ok: false, message: "Reserved capacity must be at least 0.5h when enabled." };
  }
  if (sanitized > maxHours) {
    return {
      ok: false,
      message: `Reserved capacity cannot exceed weekly capacity (${maxHours}h).`,
    };
  }

  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("teams")
    .update({ buffer_hours_per_week: sanitized })
    .eq("id", teamId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/evaluate");
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Update team's weekly structural buffer (legacy name; used by engine).
 * Validates: buffer >= 0 and buffer <= weekly capacity. Sanitizes to 0.5.
 */
export async function updateBufferAction(
  teamId: string,
  bufferHoursPerWeek: number
): Promise<UpdateBufferResult> {
  const sanitized = bufferHoursPerWeek <= 0 ? 0 : sanitizeHoursInput(bufferHoursPerWeek);
  if (!Number.isFinite(sanitized) || sanitized < 0) {
    return { ok: false, message: "Reserved capacity must be a non-negative number." };
  }

  const cycleCapacity = await loadTeamCapacityHoursPerCycle(teamId);
  const weeklyCapacity = cycleCapacity / 4;
  if (sanitized > weeklyCapacity) {
    return {
      ok: false,
      message: `Reserved capacity cannot exceed weekly capacity (${Math.round(weeklyCapacity)}h).`,
    };
  }

  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("teams")
    .update({ buffer_hours_per_week: sanitized })
    .eq("id", teamId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/evaluate");
  revalidatePath("/settings");
  return { ok: true };
}
