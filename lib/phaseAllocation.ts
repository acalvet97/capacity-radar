import { DAY_KEYS, type DailyHours } from "@/lib/dailyHours";
import {
  addDaysUtc,
  isValidYmd,
  utcDateToYmd,
  ymdToUtcDate,
} from "@/lib/dates";
import { sanitizeHoursInputAllowZero } from "@/lib/hours";

export type AllocationDay = {
  date: string;
  hours: number;
};

export type FrontLoadAllocation = {
  days: AllocationDay[];
  overflow: boolean;
  leftoverHours: number;
};

export function dayKeyFromYmd(ymd: string): (typeof DAY_KEYS)[number] {
  const mondayIndex = (ymdToUtcDate(ymd).getUTCDay() + 6) % 7;
  return DAY_KEYS[mondayIndex];
}

/**
 * Explicit start wins. Otherwise the day after the previous phase deadline
 * (by sort_order, not chronology). First phase falls back to the work item start.
 */
export function resolvePhaseStartDate(input: {
  startDate?: string | null;
  previousDeadline?: string | null;
  workItemStartDate?: string | null;
}): string | null {
  const explicit = input.startDate?.trim() ?? "";
  if (explicit && isValidYmd(explicit)) return explicit;

  const previous = input.previousDeadline?.trim() ?? "";
  if (previous && isValidYmd(previous)) {
    return utcDateToYmd(addDaysUtc(ymdToUtcDate(previous), 1));
  }

  const workItemStart = input.workItemStartDate?.trim() ?? "";
  if (workItemStart && isValidYmd(workItemStart)) return workItemStart;

  return null;
}

export function isStartAfterDeadline(startDate: string, deadline: string): boolean {
  return startDate > deadline;
}

const EMPTY_ALLOCATION: FrontLoadAllocation = {
  days: [],
  overflow: false,
  leftoverHours: 0,
};

/**
 * Front-load hours from startDate through deadline inclusive, capping each day
 * at that weekday's capacity. Zero-capacity days are skipped (omitted from the
 * result). Does not walk an inverted span — callers should treat that as invalid.
 */
export function computeFrontLoadAllocation(input: {
  startDate: string;
  deadline: string;
  totalHours: number;
  dailyHours: DailyHours;
}): FrontLoadAllocation {
  if (!isValidYmd(input.startDate) || !isValidYmd(input.deadline)) {
    return EMPTY_ALLOCATION;
  }
  if (isStartAfterDeadline(input.startDate, input.deadline)) {
    return EMPTY_ALLOCATION;
  }

  let remaining = sanitizeHoursInputAllowZero(input.totalHours);
  if (remaining <= 0) return EMPTY_ALLOCATION;

  const days: AllocationDay[] = [];
  let cursor = ymdToUtcDate(input.startDate);
  const end = ymdToUtcDate(input.deadline);

  while (remaining > 0 && cursor.getTime() <= end.getTime()) {
    const date = utcDateToYmd(cursor);
    const capacity = sanitizeHoursInputAllowZero(
      input.dailyHours[dayKeyFromYmd(date)]
    );
    const hours = Math.min(remaining, capacity);
    if (hours > 0) {
      days.push({ date, hours });
      remaining = sanitizeHoursInputAllowZero(remaining - hours);
    }
    cursor = addDaysUtc(cursor, 1);
  }

  return {
    days,
    overflow: remaining > 0,
    leftoverHours: remaining,
  };
}
