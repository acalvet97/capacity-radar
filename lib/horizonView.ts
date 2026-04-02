/**
 * Horizon / dashboard view window: URL search param → week count for snapshots.
 * Shared by dashboard and evaluate (DRY).
 */

import type { ViewKey } from "@/lib/dashboardConstants";
import {
  ymdToUtcDate,
  utcDateToYmd,
  endOfIsoWeekUtc,
  weeksBetweenIsoWeeksInclusive,
} from "@/lib/dates";

function lastDayOfMonthYmd(todayYmd: string): string {
  const [yy, mm] = todayYmd.split("-").map(Number);
  const last = new Date(Date.UTC(yy, mm, 0));
  return utcDateToYmd(last);
}

function lastDayOfQuarterYmd(todayYmd: string): string {
  const [yy, mm] = todayYmd.split("-").map(Number);
  const quarter = Math.floor((mm - 1) / 3);
  const quarterEndMonth = (quarter + 1) * 3;
  const last = new Date(Date.UTC(yy, quarterEndMonth, 0));
  return utcDateToYmd(last);
}

export function normalizeViewSearchParam(raw: unknown): ViewKey {
  const v =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw[0]
        : "";

  if (v === "month" || v === "4w" || v === "12w" || v === "quarter" || v === "6m") {
    return v;
  }
  return "4w";
}

/** Number of ISO weeks to show for the given view (from today’s week). */
export function weeksForHorizonView(view: ViewKey, todayYmd: string): number {
  if (view === "4w") return 4;
  if (view === "12w") return 12;
  if (view === "quarter") {
    const quarterEndYmd = lastDayOfQuarterYmd(todayYmd);
    const endSundayYmd = utcDateToYmd(endOfIsoWeekUtc(ymdToUtcDate(quarterEndYmd)));
    return weeksBetweenIsoWeeksInclusive(todayYmd, endSundayYmd);
  }
  if (view === "6m") return 26;

  const monthEndYmd = lastDayOfMonthYmd(todayYmd);
  const endSundayYmd = utcDateToYmd(endOfIsoWeekUtc(ymdToUtcDate(monthEndYmd)));
  return weeksBetweenIsoWeeksInclusive(todayYmd, endSundayYmd);
}
