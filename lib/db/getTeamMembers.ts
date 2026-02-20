import { supabaseServer } from "@/lib/supabaseServer";

export type TeamMemberRow = {
  id: string;
  name: string | null;
  hours_per_cycle: number;
};

export async function getTeamMembers(teamId: string): Promise<TeamMemberRow[]> {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("team_members")
    .select("id, name, hours_per_cycle")
    .eq("team_id", teamId)
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? null,
    hours_per_cycle: Number(row.hours_per_cycle ?? 0),
  }));
}
