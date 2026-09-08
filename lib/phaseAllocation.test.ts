import { describe, expect, it } from "vitest";
import { DEFAULT_DAILY_HOURS, type DailyHours } from "@/lib/dailyHours";
import {
  computeFrontLoadAllocation,
  resolvePhaseStartDate,
} from "@/lib/phaseAllocation";

const WEEKDAYS: DailyHours = DEFAULT_DAILY_HOURS;

describe("resolvePhaseStartDate", () => {
  it("uses an explicit start date when set", () => {
    expect(
      resolvePhaseStartDate({
        startDate: "2026-03-02",
        previousDeadline: "2026-03-10",
        workItemStartDate: "2026-01-01",
      })
    ).toBe("2026-03-02");
  });

  it("infers the day after the previous phase deadline", () => {
    expect(
      resolvePhaseStartDate({
        startDate: null,
        previousDeadline: "2026-03-10",
        workItemStartDate: "2026-01-01",
      })
    ).toBe("2026-03-11");
  });

  it("falls back to the work item start for the first phase", () => {
    expect(
      resolvePhaseStartDate({
        startDate: "",
        previousDeadline: null,
        workItemStartDate: "2026-03-02",
      })
    ).toBe("2026-03-02");
  });

  it("returns null when nothing can be inferred", () => {
    expect(
      resolvePhaseStartDate({
        startDate: null,
        previousDeadline: null,
        workItemStartDate: null,
      })
    ).toBeNull();
  });
});

describe("computeFrontLoadAllocation", () => {
  it("front-loads across weekdays up to daily capacity", () => {
    // 2026-03-02 is a Monday.
    const result = computeFrontLoadAllocation({
      startDate: "2026-03-02",
      deadline: "2026-03-06",
      totalHours: 16,
      dailyHours: WEEKDAYS,
    });
    expect(result.overflow).toBe(false);
    expect(result.leftoverHours).toBe(0);
    expect(result.days).toEqual([
      { date: "2026-03-02", hours: 8 },
      { date: "2026-03-03", hours: 8 },
    ]);
  });

  it("skips zero-capacity days (weekends) without special-casing them", () => {
    // Friday 6 Mar through Tuesday 10 Mar: Fri 8, skip Sat/Sun, Mon 8.
    const result = computeFrontLoadAllocation({
      startDate: "2026-03-06",
      deadline: "2026-03-10",
      totalHours: 16,
      dailyHours: WEEKDAYS,
    });
    expect(result.days).toEqual([
      { date: "2026-03-06", hours: 8 },
      { date: "2026-03-09", hours: 8 },
    ]);
    expect(result.overflow).toBe(false);
  });

  it("reports overflow when the span cannot fit the hours", () => {
    // Mon–Wed is 24h of capacity; 40h leaves 16h leftover.
    const result = computeFrontLoadAllocation({
      startDate: "2026-03-02",
      deadline: "2026-03-04",
      totalHours: 40,
      dailyHours: WEEKDAYS,
    });
    expect(result.days).toEqual([
      { date: "2026-03-02", hours: 8 },
      { date: "2026-03-03", hours: 8 },
      { date: "2026-03-04", hours: 8 },
    ]);
    expect(result.overflow).toBe(true);
    expect(result.leftoverHours).toBe(16);
  });

  it("allocates a partial last day when remaining is below capacity", () => {
    const result = computeFrontLoadAllocation({
      startDate: "2026-03-02",
      deadline: "2026-03-06",
      totalHours: 12,
      dailyHours: WEEKDAYS,
    });
    expect(result.days).toEqual([
      { date: "2026-03-02", hours: 8 },
      { date: "2026-03-03", hours: 4 },
    ]);
  });

  it("does not allocate an inverted span", () => {
    const result = computeFrontLoadAllocation({
      startDate: "2026-03-10",
      deadline: "2026-03-02",
      totalHours: 8,
      dailyHours: WEEKDAYS,
    });
    expect(result).toEqual({
      days: [],
      overflow: false,
      leftoverHours: 0,
    });
  });

  it("overflows the full amount when every day has zero capacity", () => {
    const none: DailyHours = {
      mon: 0,
      tue: 0,
      wed: 0,
      thu: 0,
      fri: 0,
      sat: 0,
      sun: 0,
    };
    const result = computeFrontLoadAllocation({
      startDate: "2026-03-02",
      deadline: "2026-03-06",
      totalHours: 8,
      dailyHours: none,
    });
    expect(result.days).toEqual([]);
    expect(result.overflow).toBe(true);
    expect(result.leftoverHours).toBe(8);
  });
});
