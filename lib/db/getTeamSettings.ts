import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadTeamCapacityHoursPerCycle } from "@/lib/loadTeamCapacity";
import { cycleToWeekly } from "@/lib/capacityUnits";
import { getWeeklyAvailableCapacity } from "@/lib/teamCapacity";

export async function getTeamBufferAndCapacity(teamId: string) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("teams")
    .select("buffer_hours_per_week")
    .eq("id", teamId)
    .single();

  if (error) throw new Error(error.message);

  const bufferHoursPerWeek = Math.max(0, Number(data?.buffer_hours_per_week ?? 0) || 0);
  const cycleCapacity = await loadTeamCapacityHoursPerCycle(teamId);
  const weeklyCapacity = cycleToWeekly(cycleCapacity);
  const reservedEnabled = bufferHoursPerWeek > 0;
  const weeklyAvailableCapacity = getWeeklyAvailableCapacity(
    weeklyCapacity,
    bufferHoursPerWeek,
    reservedEnabled
  );

  return {
    bufferHoursPerWeek,
    weeklyCapacity,
    weeklyAvailableCapacity,
  };
}
