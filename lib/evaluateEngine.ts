// lib/evaluateEngine.ts
import type { DashboardSnapshot, WeekSnapshot } from "@/lib/dashboardEngine";
import {
  exposureBucketFromUtilization,
  utilizationPct,
} from "@/lib/dashboardConstants";
import { clamp, round1 } from "@/lib/utils";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import {
  eachYmdInRange,
  getMemberRemainingInRange,
  getStackedDailyHours,
  getTeamRemainingInRange,
  remainingHoursOnDay,
  spanDaysInclusive,
  type DateRange,
  type StackedHours,
} from "@/lib/capacityStacking";
import { sanitizeHoursInputAllowZero } from "@/lib/hours";

export type AllocationMode = "even" | "fill_capacity";

export type NewWorkInput = {
  name: string;
  totalHours: number;
  startYmd: string;      // "YYYY-MM-DD"
  deadlineYmd?: string;  // "YYYY-MM-DD" (optional)
  allocationMode?: AllocationMode; // Unused by stacking; kept for commit-card compatibility
};

export type MemberRemainingInsight = {
  memberId: string;
  name: string;
  remainingHours: number;
};

export type StackingContext = {
  members: TeamMemberRow[];
  workItems: WorkItemRow[];
};

export type EvaluateResult = {
  before: DashboardSnapshot;
  after: DashboardSnapshot;
  deltas: {
    totalCommittedHours: number;
    maxUtilizationPct: number;
    overallUtilizationPct: number;
  };
  applied: {
    weeksCount: number;
    perWeekHours: number;
    weekRangeLabel: string;
    startIdx: number;
    endIdx: number;
    allocationMode: AllocationMode;
  };
  teamRemainingHours: number;
  requestedHours: number;
  memberRemainings: MemberRemainingInsight[];
};

function weekIndexForYmd(horizonWeeks: WeekSnapshot[], ymd: string): number {
  if (!horizonWeeks.length) return 0;

  const idx = horizonWeeks.findIndex(
    (w) => w.weekStartYmd <= ymd && ymd <= w.weekEndYmd
  );
  if (idx !== -1) return idx;

  if (ymd < horizonWeeks[0].weekStartYmd) return 0;
  return horizonWeeks.length - 1;
}

function spanForInput(
  input: NewWorkInput,
  horizonWeeks: WeekSnapshot[]
): DateRange {
  const start = input.startYmd;
  const fallbackEnd =
    horizonWeeks[horizonWeeks.length - 1]?.weekEndYmd ?? start;
  const end =
    typeof input.deadlineYmd === "string" && input.deadlineYmd.length
      ? input.deadlineYmd
      : fallbackEnd;
  if (end < start) return { start, end: start };
  return { start, end };
}

function stackedByMember(
  members: TeamMemberRow[],
  workItems: WorkItemRow[],
  range: DateRange
): Map<string, StackedHours> {
  const map = new Map<string, StackedHours>();
  for (const member of members) {
    map.set(
      member.id,
      getStackedDailyHours({
        memberId: member.id,
        range,
        workItems,
        members,
      })
    );
  }
  return map;
}

export function memberRemainingsForRange(
  members: TeamMemberRow[],
  workItems: WorkItemRow[],
  range: DateRange
): MemberRemainingInsight[] {
  const stacked = stackedByMember(members, workItems, range);
  return memberInsights(members, stacked, range);
}

function memberInsights(
  members: TeamMemberRow[],
  stacked: Map<string, StackedHours>,
  range: DateRange
): MemberRemainingInsight[] {
  return members
    .map((member) => ({
      memberId: member.id,
      name: member.name?.trim() || "Unnamed member",
      remainingHours: getMemberRemainingInRange({
        range,
        stackedHours: stacked.get(member.id) ?? {},
        dailyHours: member.daily_hours,
      }),
    }))
    .sort((a, b) => b.remainingHours - a.remainingHours);
}

function teamRemainingOnDate(
  date: string,
  members: TeamMemberRow[],
  stacked: Map<string, StackedHours>
): number {
  let remaining = 0;
  for (const member of members) {
    remaining += remainingHoursOnDay(
      date,
      stacked.get(member.id) ?? {},
      member.daily_hours
    );
  }
  return remaining;
}

/**
 * Approximate overlay: front-load hypothetical hours into leftover team
 * capacity day by day. Leftover after the span is dumped on the last week
 * so the result card can still show over-capacity.
 */
function applyHypotheticalToHorizon(
  horizonWeeks: WeekSnapshot[],
  input: NewWorkInput,
  members: TeamMemberRow[],
  stacked: Map<string, StackedHours>,
  range: DateRange
): WeekSnapshot[] {
  if (!horizonWeeks.length) return horizonWeeks;

  const after = horizonWeeks.map((w) => ({ ...w }));
  let remaining = sanitizeHoursInputAllowZero(input.totalHours);

  for (const date of eachYmdInRange(range.start, range.end)) {
    if (remaining <= 0) break;
    const slack = teamRemainingOnDate(date, members, stacked);
    const hours = Math.min(remaining, slack);
    if (hours <= 0) continue;
    const idx = weekIndexForYmd(after, date);
    after[idx] = {
      ...after[idx],
      committedHours: round1(after[idx].committedHours + hours),
    };
    remaining = sanitizeHoursInputAllowZero(remaining - hours);
  }

  if (remaining > 0) {
    const lastIdx = weekIndexForYmd(after, range.end);
    after[lastIdx] = {
      ...after[lastIdx],
      committedHours: round1(after[lastIdx].committedHours + remaining),
    };
  }

  return after;
}

export function recomputeSnapshot(
  base: DashboardSnapshot,
  newHorizon: WeekSnapshot[]
): DashboardSnapshot {
  const totalCommittedHours = Math.round(
    newHorizon.reduce((a, w) => a + w.committedHours, 0)
  );
  const totalCapacityHours = Math.round(
    newHorizon.reduce((a, w) => a + w.capacityHours, 0)
  );

  const maxUtilizationPct = Math.round(
    Math.max(
      0,
      ...newHorizon.map((w) =>
        utilizationPct(w.committedHours, w.capacityHours)
      )
    )
  );

  const overallUtilizationPct =
    totalCapacityHours > 0
      ? Math.round((totalCommittedHours / totalCapacityHours) * 100)
      : 0;

  const weeklyCapacity = newHorizon[0]?.capacityHours || 1;
  const weeksEquivalent = round1(totalCommittedHours / weeklyCapacity);

  return {
    ...base,
    horizonWeeks: newHorizon,
    totalCommittedHours,
    totalCapacityHours,
    overallUtilizationPct,
    maxUtilizationPct,
    exposureBucket: exposureBucketFromUtilization(maxUtilizationPct),
    weeksEquivalent,
  };
}

/** True if requested hours fit in reserved-adjusted team remaining. */
export function fitsWithinCapacity(result: EvaluateResult): boolean {
  return result.requestedHours <= result.teamRemainingHours;
}

export function findMinimumDeadlineYmdForFit(
  snapshot: DashboardSnapshot,
  input: NewWorkInput,
  stacking: StackingContext
): string | null {
  const startIdx = clamp(
    weekIndexForYmd(snapshot.horizonWeeks, input.startYmd),
    0,
    snapshot.horizonWeeks.length - 1
  );
  const endIdxRaw =
    typeof input.deadlineYmd === "string" && input.deadlineYmd.length
      ? weekIndexForYmd(snapshot.horizonWeeks, input.deadlineYmd)
      : snapshot.horizonWeeks.length - 1;
  let endIdx = clamp(endIdxRaw, startIdx, snapshot.horizonWeeks.length - 1);

  for (; endIdx < snapshot.horizonWeeks.length; endIdx++) {
    const deadlineYmd = snapshot.horizonWeeks[endIdx].weekEndYmd;
    const res = evaluateNewWork(
      snapshot,
      { ...input, deadlineYmd },
      stacking
    );
    if (fitsWithinCapacity(res)) return deadlineYmd;
  }
  return null;
}

export function findMaximumHoursForDeadline(
  snapshot: DashboardSnapshot,
  input: NewWorkInput,
  stacking: StackingContext,
  opts?: { maxIterations?: number }
): number {
  const maxIter = opts?.maxIterations ?? 40;
  let lo = 0;
  let hi = Math.max(0, input.totalHours);
  let best = 0;

  for (let i = 0; i < maxIter && hi - lo > 0.25; i++) {
    const mid = round1((lo + hi) / 2);
    const res = evaluateNewWork(
      snapshot,
      { ...input, totalHours: mid },
      stacking
    );
    if (fitsWithinCapacity(res)) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

export type OverCapacityScenario = {
  id: "extend_deadline" | "reduce_scope";
  title: string;
  description: string;
  evaluation: EvaluateResult;
  apply: {
    deadlineYmd?: string;
    totalHours?: number;
  };
};

export function buildOverCapacityScenarios(
  snapshot: DashboardSnapshot,
  input: NewWorkInput,
  stacking: StackingContext
): OverCapacityScenario[] {
  const baseline = evaluateNewWork(snapshot, input, stacking);
  if (fitsWithinCapacity(baseline)) return [];

  const out: OverCapacityScenario[] = [];

  const extended = findMinimumDeadlineYmdForFit(snapshot, input, stacking);
  if (extended) {
    const ev = evaluateNewWork(
      snapshot,
      { ...input, deadlineYmd: extended },
      stacking
    );
    out.push({
      id: "extend_deadline",
      title: "Extend deadline",
      description: `Push deadline to ${extended} so the work fits within remaining team capacity.`,
      evaluation: ev,
      apply: { deadlineYmd: extended },
    });
  }

  const maxHours = findMaximumHoursForDeadline(snapshot, input, stacking);
  if (maxHours > 0 && maxHours < input.totalHours) {
    const ev = evaluateNewWork(
      snapshot,
      { ...input, totalHours: maxHours },
      stacking
    );
    out.push({
      id: "reduce_scope",
      title: "Reduce scope",
      description: `Cap effort at about ${maxHours}h in the current window to stay within capacity.`,
      evaluation: ev,
      apply: { totalHours: maxHours },
    });
  }

  return out.slice(0, 2);
}

export function evaluateNewWork(
  before: DashboardSnapshot,
  input: NewWorkInput,
  stacking: StackingContext
): EvaluateResult {
  const range = spanForInput(input, before.horizonWeeks);
  const stacked = stackedByMember(
    stacking.members,
    stacking.workItems,
    range
  );
  const remainings = memberInsights(stacking.members, stacked, range);
  const spanDays = spanDaysInclusive(range.start, range.end);
  const teamRemainingHours = getTeamRemainingInRange({
    memberRemainings: remainings.map((m) => m.remainingHours),
    bufferHoursPerWeek: before.bufferHoursPerWeek,
    spanDays,
  });

  const afterHorizon = applyHypotheticalToHorizon(
    before.horizonWeeks,
    input,
    stacking.members,
    stacked,
    range
  );
  const after = recomputeSnapshot(before, afterHorizon);

  const startIdx = clamp(
    weekIndexForYmd(before.horizonWeeks, input.startYmd),
    0,
    Math.max(0, before.horizonWeeks.length - 1)
  );

  const endIdxRaw =
    typeof input.deadlineYmd === "string" && input.deadlineYmd.length
      ? weekIndexForYmd(before.horizonWeeks, input.deadlineYmd)
      : before.horizonWeeks.length - 1;

  const endIdx = clamp(endIdxRaw, startIdx, Math.max(0, before.horizonWeeks.length - 1));

  const weeksCount = Math.max(1, endIdx - startIdx + 1);
  const perWeekHours = round1(input.totalHours / weeksCount);

  const startBucket = before.horizonWeeks[startIdx];
  const endBucket = before.horizonWeeks[endIdx];
  const weekRangeLabel =
    startBucket && endBucket
      ? `${startBucket.weekStartYmd} → ${endBucket.weekEndYmd}`
      : `${range.start} → ${range.end}`;

  const mode = input.allocationMode ?? "even";

  return {
    before,
    after,
    deltas: {
      totalCommittedHours:
        after.totalCommittedHours - before.totalCommittedHours,
      maxUtilizationPct: after.maxUtilizationPct - before.maxUtilizationPct,
      overallUtilizationPct:
        after.overallUtilizationPct - before.overallUtilizationPct,
    },
    applied: {
      weeksCount,
      perWeekHours,
      weekRangeLabel,
      startIdx,
      endIdx,
      allocationMode: mode,
    },
    teamRemainingHours,
    requestedHours: sanitizeHoursInputAllowZero(input.totalHours),
    memberRemainings: remainings,
  };
}
