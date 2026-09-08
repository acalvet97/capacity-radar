import { type DailyHours } from "@/lib/dailyHours";
import {
  addDaysUtc,
  diffDaysUtc,
  isValidYmd,
  utcDateToYmd,
  ymdToUtcDate,
} from "@/lib/dates";
import { sanitizeHoursInputAllowZero } from "@/lib/hours";
import { round1 } from "@/lib/utils";
import {
  dayKeyFromYmd,
  resolvePhaseStartDate,
  type AllocationDay,
} from "@/lib/phaseAllocation";
import type { WorkItemPhaseRow } from "@/lib/db/workItemPhases";

export type DateRange = {
  start: string;
  end: string;
};

/** date YMD → hours committed that day */
export type StackedHours = Record<string, number>;

export type UnboundedFrontLoad = {
  days: AllocationDay[];
  leftoverHours: number;
};

export type OverCapacityDay = {
  date: string;
  committed: number;
  capacity: number;
  overBy: number;
};

export type HypotheticalPhase = {
  startDate: string;
  totalHours: number;
  rangeEnd?: string;
};

export type StackingMember = {
  id: string;
  daily_hours: DailyHours;
};

export type StackingWorkItem = {
  start_date?: string | null;
  phases: WorkItemPhaseRow[];
};

export type MemberRemaining = {
  memberId: string;
  remainingHours: number;
};

export type HypotheticalAdditionResult = {
  leftoverHours: number;
  overCapacityDays: OverCapacityDay[];
};

/** Sort key for Earliest Deadline First sequential allocation. */
export type EdfKey = {
  deadline: string;
  startDate: string;
  sortOrder: number;
  id: string;
};

const MAX_WALK_DAYS = 730;
const EMPTY_UNBOUNDED: UnboundedFrontLoad = { days: [], leftoverHours: 0 };

function eachYmd(start: string, end: string): string[] {
  if (!isValidYmd(start) || !isValidYmd(end) || start > end) return [];
  const out: string[] = [];
  let cursor = ymdToUtcDate(start);
  const last = ymdToUtcDate(end);
  while (cursor.getTime() <= last.getTime()) {
    out.push(utcDateToYmd(cursor));
    cursor = addDaysUtc(cursor, 1);
  }
  return out;
}

export function spanDaysInclusive(start: string, end: string): number {
  if (!isValidYmd(start) || !isValidYmd(end) || start > end) return 0;
  return diffDaysUtc(ymdToUtcDate(end), ymdToUtcDate(start)) + 1;
}

export function remainingHoursOnDay(
  date: string,
  stackedHours: StackedHours,
  dailyHours: DailyHours
): number {
  if (!isValidYmd(date)) return 0;
  const capacity = sanitizeHoursInputAllowZero(
    dailyHours[dayKeyFromYmd(date)]
  );
  const committed = sanitizeHoursInputAllowZero(stackedHours[date] ?? 0);
  return sanitizeHoursInputAllowZero(Math.max(0, capacity - committed));
}

export function compareEdfKeys(a: EdfKey, b: EdfKey): number {
  if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * Front-load hours from startDate until they are placed, without a deadline
 * cap unless rangeEnd is set. Optional existingStackedHours reduces each day's
 * remaining cap so later phases spill forward instead of stacking on a full day.
 * Stops at rangeEnd, after 730 days, or after a full week of zero remaining
 * capacity (so a 0h schedule cannot loop forever).
 */
export function computeUnboundedFrontLoad(input: {
  startDate: string;
  totalHours: number;
  dailyHours: DailyHours;
  rangeEnd?: string;
  existingStackedHours?: StackedHours;
}): UnboundedFrontLoad {
  if (!isValidYmd(input.startDate)) return EMPTY_UNBOUNDED;
  const rangeEnd = input.rangeEnd?.trim() ?? "";
  if (rangeEnd && (!isValidYmd(rangeEnd) || rangeEnd < input.startDate)) {
    return EMPTY_UNBOUNDED;
  }

  let remaining = sanitizeHoursInputAllowZero(input.totalHours);
  if (remaining <= 0) return EMPTY_UNBOUNDED;

  const existing = input.existingStackedHours ?? {};
  const days: AllocationDay[] = [];
  let cursor = ymdToUtcDate(input.startDate);
  const hardEnd = rangeEnd
    ? ymdToUtcDate(rangeEnd)
    : addDaysUtc(cursor, MAX_WALK_DAYS);
  const walkCap = addDaysUtc(ymdToUtcDate(input.startDate), MAX_WALK_DAYS);
  const end =
    hardEnd.getTime() < walkCap.getTime() ? hardEnd : walkCap;

  let zeroStreak = 0;

  while (remaining > 0 && cursor.getTime() <= end.getTime()) {
    const date = utcDateToYmd(cursor);
    const rawCapacity = sanitizeHoursInputAllowZero(
      input.dailyHours[dayKeyFromYmd(date)]
    );
    const available = remainingHoursOnDay(date, existing, input.dailyHours);
    if (rawCapacity <= 0) {
      zeroStreak += 1;
      if (zeroStreak >= 7) break;
    } else if (available <= 0) {
      zeroStreak = 0;
    } else {
      zeroStreak = 0;
      const hours = Math.min(remaining, available);
      if (hours > 0) {
        days.push({ date, hours });
        remaining = sanitizeHoursInputAllowZero(remaining - hours);
      }
    }
    cursor = addDaysUtc(cursor, 1);
  }

  return { days, leftoverHours: remaining };
}

function memberById(
  members: StackingMember[],
  memberId: string
): StackingMember | undefined {
  return members.find((m) => m.id === memberId);
}

function addHours(map: StackedHours, date: string, hours: number) {
  if (hours <= 0) return;
  map[date] = sanitizeHoursInputAllowZero((map[date] ?? 0) + hours);
}

type ResolvedOwnedPhase = {
  id: string;
  deadline: string;
  startDate: string;
  sortOrder: number;
  totalHours: number;
};

function collectOwnedPhases(input: {
  memberId: string;
  workItems: StackingWorkItem[];
  excludePhaseId?: string | null;
  onlyBefore?: EdfKey | null;
}): ResolvedOwnedPhase[] {
  const exclude = input.excludePhaseId?.trim() || "";
  const collected: ResolvedOwnedPhase[] = [];

  for (const item of input.workItems) {
    const phases = [...(item.phases ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order
    );
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      if (phase.id === exclude) continue;
      if (phase.owner_member_id !== input.memberId) continue;

      const previousDeadline = i > 0 ? phases[i - 1]?.deadline ?? null : null;
      const startDate = resolvePhaseStartDate({
        startDate: phase.start_date,
        previousDeadline,
        workItemStartDate: item.start_date,
      });
      if (!startDate) continue;

      const resolved: ResolvedOwnedPhase = {
        id: phase.id,
        deadline: phase.deadline,
        startDate,
        sortOrder: phase.sort_order,
        totalHours: Number(phase.estimated_hours ?? 0),
      };
      if (input.onlyBefore) {
        const cmp = compareEdfKeys(
          {
            deadline: resolved.deadline,
            startDate: resolved.startDate,
            sortOrder: resolved.sortOrder,
            id: resolved.id,
          },
          input.onlyBefore
        );
        if (cmp >= 0) continue;
      }
      collected.push(resolved);
    }
  }

  collected.sort((a, b) =>
    compareEdfKeys(
      {
        deadline: a.deadline,
        startDate: a.startDate,
        sortOrder: a.sortOrder,
        id: a.id,
      },
      {
        deadline: b.deadline,
        startDate: b.startDate,
        sortOrder: b.sortOrder,
        id: b.id,
      }
    )
  );
  return collected;
}

/**
 * Day-by-day committed hours for one member. Owned phases are allocated
 * sequentially Earliest Deadline First into leftover daily hours. Phases
 * without an owner, start, or daily hours contribute 0.
 */
export function getStackedDailyHours(input: {
  memberId: string;
  range: DateRange;
  workItems: StackingWorkItem[];
  members: StackingMember[];
  excludePhaseId?: string | null;
  /** When set, only phases that sort strictly before this EDF key are allocated. */
  onlyBefore?: EdfKey | null;
}): StackedHours {
  const stacked: StackedHours = {};
  const member = memberById(input.members, input.memberId);
  if (!member) return stacked;
  if (
    !isValidYmd(input.range.start) ||
    !isValidYmd(input.range.end) ||
    input.range.start > input.range.end
  ) {
    return stacked;
  }

  const owned = collectOwnedPhases({
    memberId: input.memberId,
    workItems: input.workItems,
    excludePhaseId: input.excludePhaseId,
    onlyBefore: input.onlyBefore,
  });

  const running: StackedHours = {};
  for (const phase of owned) {
    const allocation = computeUnboundedFrontLoad({
      startDate: phase.startDate,
      totalHours: phase.totalHours,
      dailyHours: member.daily_hours,
      rangeEnd: input.range.end,
      existingStackedHours: running,
    });
    for (const day of allocation.days) {
      addHours(running, day.date, day.hours);
    }
  }

  for (const date of eachYmd(input.range.start, input.range.end)) {
    const hours = running[date];
    if (hours) stacked[date] = hours;
  }
  return stacked;
}

/**
 * Overlay a not-yet-saved phase on leftover daily hours and report leftover
 * after rangeEnd (the phase deadline in the editor). Days should not exceed
 * raw daily_hours with this walk; overCapacityDays is a safety net.
 */
export function evaluateHypotheticalAddition(input: {
  hypotheticalPhase: HypotheticalPhase;
  existingStackedHours: StackedHours;
  dailyHours: DailyHours;
}): HypotheticalAdditionResult {
  const allocation = computeUnboundedFrontLoad({
    startDate: input.hypotheticalPhase.startDate,
    totalHours: input.hypotheticalPhase.totalHours,
    dailyHours: input.dailyHours,
    rangeEnd: input.hypotheticalPhase.rangeEnd,
    existingStackedHours: input.existingStackedHours,
  });

  const overCapacityDays: OverCapacityDay[] = [];
  for (const day of allocation.days) {
    const capacity = sanitizeHoursInputAllowZero(
      input.dailyHours[dayKeyFromYmd(day.date)]
    );
    const committed = sanitizeHoursInputAllowZero(
      (input.existingStackedHours[day.date] ?? 0) + day.hours
    );
    if (committed > capacity) {
      overCapacityDays.push({
        date: day.date,
        committed,
        capacity,
        overBy: sanitizeHoursInputAllowZero(committed - capacity),
      });
    }
  }

  return {
    leftoverHours: allocation.leftoverHours,
    overCapacityDays,
  };
}

export function getMemberRemainingInRange(input: {
  range: DateRange;
  stackedHours: StackedHours;
  dailyHours: DailyHours;
}): number {
  let remaining = 0;
  for (const date of eachYmd(input.range.start, input.range.end)) {
    remaining += remainingHoursOnDay(date, input.stackedHours, input.dailyHours);
  }
  return sanitizeHoursInputAllowZero(remaining);
}

export function getTeamRemainingInRange(input: {
  memberRemainings: number[];
  bufferHoursPerWeek: number;
  spanDays: number;
}): number {
  const raw = input.memberRemainings.reduce(
    (sum, n) => sum + sanitizeHoursInputAllowZero(n),
    0
  );
  const spanDays =
    Number.isFinite(input.spanDays) && input.spanDays > 0 ? input.spanDays : 0;
  const reserved = sanitizeHoursInputAllowZero(
    sanitizeHoursInputAllowZero(input.bufferHoursPerWeek) * (spanDays / 7)
  );
  return sanitizeHoursInputAllowZero(Math.max(0, raw - reserved));
}

export function stackedHoursInWeek(
  stackedByMember: StackedHours[],
  weekStartYmd: string,
  weekEndYmd: string
): number {
  let total = 0;
  for (const stacked of stackedByMember) {
    for (const date of eachYmd(weekStartYmd, weekEndYmd)) {
      total += stacked[date] ?? 0;
    }
  }
  return round1(total);
}

export function eachYmdInRange(start: string, end: string): string[] {
  return eachYmd(start, end);
}
