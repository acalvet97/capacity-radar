import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import { ymdToUtcDate, diffDaysUtc } from "@/lib/dates";

export type ImpactLevel = "low" | "medium" | "high";

/**
 * Compute weeks spanned by a work item (start to deadline, or start to viewEnd if no deadline).
 */
function itemSpanWeeks(
  item: WorkItemRow,
  viewEndYmd: string
): number {
  const start = item.start_date ?? "";
  if (!start) return 0;
  const end = item.deadline ?? viewEndYmd;
  const startD = ymdToUtcDate(start);
  const endD = ymdToUtcDate(end);
  const days = diffDaysUtc(endD, startD) + 1;
  return Math.max(1 / 7, days / 7);
}

/**
 * Weekly load = estimated_hours / span_weeks (hours per week in the item's window).
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
