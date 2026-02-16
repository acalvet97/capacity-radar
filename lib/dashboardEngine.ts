// lib/dashboardEngine.ts
import { supabaseServer } from "@/lib/supabaseServer";

export type Bucket = "low" | "medium" | "high";

export type WeekSnapshot = {
  weekLabel: string;      // e.g. "16 Feb - 22 Feb"
  weekStartYmd: string;   // "YYYY-MM-DD" (Monday)
  weekEndYmd: string;     // "YYYY-MM-DD" (Sunday)
  capacityHours: number;
  committedHours: number;
};

export type DashboardSnapshot = {
  horizonWeeks: WeekSnapshot[];
  totalCommittedHours: number;
  totalCapacityHours: number; // Capacity for the current view window
  cycleCapacityHours: number; // Total capacity per 4-week cycle
  overallUtilizationPct: number;
  weeksEquivalent: number;
  maxUtilizationPct: number;
  exposureBucket: Bucket;
  /** Weekly structural buffer (hours). Counts as committed. */
  bufferHoursPerWeek: number;
};

export type HorizonOptions = {
  /**
   * Start day for the "view".
   * We'll snap it to the ISO week Monday.
   * Defaults to "today" in Europe/Madrid.
   */
  startYmd?: string;

  /** Number of weeks in the view. Defaults to 4. */
  weeks?: number;

  /**
   * Hard cap to avoid crazy views by accident.
   * Defaults to 52 (1 year).
   */
  maxWeeks?: number;

  /** Label locale for weekLabel. Defaults to "en-GB". */
  locale?: string;

  /** Which timezone defines "today". Defaults to Europe/Madrid. */
  tz?: string;
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

// ---- date helpers (no deps) ----

function todayYmdInTz(tz: string) {
  // en-CA -> YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

function formatYmdUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysUTC(d: Date, days: number) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function startOfIsoWeekUTC(d: Date) {
  // ISO week starts Monday
  const mondayIndex = (d.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  return addDaysUTC(d, -mondayIndex);
}

function buildWeekLabel(weekStart: Date, weekEnd: Date, locale: string) {
  const fmt = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(weekStart)} - ${fmt.format(weekEnd)}`;
}

function buildHorizon(params: {
  startYmd: string;
  weeks: number;
  weeklyCapacity: number;
  locale: string;
}): WeekSnapshot[] {
  const { startYmd, weeks, weeklyCapacity, locale } = params;

  const horizonStart = startOfIsoWeekUTC(parseDateUTC(startYmd));

  return Array.from({ length: weeks }).map((_, i) => {
    const ws = addDaysUTC(horizonStart, i * 7);
    const we = addDaysUTC(ws, 6);

    return {
      weekLabel: buildWeekLabel(ws, we, locale),
      weekStartYmd: formatYmdUTC(ws),
      weekEndYmd: formatYmdUTC(we),
      capacityHours: round1(weeklyCapacity),
      committedHours: 0,
    };
  });
}

/**
 * DB-backed snapshot (deterministic):
 * - Rolling ISO-week horizon starting from a chosen start date (defaults to today in Europe/Madrid)
 * - View length is configurable (defaults to 4 weeks; presets can be 12 weeks, quarter=13, etc.)
 * - capacity = sum(team_members.hours_per_cycle) / 4 per week (MVP)
 * - workload distribution:
 *   start_date..deadline inclusive (uniform per week buckets)
 *   if deadline is null => start_date..end of horizon
 */
export async function getDashboardSnapshotFromDb(
  teamId: string,
  options: HorizonOptions = {}
): Promise<DashboardSnapshot> {
  const supabase = supabaseServer();

  const { data: teamRow, error: teamErr } = await supabase
    .from("teams")
    .select("id, buffer_hours_per_week")
    .eq("id", teamId)
    .single();

  if (teamErr) throw new Error(teamErr.message);

  const bufferHoursPerWeek = Math.max(0, Number(teamRow?.buffer_hours_per_week ?? 0) || 0);

  const tz = options.tz ?? "Europe/Madrid";
  const locale = options.locale ?? "en-GB";

  const maxWeeks = options.maxWeeks ?? 52; // MVP safety
  const requestedWeeks = Number(options.weeks ?? 4);
  const weeks = clamp(
    Number.isFinite(requestedWeeks) ? requestedWeeks : 4,
    1,
    maxWeeks
  );

  const startYmd = (options.startYmd ?? todayYmdInTz(tz)).trim();

  // 1) Load team capacity (hours per cycle)
  const { data: members, error: memErr } = await supabase
    .from("team_members")
    .select("hours_per_cycle")
    .eq("team_id", teamId);

  if (memErr) throw new Error(memErr.message);

  const cycleCapacityHours = Math.round(
    (members ?? []).reduce((sum, m) => sum + Number(m.hours_per_cycle ?? 0), 0)
  );

  // MVP capacity model: per-week capacity derived from "per 4-week cycle"
  const weeklyCapacity = cycleCapacityHours / 4;

  // 2) Build horizon (date-native)
  const horizonWeeks = buildHorizon({
    startYmd,
    weeks,
    weeklyCapacity,
    locale,
  });

  // 2b) Add structural buffer to every week (pre-committed load)
  for (let i = 0; i < horizonWeeks.length; i++) {
    horizonWeeks[i] = {
      ...horizonWeeks[i],
      committedHours: round1(horizonWeeks[i].committedHours + bufferHoursPerWeek),
    };
  }

  // 3) Load work items
  const { data: workItems, error: wiErr } = await supabase
    .from("work_items")
    .select("estimated_hours, start_date, deadline, allocation_mode")
    .eq("team_id", teamId);

  if (wiErr) throw new Error(wiErr.message);

  // 4) Distribute work into horizon buckets (uniform per week)
  const horizonStartDate = parseDateUTC(horizonWeeks[0].weekStartYmd);
  const horizonEndDate = parseDateUTC(horizonWeeks[horizonWeeks.length - 1].weekEndYmd);

  for (const item of workItems ?? []) {
    const hours = Number(item.estimated_hours ?? 0);
    if (!Number.isFinite(hours) || hours <= 0) continue;

    // If start_date is null: fallback to startYmd (view start)
    const itemStartYmd = (item.start_date ?? startYmd).trim();
    const start = parseDateUTC(itemStartYmd);

    // deadline optional: if null => end at horizon end
    const end = item.deadline ? parseDateUTC(item.deadline) : horizonEndDate;

    // Ignore if fully outside horizon
    if (end < horizonStartDate) continue;
    if (start > horizonEndDate) continue;

    // Clamp to horizon
    const clampedStart = start < horizonStartDate ? horizonStartDate : start;
    const clampedEnd = end > horizonEndDate ? horizonEndDate : end;

    // Map to indices relative to horizonStart (ISO week Monday)
    const horizonStart = parseDateUTC(horizonWeeks[0].weekStartYmd);

    const startIdx = clamp(
      Math.floor(diffDaysUTC(clampedStart, horizonStart) / 7),
      0,
      horizonWeeks.length - 1
    );

    const endIdx = clamp(
      Math.floor(diffDaysUTC(clampedEnd, horizonStart) / 7),
      startIdx,
      horizonWeeks.length - 1
    );

    const allocationMode = (item.allocation_mode as "even" | "fill_capacity" | null) ?? "fill_capacity";

    if (allocationMode === "even") {
      // Even distribution
      const weeksCount = endIdx - startIdx + 1;
      const perWeek = hours / weeksCount;

      for (let i = startIdx; i <= endIdx; i++) {
        horizonWeeks[i].committedHours = round1(horizonWeeks[i].committedHours + perWeek);
      }
    } else {
      // Fill available capacity (cap at 100%)
      let remainingHours = hours;

      // First pass: fill each week up to capacity
      for (let i = startIdx; i <= endIdx && remainingHours > 0; i++) {
        const week = horizonWeeks[i];
        const availableCapacity = Math.max(0, week.capacityHours - week.committedHours);
        const hoursToAdd = Math.min(remainingHours, availableCapacity);
        
        if (hoursToAdd > 0) {
          horizonWeeks[i] = {
            ...week,
            committedHours: round1(week.committedHours + hoursToAdd),
          };
          remainingHours -= hoursToAdd;
        }
      }

      // Second pass: distribute any remaining hours evenly
      if (remainingHours > 0) {
        const weeksCount = endIdx - startIdx + 1;
        const perWeek = remainingHours / weeksCount;

        for (let i = startIdx; i <= endIdx; i++) {
          horizonWeeks[i].committedHours = round1(horizonWeeks[i].committedHours + perWeek);
        }
      }
    }
  }

  // 5) Compute KPIs
  const totalCommittedHours = Math.round(
    horizonWeeks.reduce((sum, w) => sum + w.committedHours, 0)
  );

  const maxUtilizationPct = Math.round(
    Math.max(
      ...horizonWeeks.map((w) =>
        w.capacityHours > 0 ? (w.committedHours / w.capacityHours) * 100 : 0
      )
    )
  );

  // NOTE: overallUtilizationPct compares total committed in the VIEW vs total capacity per 4-week cycle.
  // If the horizon isn't 4 weeks, this becomes misleading. Use viewCapacityHours instead.
  const viewCapacityHours = horizonWeeks.reduce((sum, w) => sum + w.capacityHours, 0);

  const overallUtilizationPct =
    viewCapacityHours > 0 ? Math.round((totalCommittedHours / viewCapacityHours) * 100) : 0;

  const weeksEquivalent =
    weeklyCapacity > 0 ? round1(totalCommittedHours / weeklyCapacity) : 0;

  return {
    horizonWeeks,
    totalCommittedHours,
    totalCapacityHours: Math.round(viewCapacityHours), // capacity for the current view
    cycleCapacityHours, // total capacity per 4-week cycle
    overallUtilizationPct,
    maxUtilizationPct,
    exposureBucket: bucketFromUtil(maxUtilizationPct),
    weeksEquivalent,
    bufferHoursPerWeek,
  };
}
