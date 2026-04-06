import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import { ymdToUtcDate, diffDaysUtc, startOfIsoWeekUtc } from "@/lib/dates";

export type ImpactLevel = "low" | "medium" | "high";

/**
 * Inclusive count of ISO week buckets from start to end (same rule as dashboardEngine
 * even distribution: floor(diffDays(end, horizonMonday)) / 7 - floor(diffDays(start, horizonMonday)) / 7 + 1).
 * Anchored to the ISO Monday of the item's start week so the metric is intrinsic to the item.
 */
function itemSpanWeeks(item: WorkItemRow, viewEndYmd: string): number {
  const start = item.start_date ?? "";
  if (!start) return 0;
  const endYmd = item.deadline ?? viewEndYmd;
  const startD = ymdToUtcDate(start);
  const endD = ymdToUtcDate(endYmd);
  if (endD < startD) return 0;
  const startWeekMonday = startOfIsoWeekUtc(startD);
  const startIdx = Math.floor(diffDaysUtc(startD, startWeekMonday) / 7);
  const endIdx = Math.floor(diffDaysUtc(endD, startWeekMonday) / 7);
  return Math.max(1, endIdx - startIdx + 1);
}

/**
 * Weekly load = estimated_hours / max(1 week, item_span_weeks).
 * E.g. 2.5h over 2 days ⇒ 2.5h/week; 40h over 4 weeks ⇒ 10h/week.
 */
export function weeklyLoadInWindow(
  item: WorkItemRow,
  _viewStartYmd: string,
  viewEndYmd: string
): number {
  const weeks = itemSpanWeeks(item, viewEndYmd);
  return weeks > 0 ? item.estimated_hours / weeks : 0;
}

/**
 * % of weekly team capacity this item consumes (weekly load / weekly capacity * 100).
 */
export function pctWeeklyCapacity(
  weeklyLoad: number,
  weeklyCapacityHours: number
): number {
  if (weeklyCapacityHours <= 0) return 0;
  return (weeklyLoad / weeklyCapacityHours) * 100;
}

/**
 * Impact: Low < 20%, Medium 20–50%, High > 50%.
 */
export function impactFromPct(pct: number): ImpactLevel {
  if (pct < 20) return "low";
  if (pct <= 50) return "medium";
  return "high";
}

export const IMPACT_LABELS: Record<ImpactLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const IMPACT_BADGE_STYLES: Record<ImpactLevel, string> = {
  low: "bg-emerald-600/10 text-emerald-700 border-emerald-600/20",
  medium: "bg-amber-600/10 text-amber-700 border-amber-600/20",
  high: "bg-rose-600/10 text-rose-700 border-rose-600/20",
};
