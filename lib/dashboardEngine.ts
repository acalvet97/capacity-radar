// lib/dashboardEngine.ts
import { supabaseServer } from "@/lib/supabaseServer";

export type Bucket = "low" | "medium" | "high";

export type WeekSnapshot = {
  weekLabel: string; // "W1".."W4"
  capacityHours: number;
  committedHours: number;
};

export type DashboardSnapshot = {
  horizonWeeks: WeekSnapshot[];
  totalCommittedHours: number;
  totalCapacityHours: number;
  overallUtilizationPct: number;
  weeksEquivalent: number;
  maxUtilizationPct: number;
  exposureBucket: Bucket;
};

const bucketFromUtil = (pct: number): Bucket => {
  if (pct < 80) return "low";
  if (pct <= 90) return "medium";
  return "high";
};

const round1 = (n: number) => Math.round(n * 10) / 10;

function parseDateUTC(dateStr: string) {
  // dateStr is "YYYY-MM-DD"
  return new Date(`${dateStr}T00:00:00Z`);
}

function diffDaysUTC(a: Date, b: Date) {
  // a - b in days
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * DB-backed snapshot (deterministic):
 * - 4-week horizon starting at team.cycle_start_date
 * - capacity = sum(team_members.hours_per_cycle) / 4 per week
 * - workload distribution:
 *   start_date..deadline inclusive (uniform)
 *   if deadline is null => start_date..W4
 */
export async function getDashboardSnapshotFromDb(teamId: string): Promise<DashboardSnapshot> {
  const supabase = supabaseServer();

  // 1) Load team cycle dates
  const { data: team, error: teamErr } = await supabase
    .from("teams")
    .select("id, cycle_start_date, cycle_end_date")
    .eq("id", teamId)
    .single();

  if (teamErr) throw new Error(teamErr.message);
  if (!team?.cycle_start_date) throw new Error("Team cycle_start_date is missing.");

  const cycleStart = parseDateUTC(team.cycle_start_date);

  // 2) Load team capacity (hours per cycle)
  const { data: members, error: memErr } = await supabase
    .from("team_members")
    .select("hours_per_cycle")
    .eq("team_id", teamId);

  if (memErr) throw new Error(memErr.message);

  const totalCapacityHours = Math.round(
    (members ?? []).reduce((sum, m) => sum + Number(m.hours_per_cycle ?? 0), 0)
  );

  const weeklyCapacity = totalCapacityHours / 4;

  // 3) Initialize 4-week horizon
  const horizonWeeks: WeekSnapshot[] = Array.from({ length: 4 }).map((_, i) => ({
    weekLabel: `W${i + 1}`,
    capacityHours: round1(weeklyCapacity),
    committedHours: 0,
  }));

  // 4) Load work items
  const { data: workItems, error: wiErr } = await supabase
    .from("work_items")
    .select("estimated_hours, start_date, deadline")
    .eq("team_id", teamId);

  if (wiErr) throw new Error(wiErr.message);

  // 5) Distribute work into weeks
  for (const item of workItems ?? []) {
    const hours = Number(item.estimated_hours ?? 0);
    if (!Number.isFinite(hours) || hours <= 0) continue;

    // If start_date is null, treat as cycle start (MVP-safe)
    const startDateStr = item.start_date ?? team.cycle_start_date;
    const start = parseDateUTC(startDateStr);

    // deadline optional: if null => end at W4
    const end = item.deadline ? parseDateUTC(item.deadline) : null;

    // Convert dates to week indices relative to cycleStart
    const startIdx = clamp(Math.floor(diffDaysUTC(start, cycleStart) / 7), 0, 3);

    const endIdxRaw =
      end === null ? 3 : Math.floor(diffDaysUTC(end, cycleStart) / 7);

    const endIdx = clamp(endIdxRaw, startIdx, 3);

    const weeksCount = endIdx - startIdx + 1;
    const perWeek = hours / weeksCount;

    for (let i = startIdx; i <= endIdx; i++) {
      horizonWeeks[i].committedHours = round1(horizonWeeks[i].committedHours + perWeek);
    }
  }

  // 6) Compute KPIs
  const totalCommittedHours = Math.round(horizonWeeks.reduce((sum, w) => sum + w.committedHours, 0));

  const maxUtilizationPct = Math.round(
    Math.max(...horizonWeeks.map((w) => (w.committedHours / w.capacityHours) * 100))
  );

  const overallUtilizationPct = totalCapacityHours > 0
    ? Math.round((totalCommittedHours / totalCapacityHours) * 100)
    : 0;

  const weeksEquivalent = weeklyCapacity > 0 ? round1(totalCommittedHours / weeklyCapacity) : 0;

  return {
    horizonWeeks,
    totalCommittedHours,
    totalCapacityHours,
    overallUtilizationPct,
    maxUtilizationPct,
    exposureBucket: bucketFromUtil(maxUtilizationPct),
    weeksEquivalent,
  };
}

/**
 * Keep the mock version for quick UI testing (optional).
 * You can delete this once DB-driven is stable everywhere.
 */
export function getDashboardSnapshot(): DashboardSnapshot {
  const horizonWeeks: WeekSnapshot[] = [
    { weekLabel: "W1", capacityHours: 120, committedHours: 92 },
    { weekLabel: "W2", capacityHours: 120, committedHours: 108 },
    { weekLabel: "W3", capacityHours: 120, committedHours: 130 },
    { weekLabel: "W4", capacityHours: 120, committedHours: 76 },
  ];

  const totalCommittedHours = horizonWeeks.reduce((a, w) => a + w.committedHours, 0);
  const totalCapacityHours = horizonWeeks.reduce((a, w) => a + w.capacityHours, 0);

  const maxUtilizationPct = Math.round(
    Math.max(...horizonWeeks.map((w) => (w.committedHours / w.capacityHours) * 100))
  );

  const overallUtilizationPct = Math.round((totalCommittedHours / totalCapacityHours) * 100);
  const weeksEquivalent = round1(totalCommittedHours / horizonWeeks[0].capacityHours);

  return {
    horizonWeeks,
    totalCommittedHours,
    totalCapacityHours,
    overallUtilizationPct,
    maxUtilizationPct,
    exposureBucket: bucketFromUtil(maxUtilizationPct),
    weeksEquivalent,
  };
}
