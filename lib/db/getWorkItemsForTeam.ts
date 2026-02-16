import { supabaseServer } from "@/lib/supabaseServer";
import { unstable_noStore as noStore } from "next/cache";

export type WorkItemRow = {
  id: string;
  name?: string;
  estimated_hours: number;
  start_date: string | null;
  deadline: string | null;
  created_at: string;
  allocation_mode?: "even" | "fill_capacity" | null;
};

export async function getWorkItemsForTeam(teamId: string): Promise<WorkItemRow[]> {
  noStore();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("work_items")
    .select("id, name, estimated_hours, start_date, deadline, created_at, allocation_mode")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []) as WorkItemRow[];
}
