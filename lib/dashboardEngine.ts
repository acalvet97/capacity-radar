// lib/dashboardEngine.ts
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamIdForUser } from "@/lib/db/getTeamIdForUser";
import { getTeamMembers, type TeamMemberRow } from "@/lib/db/getTeamMembers";
import { getWorkItemsForTeam, type WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import {
  DEFAULT_TZ,
  todayYmdInTz,
  ymdToUtcDate,
  utcDateToYmd,
  addDaysUtc,
  startOfIsoWeekUtc,
} from "@/lib/dates";
import { clamp, round1 } from "@/lib/utils";
import {
  getTotalWeeklyCapacityFromMembers,
  getWeeklyAvailableCapacity,
  getTotalCapacityForHorizonWeeks,
} from "@/lib/teamCapacity";
import { type Bucket, exposureBucketFromUtilization } from "@/lib/dashboardConstants";
import {
  getStackedDailyHours,
  stackedHoursInWeek,
  type StackedHours,
} from "@/lib/capacityStacking";

export type { Bucket };
export { exposureBucketFromUtilization };

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

  const horizonStart = startOfIsoWeekUtc(ymdToUtcDate(startYmd));

  return Array.from({ length: weeks }).map((_, i) => {
    const ws = addDaysUtc(horizonStart, i * 7);
    const we = addDaysUtc(ws, 6);

    return {
      weekLabel: buildWeekLabel(ws, we, locale),
      weekStartYmd: utcDateToYmd(ws),
      weekEndYmd: utcDateToYmd(we),
      capacityHours: round1(weeklyCapacity),
      committedHours: 0,
    };
  });
}

function kpisFromHorizon(
  horizonWeeks: WeekSnapshot[],
  weeklyAvailable: number,
  bufferHoursPerWeek: number
): DashboardSnapshot {
  const totalCommittedHours = Math.round(
    horizonWeeks.reduce((sum, w) => sum + w.committedHours, 0)
  );

  const maxUtilizationPct = Math.round(
    Math.max(
      0,
      ...horizonWeeks.map((w) =>
        w.capacityHours > 0 ? (w.committedHours / w.capacityHours) * 100 : 0
      )
    )
  );

  const totalCapacityHours = Math.round(
    getTotalCapacityForHorizonWeeks(weeklyAvailable, horizonWeeks.length)
  );
  const viewCapacityHours = horizonWeeks.reduce(
    (sum, w) => sum + w.capacityHours,
    0
  );

  const overallUtilizationPct =
    viewCapacityHours > 0
      ? Math.round((totalCommittedHours / viewCapacityHours) * 100)
      : 0;

  const weeksEquivalent =
    weeklyAvailable > 0 ? round1(totalCommittedHours / weeklyAvailable) : 0;

  const cycleCapacityHours = Math.round(
    getTotalCapacityForHorizonWeeks(weeklyAvailable, 4)
  );

  return {
    horizonWeeks,
    totalCommittedHours,
    totalCapacityHours,
    cycleCapacityHours,
    overallUtilizationPct,
    maxUtilizationPct,
    exposureBucket: exposureBucketFromUtilization(maxUtilizationPct),
    weeksEquivalent,
    bufferHoursPerWeek,
  };
}

/**
 * Pure snapshot builder: stacked daily hours rolled up to ISO weeks.
 * Reserved capacity still subtracts from the weekly ceiling, not from committed.
 */
export function buildDashboardSnapshot(input: {
  members: TeamMemberRow[];
  workItems: WorkItemRow[];
  bufferHoursPerWeek: number;
  startYmd: string;
  weeks: number;
  locale?: string;
}): DashboardSnapshot {
  const locale = input.locale ?? "en-GB";
  const bufferHoursPerWeek = Math.max(0, Number(input.bufferHoursPerWeek) || 0);
  const totalWeekly = getTotalWeeklyCapacityFromMembers(input.members);
  const weeklyAvailable = getWeeklyAvailableCapacity(
    totalWeekly,
    bufferHoursPerWeek,
    bufferHoursPerWeek > 0
  );

  const horizonWeeks = buildHorizon({
    startYmd: input.startYmd,
    weeks: input.weeks,
    weeklyCapacity: weeklyAvailable,
    locale,
  });

  if (!horizonWeeks.length) {
    return kpisFromHorizon([], weeklyAvailable, bufferHoursPerWeek);
  }

  const range = {
    start: horizonWeeks[0].weekStartYmd,
    end: horizonWeeks[horizonWeeks.length - 1].weekEndYmd,
  };

  const stackedByMember: StackedHours[] = input.members.map((member) =>
    getStackedDailyHours({
      memberId: member.id,
      range,
      workItems: input.workItems,
      members: input.members,
    })
  );

  for (const week of horizonWeeks) {
    week.committedHours = stackedHoursInWeek(
      stackedByMember,
      week.weekStartYmd,
      week.weekEndYmd
    );
  }

  return kpisFromHorizon(horizonWeeks, weeklyAvailable, bufferHoursPerWeek);
}

/**
 * DB-backed snapshot (deterministic):
 * - Rolling ISO-week horizon; capacity is weekly (canonical) × horizon weeks.
 * - Reserved capacity reduces weekly available capacity (structural load), not committed.
 * - Committed hours come from stacked phase allocations, not even-spread estimates.
 */
export async function getDashboardSnapshotFromDb(
  teamId: string,
  options: HorizonOptions = {}
): Promise<DashboardSnapshot> {
  const allowedTeamId = await getTeamIdForUser();
  if (teamId !== allowedTeamId) {
    throw new Error("Team access denied");
  }

  const supabase = supabaseAdmin();

  const tz = options.tz ?? DEFAULT_TZ;
  const locale = options.locale ?? "en-GB";

  const maxWeeks = options.maxWeeks ?? 52;
  const requestedWeeks = Number(options.weeks ?? 4);
  const weeks = clamp(
    Number.isFinite(requestedWeeks) ? requestedWeeks : 4,
    1,
    maxWeeks
  );

  const startYmd = (options.startYmd ?? todayYmdInTz(tz)).trim();

  const [teamResult, members, workItems] = await Promise.all([
    supabase
      .from("teams")
      .select("id, buffer_hours_per_week")
      .eq("id", teamId)
      .single(),
    getTeamMembers(teamId),
    getWorkItemsForTeam(teamId),
  ]);

  if (teamResult.error) throw new Error(teamResult.error.message);

  const bufferHoursPerWeek = Math.max(
    0,
    Number(teamResult.data?.buffer_hours_per_week ?? 0) || 0
  );

  return buildDashboardSnapshot({
    members,
    workItems,
    bufferHoursPerWeek,
    startYmd,
    weeks,
    locale,
  });
}

/**
 * Cached wrapper around the standard 26-week snapshot used by layout, dashboard, and evaluate.
 * React.cache deduplicates calls with the same (teamId, todayYmd) within a single server render,
 * so layout + page share one DB execution instead of running the 3 queries twice.
 */
export const getDefaultDashboardSnapshot = cache(
  (teamId: string, todayYmd: string): Promise<DashboardSnapshot> =>
    getDashboardSnapshotFromDb(teamId, {
      startYmd: todayYmd,
      weeks: 26,
      maxWeeks: 26,
      locale: "en-GB",
      tz: DEFAULT_TZ,
    })
);
