// app/evaluate/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { isValidYmd } from "@/lib/dates";

export type CommitWorkInput = {
  name: string;
  totalHours: number;
  startYmd: string;      // "YYYY-MM-DD"
  deadlineYmd?: string;  // "YYYY-MM-DD" | undefined
  allocationMode?: "even" | "fill_capacity"; // Defaults to "fill_capacity"
};

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

  revalidatePath("/committed-work");
  revalidatePath("/dashboard");
  return { id: data.id };
}
