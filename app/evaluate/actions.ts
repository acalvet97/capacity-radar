// app/evaluate/actions.ts
"use server";

import { supabaseServer } from "@/lib/supabaseServer";
import { MVP_TEAM_ID } from "@/lib/mvpTeam";

export type CommitWorkInput = {
  name: string;
  totalHours: number;
  startYmd: string;      // "YYYY-MM-DD"
  deadlineYmd?: string;  // "YYYY-MM-DD" | undefined
  allocationMode?: "even" | "fill_capacity"; // Defaults to "fill_capacity"
};

function isValidYmd(s: string): boolean {
  // Basic MVP check: YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;

  // Validate it's a real calendar date
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;

  // Ensure round-trip matches (catches 2026-02-31)
  return d.toISOString().slice(0, 10) === s;
}

export async function commitWork(input: CommitWorkInput) {
  // Basic validation (MVP)
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("Work name is required.");

  const totalHours = Number(input.totalHours);
  if (!Number.isFinite(totalHours) || totalHours <= 0) {
    throw new Error("Total hours must be > 0.");
  }

  const startYmd = (input.startYmd ?? "").trim();
  if (!isValidYmd(startYmd)) {
    throw new Error("startYmd must be a valid date in YYYY-MM-DD format.");
  }

  const deadlineYmd = (input.deadlineYmd ?? "").trim() || undefined;
  if (deadlineYmd && !isValidYmd(deadlineYmd)) {
    throw new Error("deadlineYmd must be a valid date in YYYY-MM-DD format.");
  }

  if (deadlineYmd && deadlineYmd < startYmd) {
    throw new Error("Deadline cannot be before start date.");
  }

  const supabase = supabaseServer();

  const payload = {
    team_id: MVP_TEAM_ID,
    name,
    estimated_hours: totalHours,
    start_date: startYmd,
    deadline: deadlineYmd ?? null,
    allocation_mode: input.allocationMode ?? "fill_capacity",
  };

  const { data, error } = await supabase
    .from("work_items")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return { id: data.id };
}
