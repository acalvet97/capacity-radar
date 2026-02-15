// lib/evaluateEngine.ts
import type { DashboardSnapshot, WeekSnapshot, Bucket } from "@/lib/dashboardEngine";

export type NewWorkInput = {
  name: string;
  totalHours: number;
  startWeekIndex: number; // 0..3
  deadlineWeekIndex?: number; // 0..3
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
  };
};

const bucketFromUtilization = (pct: number): Bucket => {
  if (pct < 80) return "low";
  if (pct <= 90) return "medium";
  return "high";
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function applyWorkToHorizon(
  horizonWeeks: WeekSnapshot[],
  input: NewWorkInput
): WeekSnapshot[] {
  const start = clamp(input.startWeekIndex, 0, horizonWeeks.length - 1);
  const endRaw =
    typeof input.deadlineWeekIndex === "number"
      ? input.deadlineWeekIndex
      : horizonWeeks.length - 1;
  const end = clamp(endRaw, start, horizonWeeks.length - 1);

  const weeksCount = end - start + 1;
  const perWeek = input.totalHours / weeksCount;

  return horizonWeeks.map((w, idx) => {
    if (idx < start || idx > end) return w;
    return {
      ...w,
      committedHours: round1(w.committedHours + perWeek),
    };
  });
}

export function recomputeSnapshot(base: DashboardSnapshot, newHorizon: WeekSnapshot[]): DashboardSnapshot {
  const totalCommittedHours = Math.round(newHorizon.reduce((a, w) => a + w.committedHours, 0));
  const totalCapacityHours = Math.round(newHorizon.reduce((a, w) => a + w.capacityHours, 0));

  const maxUtilizationPct = Math.round(
    Math.max(...newHorizon.map((w) => (w.committedHours / w.capacityHours) * 100))
  );

  const overallUtilizationPct = Math.round((totalCommittedHours / totalCapacityHours) * 100);

  // Keep weeksEquivalent definition consistent with your earlier approach:
  // committed hours divided by "one week capacity" (assumes stable weekly capacity)
  const weeklyCapacity = newHorizon[0]?.capacityHours || 1;
  const weeksEquivalent = round1(totalCommittedHours / weeklyCapacity);

  return {
    ...base,
    horizonWeeks: newHorizon,
    totalCommittedHours,
    totalCapacityHours,
    overallUtilizationPct,
    maxUtilizationPct,
    exposureBucket: bucketFromUtilization(maxUtilizationPct),
    weeksEquivalent,
  };
}

export function evaluateNewWork(before: DashboardSnapshot, input: NewWorkInput): EvaluateResult {
  const afterHorizon = applyWorkToHorizon(before.horizonWeeks, input);
  const after = recomputeSnapshot(before, afterHorizon);

  const start = clamp(input.startWeekIndex, 0, before.horizonWeeks.length - 1);
  const endRaw =
    typeof input.deadlineWeekIndex === "number"
      ? input.deadlineWeekIndex
      : before.horizonWeeks.length - 1;
  const end = clamp(endRaw, start, before.horizonWeeks.length - 1);

  const weeksCount = end - start + 1;
  const perWeekHours = round1(input.totalHours / weeksCount);
  const weekRangeLabel = `W${start + 1}–W${end + 1}`;

  return {
    before,
    after,
    deltas: {
      totalCommittedHours: after.totalCommittedHours - before.totalCommittedHours,
      maxUtilizationPct: after.maxUtilizationPct - before.maxUtilizationPct,
      overallUtilizationPct: after.overallUtilizationPct - before.overallUtilizationPct,
    },
    applied: { weeksCount, perWeekHours, weekRangeLabel },
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
