import { formatHoursForDisplay, sanitizeHoursInputAllowZero } from "@/lib/hours";

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export type DailyHours = Record<DayKey, number>;
export type DailyHoursInput = Record<DayKey, string>;

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export const DAY_ARIA_LABELS: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const MAX_HOURS_PER_DAY = 24;

export const ALL_ZERO_HOURS_MESSAGE = "At least one day needs working hours";

export const DEFAULT_DAILY_HOURS: DailyHours = {
  mon: 8,
  tue: 8,
  wed: 8,
  thu: 8,
  fri: 8,
  sat: 0,
  sun: 0,
};

export function sanitizeDayHours(raw: string | number): number {
  return Math.min(MAX_HOURS_PER_DAY, sanitizeHoursInputAllowZero(raw));
}

export function sanitizeDailyHours(hours: DailyHours): DailyHours {
  const next = { ...DEFAULT_DAILY_HOURS };
  for (const day of DAY_KEYS) {
    next[day] = sanitizeDayHours(hours[day]);
  }
  return next;
}

export function dailyHoursFromInputs(inputs: DailyHoursInput): DailyHours {
  const next = { ...DEFAULT_DAILY_HOURS };
  for (const day of DAY_KEYS) {
    next[day] = sanitizeDayHours(inputs[day]);
  }
  return next;
}

export function dailyHoursToInputs(hours: DailyHours): DailyHoursInput {
  const next = {} as DailyHoursInput;
  for (const day of DAY_KEYS) {
    next[day] = formatHoursForDisplay(sanitizeDayHours(hours[day]));
  }
  return next;
}

export function parseDailyHours(raw: unknown): DailyHours {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const next = { ...DEFAULT_DAILY_HOURS };
  for (const day of DAY_KEYS) {
    next[day] = sanitizeDayHours(Number(obj[day]));
  }
  return next;
}

export function sumDailyHours(hours: DailyHours): number {
  return DAY_KEYS.reduce((sum, day) => sum + sanitizeDayHours(hours[day]), 0);
}

export function dailyHoursEqual(a: DailyHours, b: DailyHours): boolean {
  const left = sanitizeDailyHours(a);
  const right = sanitizeDailyHours(b);
  return DAY_KEYS.every((day) => left[day] === right[day]);
}

export function validateDailyHours(hours: DailyHours): string | null {
  const sanitized = sanitizeDailyHours(hours);
  for (const day of DAY_KEYS) {
    const value = sanitized[day];
    if (!Number.isFinite(value) || value < 0 || value > MAX_HOURS_PER_DAY) {
      return `Hours for each day must be between 0 and ${MAX_HOURS_PER_DAY}.`;
    }
  }
  if (sumDailyHours(sanitized) <= 0) {
    return ALL_ZERO_HOURS_MESSAGE;
  }
  return null;
}
