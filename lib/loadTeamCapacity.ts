// lib/loadTeamCapacity.ts
import { supabaseServer } from "@/lib/supabaseServer";

export async function loadTeamCapacityHoursPerCycle(teamId: string) {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("team_members")
    .select("hours_per_cycle")
    .eq("team_id", teamId);

  if (error) throw new Error(error.message);

  const total = (data ?? []).reduce((sum, m) => sum + Number(m.hours_per_cycle ?? 0), 0);
  return total; // e.g. 450
}
