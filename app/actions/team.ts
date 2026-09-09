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

  // Validate everything before touching the database, so a bad row in the
  // middle of the set can't leave the earlier ones already written.
  const sanitized = new Map<string, DailyHours>();
  for (const u of updates) {
    const hours = sanitizeDailyHours(u.daily_hours);
    const hoursError = validateDailyHours(hours);
    if (hoursError) {
      return { ok: false, message: hoursError };
    }
    sanitized.set(u.id, hours);
  }

  const supabase = supabaseAdmin();

  // One read for the whole set: this used to be a select *and* an update per
  // member, so saving eight members cost sixteen sequential round trips.
  const { data: existingRows, error: fetchError } = await supabase
    .from("team_members")
    .select("id, daily_hours")
    .eq("team_id", teamId)
    .in("id", updates.map((u) => u.id));
  if (fetchError) return { ok: false, message: fetchError.message };

  const storedById = new Map(
    (existingRows ?? []).map((row) => [row.id, parseDailyHours(row.daily_hours)])
  );

  const writes: { id: string; payload: Record<string, unknown> }[] = [];
  for (const u of updates) {
    const stored = storedById.get(u.id);
    if (!stored) {
      return { ok: false, message: "Team member not found." };
    }

    const sanitizedHours = sanitized.get(u.id)!;
    const hoursChanged = !dailyHoursEqual(sanitizedHours, stored);

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

    writes.push({ id: u.id, payload });
  }

  // Each row needs its own payload, so these stay separate statements -- but
  // they are independent, so they go out together rather than one at a time.
  const results = await Promise.all(
    writes.map(({ id, payload }) =>
      supabase
        .from("team_members")
        .update(payload)
        .eq("id", id)
        .eq("team_id", teamId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, message: failed.error.message };

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
