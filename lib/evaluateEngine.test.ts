import { describe, expect, it } from "vitest";
import { DEFAULT_DAILY_HOURS } from "@/lib/dailyHours";
import { buildDashboardSnapshot } from "@/lib/dashboardEngine";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";
import {
  buildOverCapacityScenarios,
  evaluateNewWork,
  fitsWithinCapacity,
} from "@/lib/evaluateEngine";

const ANA: TeamMemberRow = {
  id: "a",
  name: "Ana",
  hours_per_cycle: 160,
  daily_hours: DEFAULT_DAILY_HOURS,
  is_daily_hours_confirmed: true,
};

describe("evaluateNewWork", () => {
  it("fits when requested hours are within reserved-adjusted team remaining", () => {
    const members = [ANA];
    const snapshot = buildDashboardSnapshot({
      members,
      workItems: [],
      bufferHoursPerWeek: 20,
      startYmd: "2026-03-02",
      weeks: 2,
    });
    const result = evaluateNewWork(
      snapshot,
      {
        name: "New site",
        totalHours: 16,
        startYmd: "2026-03-02",
        deadlineYmd: "2026-03-06",
      },
      { members, workItems: [] }
    );

    // Raw remaining Mon–Fri = 40h. Reserved 20h/week × 5/7 = 14.5 → 25.5.
    expect(result.teamRemainingHours).toBe(25.5);
    expect(result.memberRemainings[0]?.remainingHours).toBe(40);
    expect(fitsWithinCapacity(result)).toBe(true);
  });

  it("does not fit when reserved subtraction leaves too little team remaining", () => {
    const members = [ANA];
    const snapshot = buildDashboardSnapshot({
      members,
      workItems: [],
      bufferHoursPerWeek: 20,
      startYmd: "2026-03-02",
      weeks: 2,
    });
    const result = evaluateNewWork(
      snapshot,
      {
        name: "Huge",
        totalHours: 40,
        startYmd: "2026-03-02",
        deadlineYmd: "2026-03-06",
      },
      { members, workItems: [] }
    );

    expect(fitsWithinCapacity(result)).toBe(false);
    expect(result.memberRemainings[0]?.remainingHours).toBe(40);
  });

  it("offers extend_deadline and reduce_scope, not switch_allocation", () => {
    const members = [ANA];
    const snapshot = buildDashboardSnapshot({
      members,
      workItems: [],
      bufferHoursPerWeek: 20,
      startYmd: "2026-03-02",
      weeks: 8,
    });
    const scenarios = buildOverCapacityScenarios(
      snapshot,
      {
        name: "Huge",
        totalHours: 40,
        startYmd: "2026-03-02",
        deadlineYmd: "2026-03-06",
      },
      { members, workItems: [] }
    );

    expect(scenarios.map((s) => s.id)).toEqual(
      expect.arrayContaining(["extend_deadline", "reduce_scope"])
    );
    expect(scenarios.map((s) => s.id)).not.toContain("switch_allocation");
  });
});
