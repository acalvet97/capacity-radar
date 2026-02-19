// lib/dates.ts

const DEFAULT_TZ = "Europe/Madrid";

/**
 * Returns today's date as YYYY-MM-DD in the given timezone.
 * We keep dates as date-only strings to avoid DST/timezone bugs.
 */
export function todayYmdInTz(tz: string = DEFAULT_TZ): string {
  // en-CA yields YYYY-MM-DD format
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
  }).format(new Date());
}

/**
 * Parse YYYY-MM-DD into a Date at UTC midnight.
 * (Date-only semantics; no local timezone influence.)
 */
export function ymdToUtcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/**
 * Format a UTC-midnight Date into YYYY-MM-DD.
 */
export function utcDateToYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Format a date string (YYYY-MM-DD or ISO) as "dd/mm/yyyy" for frontend display.
 */
export function formatDateDdMmYyyy(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day}/${m}/${y}`;
}

/**
 * Add N days to a UTC Date (safe for date-only logic).
 */
export function addDaysUtc(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Add N weeks to a UTC Date.
 */
export function addWeeksUtc(d: Date, weeks: number): Date {
  return addDaysUtc(d, weeks * 7);
}

/**
 * ISO week starts Monday.
 * Returns the Monday (UTC midnight) for the week containing `d`.
 */
export function startOfIsoWeekUtc(d: Date): Date {
  // JS: 0=Sun..6=Sat
  // Convert so Monday=0..Sunday=6
  const mondayIndex = (d.getUTCDay() + 6) % 7;
  return addDaysUtc(d, -mondayIndex);
}

/**
 * End of ISO week (Sunday) for the week containing `d`.
 */
export function endOfIsoWeekUtc(d: Date): Date {
  return addDaysUtc(startOfIsoWeekUtc(d), 6);
}

/**
 * Difference in days (a - b). Uses UTC date semantics.
 */
export function diffDaysUtc(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Number of ISO weeks between two YYYY-MM-DD dates (inclusive).
 * Both dates are snapped to their ISO week; count includes start and end weeks.
 */
export function weeksBetweenIsoWeeksInclusive(startYmd: string, endYmd: string): number {
  const start = startOfIsoWeekUtc(ymdToUtcDate(startYmd));
  const end = startOfIsoWeekUtc(ymdToUtcDate(endYmd));
  const days = diffDaysUtc(end, start);
  return Math.floor(days / 7) + 1;
}

/**
 * Validates a string is a real calendar date in YYYY-MM-DD format.
 * Rejects invalid months/days (e.g. 2026-02-31).
 */
export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

export type WeekBucket = {
  key: string;           // e.g. "2026-02-16" (weekStartYmd)
  weekStartYmd: string;  // Monday
  weekEndYmd: string;    // Sunday
  label: string;         // e.g. "Feb 16 - Feb 22"
};

/**
 * Build ISO-week horizon buckets.
 *
 * - startYmd can be any date; we snap to that week's Monday.
 * - weeks defines the number of ISO weeks in the horizon.
 * - locale controls label formatting.
 *
 * Safe for server & client (labels forced to UTC).
 */
export function buildIsoWeekHorizon(params: {
  startYmd: string;
  weeks: number;
  locale?: string;
}): WeekBucket[] {
  const { startYmd, weeks, locale = "en-GB" } = params;

  const start = startOfIsoWeekUtc(ymdToUtcDate(startYmd));

  // Force UTC to avoid environment timezone shifts
  const fmt = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });

  const out: WeekBucket[] = [];

  for (let i = 0; i < weeks; i++) {
    const ws = addWeeksUtc(start, i);
    const we = addDaysUtc(ws, 6);

    const wsYmd = utcDateToYmd(ws);
    const weYmd = utcDateToYmd(we);

    out.push({
      key: wsYmd,
      weekStartYmd: wsYmd,
      weekEndYmd: weYmd,
      label: `${fmt.format(ws)} - ${fmt.format(we)}`,
    });
  }

  return out;
}
