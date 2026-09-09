"use server";

import type { ActionResult } from "@/lib/actionResult";
import { revalidateCapacitySurfaces } from "@/lib/revalidate";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadTeamCapacityHoursPerCycle } from "@/lib/loadTeamCapacity";
import { cycleToWeekly } from "@/lib/capacityUnits";
import { sanitizeHoursInput } from "@/lib/hours";
import {
  type DailyHours,
  dailyHoursEqual,
  parseDailyHours,
  sanitizeDailyHours,
  validateDailyHours,
} from "@/lib/dailyHours";

export type TeamMemberUpdate = {
  id: string;
  name?: string | null;
  daily_hours: DailyHours;
  /** When true, confirm the schedule even if daily_hours matches the stored row. */
  confirmDailyHours?: boolean;
};

/**
 * Update team members: name and/or daily_hours.
 * is_daily_hours_confirmed flips to true when daily_hours differs from the
 * stored row, or when confirmDailyHours is set (explicit "this is accurate").
 * Name-only edits leave the flag alone.
 */
export async function updateTeamMembersHoursAction(
  teamId: string,
  updates: TeamMemberUpdate[]
): Promise<ActionResult> {
  if (!updates.length) {
    return { ok: false, message: "No updates provided." };
  }

  const supabase = supabaseAdmin();
  for (const u of updates) {
    const sanitizedHours = sanitizeDailyHours(u.daily_hours);
    const hoursError = validateDailyHours(sanitizedHours);
    if (hoursError) {
      return { ok: false, message: hoursError };
    }

    const { data: existing, error: fetchError } = await supabase
      .from("team_members")
      .select("daily_hours")
      .eq("id", u.id)
      .eq("team_id", teamId)
      .maybeSingle();
    if (fetchError) return { ok: false, message: fetchError.message };
    if (!existing) {
      return { ok: false, message: "Team member not found." };
    }

    const storedHours = parseDailyHours(existing.daily_hours);
    const hoursChanged = !dailyHoursEqual(sanitizedHours, storedHours);

    const payload: {
      name?: string | null;
      daily_hours?: DailyHours;
      is_daily_hours_confirmed?: boolean;
    } = {};
    if (u.name !== undefined) {
      payload.name = typeof u.name === "string" ? u.name.trim() || null : null;
    }
    if (hoursChanged) {
      payload.daily_hours = sanitizedHours;
    }
    if (hoursChanged || u.confirmDailyHours) {
      payload.is_daily_hours_confirmed = true;
    }
    if (Object.keys(payload).length === 0) continue;

    const { error } = await supabase
      .from("team_members")
      .update(payload)
      .eq("id", u.id)
      .eq("team_id", teamId);
    if (error) return { ok: false, message: error.message };
  }

  revalidateCapacitySurfaces();
  return { ok: true };
}

/**
 * Create a new team member with an explicit daily schedule (confirmed).
 */
export async function createTeamMemberAction(
  teamId: string,
  name: string,
  daily_hours: DailyHours
): Promise<ActionResult> {
  const trimmedName = name.trim() || null;
  const sanitizedHours = sanitizeDailyHours(daily_hours);
  const hoursError = validateDailyHours(sanitizedHours);
  if (hoursError) {
    return { ok: false, message: hoursError };
  }

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("team_members").insert({
    team_id: teamId,
    name: trimmedName,
    daily_hours: sanitizedHours,
    is_daily_hours_confirmed: true,
  });
  if (error) return { ok: false, message: error.message };

  revalidateCapacitySurfaces();
  return { ok: true };
}

/**
 * Delete a team member.
 */
export async function deleteTeamMemberAction(
  teamId: string,
  memberId: string
): Promise<ActionResult> {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("id", memberId)
    .eq("team_id", teamId);
  if (error) return { ok: false, message: error.message };

  revalidateCapacitySurfaces();
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
): Promise<ActionResult> {
  const weeklyCapacity = cycleToWeekly(await loadTeamCapacityHoursPerCycle(teamId));
  const maxHours = Math.round(weeklyCapacity * 2) / 2; // round to 0.5

  if (!enabled) {
    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from("teams")
      .update({ buffer_hours_per_week: 0 })
      .eq("id", teamId);
    if (error) return { ok: false, message: error.message };
    revalidateCapacitySurfaces();
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
    .update({ buffer_hours_per_week: Math.round(sanitized) })
    .eq("id", teamId);

  if (error) return { ok: false, message: error.message };
  revalidateCapacitySurfaces();
  return { ok: true };
}
