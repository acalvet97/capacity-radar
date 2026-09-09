import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  type DailyHours,
  parseDailyHours,
} from "@/lib/dailyHours";

export type TeamMemberRow = {
  id: string;
  name: string | null;
  hours_per_cycle: number;
  daily_hours: DailyHours;
  is_daily_hours_confirmed: boolean;
};

/**
 * React.cache with a primitive argument, matching getTeamIdForUser and
 * getWorkItemsForTeam: the app layout, the page, and the dashboard engine all
 * read team members in one render, so this ran three times per request.
 * cache only dedupes within a render -- results stay request-fresh.
 */
export const getTeamMembers = cache(
  async (teamId: string): Promise<TeamMemberRow[]> => {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("team_members")
      .select("id, name, hours_per_cycle, daily_hours, is_daily_hours_confirmed")
      .eq("team_id", teamId)
      .order("id", { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name ?? null,
      hours_per_cycle: Number(row.hours_per_cycle ?? 0),
      daily_hours: parseDailyHours(row.daily_hours),
      is_daily_hours_confirmed: Boolean(row.is_daily_hours_confirmed),
    }));
  }
);
