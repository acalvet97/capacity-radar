// lib/evaluateEngine.ts
import type { DashboardSnapshot, WeekSnapshot, Bucket } from "@/lib/dashboardEngine";

export type AllocationMode = "even" | "fill_capacity";

export type NewWorkInput = {
  name: string;
  totalHours: number;
  startYmd: string;      // "YYYY-MM-DD"
  deadlineYmd?: string;  // "YYYY-MM-DD" (optional)
  allocationMode?: AllocationMode; // Defaults to "fill_capacity"
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
    weekRangeLabel: string; // e.g. "2026-02-16 → 2026-03-08"
    startIdx: number;
    endIdx: number;
    allocationMode: AllocationMode;
  };
};

const bucketFromUtilization = (pct: number): Bucket => {
  if (pct < 80) return "low";
  if (pct <= 90) return "medium";
  return "high";
};

const round1 = (n: number) => Math.round(n * 10) / 10;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Map a YYYY-MM-DD date into a week bucket index.
 * Uses string compare because YYYY-MM-DD sorts lexicographically.
 * If outside horizon, clamps to first/last bucket.
 */
function weekIndexForYmd(horizonWeeks: WeekSnapshot[], ymd: string): number {
  if (!horizonWeeks.length) return 0;

  const idx = horizonWeeks.findIndex(
    (w) => w.weekStartYmd <= ymd && ymd <= w.weekEndYmd
  );
  if (idx !== -1) return idx;

  if (ymd < horizonWeeks[0].weekStartYmd) return 0;
  return horizonWeeks.length - 1;
}

/**
 * Apply new work using the selected allocation mode.
 * - "even": Distribute hours uniformly across weeks
 * - "fill_capacity": Fill available capacity up to 100% per week, then distribute remainder evenly
 */
export function applyWorkToHorizon(
  horizonWeeks: WeekSnapshot[],
  input: NewWorkInput
): WeekSnapshot[] {
  if (!horizonWeeks.length) return horizonWeeks;

  const mode = input.allocationMode ?? "fill_capacity";

  const startIdx = clamp(
    weekIndexForYmd(horizonWeeks, input.startYmd),
    0,
    horizonWeeks.length - 1
  );

  const endIdxRaw =
    typeof input.deadlineYmd === "string" && input.deadlineYmd.length
      ? weekIndexForYmd(horizonWeeks, input.deadlineYmd)
      : horizonWeeks.length - 1;

  const endIdx = clamp(endIdxRaw, startIdx, horizonWeeks.length - 1);

  if (mode === "even") {
    // Even distribution (baseline)
    const weeksCount = endIdx - startIdx + 1;
    const perWeek = input.totalHours / weeksCount;

    return horizonWeeks.map((w, idx) => {
      if (idx < startIdx || idx > endIdx) return w;
      return {
        ...w,
        committedHours: round1(w.committedHours + perWeek),
      };
    });
  } else {
    // Fill available capacity (cap at 100%)
    const result = [...horizonWeeks];
    let remainingHours = input.totalHours;

    // First pass: fill each week up to capacity
    for (let i = startIdx; i <= endIdx && remainingHours > 0; i++) {
      const week = result[i];
      const availableCapacity = Math.max(0, week.capacityHours - week.committedHours);
      const hoursToAdd = Math.min(remainingHours, availableCapacity);
      
      if (hoursToAdd > 0) {
        result[i] = {
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
        result[i] = {
          ...result[i],
          committedHours: round1(result[i].committedHours + perWeek),
        };
      }
    }

    return result;
  }
}

/**
 * Recompute snapshot KPIs from a modified horizon.
 * Note: totalCapacityHours here is the sum of bucket capacities in the *current view*
 * (which matches the updated dashboardEngine behavior for variable horizons).
 */
export function recomputeSnapshot(
  base: DashboardSnapshot,
  newHorizon: WeekSnapshot[]
): DashboardSnapshot {
  const totalCommittedHours = Math.round(newHorizon.reduce((a, w) => a + w.committedHours, 0));
  const totalCapacityHours = Math.round(newHorizon.reduce((a, w) => a + w.capacityHours, 0));

  const maxUtilizationPct = Math.round(
    Math.max(
      ...newHorizon.map((w) =>
        w.capacityHours > 0 ? (w.committedHours / w.capacityHours) * 100 : 0
      )
    )
  );

  const overallUtilizationPct =
    totalCapacityHours > 0 ? Math.round((totalCommittedHours / totalCapacityHours) * 100) : 0;

  // Keep weeksEquivalent definition consistent:
  // committed hours divided by one-week capacity (assumes stable weekly capacity).
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

/**
 * Evaluate new work impact on an already-built horizon (the "view").
 * If the input dates are outside the current horizon, this will clamp.
 * (In UX, you can choose to expand the view before calling this.)
 */
export function evaluateNewWork(before: DashboardSnapshot, input: NewWorkInput): EvaluateResult {
  const afterHorizon = applyWorkToHorizon(before.horizonWeeks, input);
  const after = recomputeSnapshot(before, afterHorizon);

  const startIdx = clamp(
    weekIndexForYmd(before.horizonWeeks, input.startYmd),
    0,
    before.horizonWeeks.length - 1
  );

  const endIdxRaw =
    typeof input.deadlineYmd === "string" && input.deadlineYmd.length
      ? weekIndexForYmd(before.horizonWeeks, input.deadlineYmd)
      : before.horizonWeeks.length - 1;

  const endIdx = clamp(endIdxRaw, startIdx, before.horizonWeeks.length - 1);

  const weeksCount = endIdx - startIdx + 1;
  const perWeekHours = round1(input.totalHours / weeksCount);

  const startBucket = before.horizonWeeks[startIdx];
  const endBucket = before.horizonWeeks[endIdx];
  const weekRangeLabel = `${startBucket.weekStartYmd} → ${endBucket.weekEndYmd}`;

  const mode = input.allocationMode ?? "fill_capacity";

  return {
    before,
    after,
    deltas: {
      totalCommittedHours: after.totalCommittedHours - before.totalCommittedHours,
      maxUtilizationPct: after.maxUtilizationPct - before.maxUtilizationPct,
      overallUtilizationPct: after.overallUtilizationPct - before.overallUtilizationPct,
    },
    applied: { weeksCount, perWeekHours, weekRangeLabel, startIdx, endIdx, allocationMode: mode },
  };
}
