import { supabaseServer } from "@/lib/supabaseServer";

export type WorkItemRow = {
  id: string;
  estimated_hours: number;
  start_date: string | null;
  deadline: string | null;
  created_at: string;
};

export async function getWorkItemsForTeam(teamId: string): Promise<WorkItemRow[]> {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("work_items")
    .select("id, estimated_hours, start_date, deadline, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []) as WorkItemRow[];
}
