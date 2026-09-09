// app/(app)/evaluate/actions.ts
"use server";

import { revalidateWorkSurfaces } from "@/lib/revalidate";
import { supabaseServer } from "@/lib/supabaseServer";
import { getTeamIdForUser } from "@/lib/db/getTeamIdForUser";
import { isValidYmd } from "@/lib/dates";

export type CommitWorkInput = {
  name: string;
  startYmd?: string;
  deadlineYmd?: string;
};

export async function commitWork(input: CommitWorkInput) {
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("Work name is required.");

  const startYmd = (input.startYmd ?? "").trim();
  if (startYmd && !isValidYmd(startYmd)) {
    throw new Error("startYmd must be a valid date in YYYY-MM-DD format.");
  }

  const deadlineYmd = (input.deadlineYmd ?? "").trim() || undefined;
  if (deadlineYmd && !isValidYmd(deadlineYmd)) {
    throw new Error("Deadline must be a valid date in YYYY-MM-DD format.");
  }

  if (startYmd && deadlineYmd && deadlineYmd < startYmd) {
    throw new Error("Deadline cannot be before start date.");
  }

  const teamId = await getTeamIdForUser();
  const supabase = await supabaseServer();

  const payload = {
    team_id: teamId,
    name,
    estimated_hours: 0,
    start_date: startYmd || null,
    deadline: deadlineYmd ?? null,
    allocation_mode: "even" as const,
  };

  const { data, error } = await supabase
    .from("work_items")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidateWorkSurfaces();
  return { id: data.id };
}
