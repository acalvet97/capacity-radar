// app/evaluate/actions.ts
"use server";

import { supabaseServer } from "@/lib/supabaseServer";
import { MVP_TEAM_ID } from "@/lib/mvpTeam";

export type CommitWorkInput = {
  name: string;
  totalHours: number;
  startWeekIndex: number; // 0..3
  deadlineWeekIndex?: number; // 0..3 | undefined
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function addDaysUTC(date: Date, days: number) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toDateStringUTC(date: Date) {
  // YYYY-MM-DD
  return date.toISOString().slice(0, 10);
}

export async function commitWork(input: CommitWorkInput) {
  // Basic validation (MVP)
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("Work name is required.");

  const totalHours = Number(input.totalHours);
  if (!Number.isFinite(totalHours) || totalHours <= 0) {
    throw new Error("Total hours must be > 0.");
  }

  const startWeekIndex = clamp(Number(input.startWeekIndex), 0, 3);
  const deadlineWeekIndex =
    typeof input.deadlineWeekIndex === "number"
      ? clamp(Number(input.deadlineWeekIndex), 0, 3)
      : undefined;

  if (typeof deadlineWeekIndex === "number" && deadlineWeekIndex < startWeekIndex) {
    throw new Error("Deadline week cannot be before start week.");
  }

  const supabase = supabaseServer();

  // Load team cycle start date so we can convert week indices to dates
  const { data: team, error: teamErr } = await supabase
    .from("teams")
    .select("cycle_start_date")
    .eq("id", MVP_TEAM_ID)
    .single();

  if (teamErr) throw new Error(teamErr.message);
  if (!team?.cycle_start_date) throw new Error("Team cycle_start_date is missing.");

  const cycleStart = new Date(`${team.cycle_start_date}T00:00:00Z`);

  const startDate = addDaysUTC(cycleStart, startWeekIndex * 7);

  // If deadline week is set, choose a date inside that week.
  // We'll use the LAST day of that week (start + 6 days) to represent "end of week".
  const deadlineDate =
    typeof deadlineWeekIndex === "number"
      ? addDaysUTC(addDaysUTC(cycleStart, deadlineWeekIndex * 7), 6)
      : null;

  const payload = {
    team_id: MVP_TEAM_ID,
    name,
    estimated_hours: totalHours,
    start_date: toDateStringUTC(startDate),
    deadline: deadlineDate ? toDateStringUTC(deadlineDate) : null,
  };

  const { data, error } = await supabase
    .from("work_items")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return { id: data.id };
}
