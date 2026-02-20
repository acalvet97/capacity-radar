import { supabaseServer } from "@/lib/supabaseServer";

export async function getTeamName(teamId: string): Promise<string> {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("teams")
    .select("name")
    .eq("id", teamId)
    .single();

  if (error || !data?.name) return "Team";
  return String(data.name).trim() || "Team";
}
