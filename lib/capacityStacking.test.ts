import { describe, expect, it } from "vitest";
import { DEFAULT_DAILY_HOURS, type DailyHours } from "@/lib/dailyHours";
import type { WorkItemPhaseRow } from "@/lib/db/workItemPhases";
import {
  computeUnboundedFrontLoad,
  evaluateHypotheticalAddition,
  getMemberRemainingInRange,
  getStackedDailyHours,
  getTeamRemainingInRange,
  spanDaysInclusive,
  type EdfKey,
  type StackingMember,
  type StackingWorkItem,
} from "@/lib/capacityStacking";

const WEEKDAYS: DailyHours = DEFAULT_DAILY_HOURS;

const FIFTY: DailyHours = {
  mon: 10,
  tue: 10,
  wed: 10,
  thu: 10,
  fri: 10,
  sat: 0,
  sun: 0,
};

const ZERO: DailyHours = {
  mon: 0,
  tue: 0,
  wed: 0,
  thu: 0,
  fri: 0,
  sat: 0,
  sun: 0,
};

const MEMBER_A: StackingMember = {
  id: "a",
  daily_hours: WEEKDAYS,
};

const MEMBER_B: StackingMember = {
  id: "b",
  daily_hours: WEEKDAYS,
};

const MEMBER_FIFTY: StackingMember = {
  id: "a",
  daily_hours: FIFTY,
};

function phase(
  partial: Partial<WorkItemPhaseRow> & Pick<WorkItemPhaseRow, "id">
): WorkItemPhaseRow {
  return {
    name: "Phase",
    owner_member_id: "a",
    start_date: "2026-03-02",
    deadline: "2026-03-06",
    estimated_hours: 8,
    sort_order: 0,
    ...partial,
  };
}

function item(phases: WorkItemPhaseRow[], start = "2026-03-02"): StackingWorkItem {
  return { start_date: start, phases };
}

function leftoverAfterDeadline(input: {
  member: StackingMember;
  workItems: StackingWorkItem[];
  startDate: string;
  deadline: string;
  totalHours: number;
  excludePhaseId?: string;
  edfKey: EdfKey;
}): number {
  const stacked = getStackedDailyHours({
    memberId: input.member.id,
    range: { start: input.startDate, end: input.deadline },
    workItems: input.workItems,
    members: [input.member],
    excludePhaseId: input.excludePhaseId,
    onlyBefore: input.edfKey,
  });
  return evaluateHypotheticalAddition({
    hypotheticalPhase: {
      startDate: input.startDate,
      totalHours: input.totalHours,
      rangeEnd: input.deadline,
    },
    existingStackedHours: stacked,
    dailyHours: input.member.daily_hours,
  }).leftoverHours;
}

describe("computeUnboundedFrontLoad", () => {
  it("continues past a deadline until hours are placed", () => {
    const result = computeUnboundedFrontLoad({
      startDate: "2026-03-02",
      totalHours: 40,
      dailyHours: WEEKDAYS,
    });
    expect(result.leftoverHours).toBe(0);
    expect(result.days).toEqual([
      { date: "2026-03-02", hours: 8 },
      { date: "2026-03-03", hours: 8 },
      { date: "2026-03-04", hours: 8 },
      { date: "2026-03-05", hours: 8 },
      { date: "2026-03-06", hours: 8 },
    ]);
  });

  it("spills into the following week when hours exceed the first week's capacity", () => {
    const result = computeUnboundedFrontLoad({
      startDate: "2026-03-02",
      totalHours: 48,
      dailyHours: WEEKDAYS,
    });
    expect(result.leftoverHours).toBe(0);
    expect(result.days.at(-1)).toEqual({ date: "2026-03-09", hours: 8 });
  });

  it("stops at rangeEnd with leftover", () => {
    const result = computeUnboundedFrontLoad({
      startDate: "2026-03-02",
      totalHours: 40,
      dailyHours: WEEKDAYS,
      rangeEnd: "2026-03-03",
    });
    expect(result.days).toEqual([
      { date: "2026-03-02", hours: 8 },
      { date: "2026-03-03", hours: 8 },
    ]);
    expect(result.leftoverHours).toBe(24);
  });

  it("stops after a full week of zero capacity instead of looping", () => {
    const result = computeUnboundedFrontLoad({
      startDate: "2026-03-02",
      totalHours: 8,
      dailyHours: ZERO,
    });
    expect(result.days).toEqual([]);
    expect(result.leftoverHours).toBe(8);
  });

  it("uses leftover daily hours instead of stacking on a full day", () => {
    const result = computeUnboundedFrontLoad({
      startDate: "2026-03-02",
      totalHours: 8,
      dailyHours: WEEKDAYS,
      existingStackedHours: { "2026-03-02": 8 },
    });
    expect(result.leftoverHours).toBe(0);
    expect(result.days).toEqual([{ date: "2026-03-03", hours: 8 }]);
  });
});

describe("getStackedDailyHours", () => {
  it("spills overlapping same-start phases onto leftover days, tighter deadline first", () => {
    const workItems = [
      item([
        phase({
          id: "long",
          estimated_hours: 16,
          start_date: "2026-03-02",
          deadline: "2026-03-13",
        }),
      ]),
      item([
        phase({
          id: "short",
          estimated_hours: 8,
          start_date: "2026-03-02",
          deadline: "2026-03-04",
        }),
      ]),
    ];
    const stacked = getStackedDailyHours({
      memberId: "a",
      range: { start: "2026-03-02", end: "2026-03-06" },
      workItems,
      members: [MEMBER_A],
    });
    expect(stacked["2026-03-02"]).toBe(8);
    expect(stacked["2026-03-03"]).toBe(8);
    expect(stacked["2026-03-04"]).toBe(8);
    expect(stacked["2026-03-05"]).toBeUndefined();
  });

  it("includes overflow hours that land after the phase deadline", () => {
    const workItems = [
      item([
        phase({
          id: "p1",
          start_date: "2026-03-02",
          deadline: "2026-03-03",
          estimated_hours: 24,
        }),
      ]),
    ];
    const stacked = getStackedDailyHours({
      memberId: "a",
      range: { start: "2026-03-02", end: "2026-03-06" },
      workItems,
      members: [MEMBER_A],
    });
    expect(stacked["2026-03-02"]).toBe(8);
    expect(stacked["2026-03-03"]).toBe(8);
    expect(stacked["2026-03-04"]).toBe(8);
  });

  it("returns an empty map when the member has no phases", () => {
    const stacked = getStackedDailyHours({
      memberId: "a",
      range: { start: "2026-03-02", end: "2026-03-06" },
      workItems: [item([phase({ id: "p1", owner_member_id: "b" })])],
      members: [MEMBER_A, MEMBER_B],
    });
    expect(stacked).toEqual({});
  });

  it("excludes a phase being edited so it is not double-counted", () => {
    const workItems = [
      item([
        phase({
          id: "editing",
          estimated_hours: 16,
          start_date: "2026-03-02",
        }),
        phase({
          id: "other",
          estimated_hours: 8,
          start_date: "2026-03-02",
          sort_order: 1,
        }),
      ]),
    ];
    const stacked = getStackedDailyHours({
      memberId: "a",
      range: { start: "2026-03-02", end: "2026-03-06" },
      workItems,
      members: [MEMBER_A],
      excludePhaseId: "editing",
    });
    expect(stacked["2026-03-02"]).toBe(8);
    expect(stacked["2026-03-03"]).toBeUndefined();
  });

  it("does not count another member's phases", () => {
    const workItems = [
      item([
        phase({ id: "p1", owner_member_id: "a", estimated_hours: 8 }),
        phase({
          id: "p2",
          owner_member_id: "b",
          estimated_hours: 8,
          start_date: "2026-03-02",
          sort_order: 1,
        }),
      ]),
    ];
    const stackedA = getStackedDailyHours({
      memberId: "a",
      range: { start: "2026-03-02", end: "2026-03-06" },
      workItems,
      members: [MEMBER_A, MEMBER_B],
    });
    const stackedB = getStackedDailyHours({
      memberId: "b",
      range: { start: "2026-03-02", end: "2026-03-06" },
      workItems,
      members: [MEMBER_A, MEMBER_B],
    });
    expect(stackedA["2026-03-02"]).toBe(8);
    expect(stackedB["2026-03-02"]).toBe(8);
  });

  it("lets the earlier deadline take a shared start day (screenshot-shaped 2h + 12h)", () => {
    const workItems = [
      item([
        phase({
          id: "logo",
          estimated_hours: 2,
          start_date: "2026-09-07",
          deadline: "2026-09-15",
        }),
        phase({
          id: "web",
          estimated_hours: 12,
          start_date: "2026-09-07",
          deadline: "2026-09-21",
          sort_order: 1,
        }),
      ]),
    ];
    const stacked = getStackedDailyHours({
      memberId: "a",
      range: { start: "2026-09-07", end: "2026-09-21" },
      workItems,
      members: [MEMBER_A],
    });
    expect(stacked["2026-09-07"]).toBe(8);
    expect(stacked["2026-09-08"]).toBe(6);
    expect(
      leftoverAfterDeadline({
        member: MEMBER_A,
        workItems,
        startDate: "2026-09-07",
        deadline: "2026-09-15",
        totalHours: 2,
        excludePhaseId: "logo",
        edfKey: {
          deadline: "2026-09-15",
          startDate: "2026-09-07",
          sortOrder: 0,
          id: "logo",
        },
      })
    ).toBe(0);
    expect(
      leftoverAfterDeadline({
        member: MEMBER_A,
        workItems,
        startDate: "2026-09-07",
        deadline: "2026-09-21",
        totalHours: 12,
        excludePhaseId: "web",
        edfKey: {
          deadline: "2026-09-21",
          startDate: "2026-09-07",
          sortOrder: 1,
          id: "web",
        },
      })
    ).toBe(0);
  });

  it("gives a later-starting tighter deadline priority on its active days (EDF)", () => {
    const a = phase({
      id: "a-long",
      estimated_hours: 30,
      start_date: "2026-09-07",
      deadline: "2026-09-30",
    });
    const bSameStart = phase({
      id: "b-short",
      estimated_hours: 5,
      start_date: "2026-09-07",
      deadline: "2026-09-09",
      sort_order: 1,
    });
    const sameStart = [item([a, bSameStart])];
    const stackedSame = getStackedDailyHours({
      memberId: "a",
      range: { start: "2026-09-07", end: "2026-09-30" },
      workItems: sameStart,
      members: [MEMBER_FIFTY],
    });
    expect(stackedSame["2026-09-07"]).toBe(10);
    expect(stackedSame["2026-09-08"]).toBe(10);
    expect(stackedSame["2026-09-09"]).toBe(10);
    expect(
      leftoverAfterDeadline({
        member: MEMBER_FIFTY,
        workItems: sameStart,
        startDate: "2026-09-07",
        deadline: "2026-09-09",
        totalHours: 5,
        excludePhaseId: "b-short",
        edfKey: {
          deadline: "2026-09-09",
          startDate: "2026-09-07",
          sortOrder: 1,
          id: "b-short",
        },
      })
    ).toBe(0);
    expect(
      leftoverAfterDeadline({
        member: MEMBER_FIFTY,
        workItems: sameStart,
        startDate: "2026-09-07",
        deadline: "2026-09-30",
        totalHours: 30,
        excludePhaseId: "a-long",
        edfKey: {
          deadline: "2026-09-30",
          startDate: "2026-09-07",
          sortOrder: 0,
          id: "a-long",
        },
      })
    ).toBe(0);

    const bStaggered = phase({
      id: "b-short",
      estimated_hours: 5,
      start_date: "2026-09-09",
      deadline: "2026-09-11",
      sort_order: 1,
    });
    const staggered = [item([a, bStaggered])];
    const stackedStaggered = getStackedDailyHours({
      memberId: "a",
      range: { start: "2026-09-07", end: "2026-09-30" },
      workItems: staggered,
      members: [MEMBER_FIFTY],
    });
    expect(stackedStaggered["2026-09-07"]).toBe(10);
    expect(stackedStaggered["2026-09-08"]).toBe(10);
    expect(stackedStaggered["2026-09-09"]).toBe(10);
    expect(
      leftoverAfterDeadline({
        member: MEMBER_FIFTY,
        workItems: staggered,
        startDate: "2026-09-09",
        deadline: "2026-09-11",
        totalHours: 5,
        excludePhaseId: "b-short",
        edfKey: {
          deadline: "2026-09-11",
          startDate: "2026-09-09",
          sortOrder: 1,
          id: "b-short",
        },
      })
    ).toBe(0);
    expect(
      leftoverAfterDeadline({
        member: MEMBER_FIFTY,
        workItems: staggered,
        startDate: "2026-09-07",
        deadline: "2026-09-30",
        totalHours: 30,
        excludePhaseId: "a-long",
        edfKey: {
          deadline: "2026-09-30",
          startDate: "2026-09-07",
          sortOrder: 0,
          id: "a-long",
        },
      })
    ).toBe(0);
  });
});

describe("evaluateHypotheticalAddition", () => {
  it("returns no leftover when the addition fits on later leftover days", () => {
    const result = evaluateHypotheticalAddition({
      hypotheticalPhase: { startDate: "2026-03-04", totalHours: 8 },
      existingStackedHours: { "2026-03-02": 8, "2026-03-03": 8 },
      dailyHours: WEEKDAYS,
    });
    expect(result.leftoverHours).toBe(0);
    expect(result.overCapacityDays).toEqual([]);
  });

  it("spills a full Monday onto Tuesday instead of overfilling", () => {
    const result = evaluateHypotheticalAddition({
      hypotheticalPhase: { startDate: "2026-03-02", totalHours: 8 },
      existingStackedHours: { "2026-03-02": 8 },
      dailyHours: WEEKDAYS,
    });
    expect(result.leftoverHours).toBe(0);
    expect(result.overCapacityDays).toEqual([]);
  });

  it("reports leftover when the span is already full", () => {
    const result = evaluateHypotheticalAddition({
      hypotheticalPhase: {
        startDate: "2026-03-02",
        totalHours: 8,
        rangeEnd: "2026-03-02",
      },
      existingStackedHours: { "2026-03-02": 8 },
      dailyHours: WEEKDAYS,
    });
    expect(result.leftoverHours).toBe(8);
    expect(result.overCapacityDays).toEqual([]);
  });

  it("can leftover-warn one owner while another still has room on the same work item", () => {
    const workItems = [
      item([
        phase({ id: "a-busy", owner_member_id: "a", estimated_hours: 40 }),
        phase({
          id: "b-light",
          owner_member_id: "b",
          estimated_hours: 8,
          sort_order: 1,
        }),
      ]),
    ];
    const stackedA = getStackedDailyHours({
      memberId: "a",
      range: { start: "2026-03-02", end: "2026-03-06" },
      workItems,
      members: [MEMBER_A, MEMBER_B],
    });
    const stackedB = getStackedDailyHours({
      memberId: "b",
      range: { start: "2026-03-02", end: "2026-03-13" },
      workItems,
      members: [MEMBER_A, MEMBER_B],
    });
    const overA = evaluateHypotheticalAddition({
      hypotheticalPhase: {
        startDate: "2026-03-02",
        totalHours: 8,
        rangeEnd: "2026-03-06",
      },
      existingStackedHours: stackedA,
      dailyHours: WEEKDAYS,
    });
    const overB = evaluateHypotheticalAddition({
      hypotheticalPhase: {
        startDate: "2026-03-03",
        totalHours: 8,
        rangeEnd: "2026-03-13",
      },
      existingStackedHours: stackedB,
      dailyHours: WEEKDAYS,
    });
    expect(overA.leftoverHours).toBeGreaterThan(0);
    expect(overB.leftoverHours).toBe(0);
  });
});

describe("remaining in range", () => {
  it("counts leftover raw daily hours for a member with no commitments", () => {
    const remaining = getMemberRemainingInRange({
      range: { start: "2026-03-02", end: "2026-03-06" },
      stackedHours: {},
      dailyHours: WEEKDAYS,
    });
    expect(remaining).toBe(40);
  });

  it("subtracts reserved capacity pro-rated to the span for team fit", () => {
    const spanDays = spanDaysInclusive("2026-03-02", "2026-03-06");
    expect(spanDays).toBe(5);
    const team = getTeamRemainingInRange({
      memberRemainings: [40, 40],
      bufferHoursPerWeek: 20,
      spanDays,
    });
    expect(team).toBe(65.5);
  });

  it("clamps team remaining at 0 when reserved exceeds slack", () => {
    const team = getTeamRemainingInRange({
      memberRemainings: [4],
      bufferHoursPerWeek: 20,
      spanDays: 7,
    });
    expect(team).toBe(0);
  });

  it("does not subtract reserved from per-member remaining", () => {
    const remaining = getMemberRemainingInRange({
      range: { start: "2026-03-02", end: "2026-03-06" },
      stackedHours: { "2026-03-02": 8 },
      dailyHours: WEEKDAYS,
    });
    expect(remaining).toBe(32);
  });
});
