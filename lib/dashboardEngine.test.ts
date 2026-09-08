import { describe, expect, it } from "vitest";
import { DEFAULT_DAILY_HOURS } from "@/lib/dailyHours";
import { buildDashboardSnapshot } from "@/lib/dashboardEngine";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import type { WorkItemPhaseRow } from "@/lib/db/workItemPhases";

const MEMBER: TeamMemberRow = {
  id: "a",
  name: "Ana",
  hours_per_cycle: 160,
  daily_hours: DEFAULT_DAILY_HOURS,
  is_daily_hours_confirmed: true,
};

function phase(
  partial: Partial<WorkItemPhaseRow> & Pick<WorkItemPhaseRow, "id">
): WorkItemPhaseRow {
  return {
    name: "Build",
    owner_member_id: "a",
    start_date: "2026-03-02",
    deadline: "2026-03-06",
    estimated_hours: 16,
    sort_order: 0,
    ...partial,
  };
}

function item(phases: WorkItemPhaseRow[]): WorkItemRow {
  return {
    id: "wi-1",
    name: "Site",
    estimated_hours: phases.reduce((sum, p) => sum + p.estimated_hours, 0),
    start_date: "2026-03-02",
    deadline: "2026-03-06",
    created_at: "2026-03-01T00:00:00.000Z",
    phases,
  };
}

describe("buildDashboardSnapshot", () => {
  it("rolls stacked daily hours into the ISO week and keeps reserved off committed", () => {
    const snapshot = buildDashboardSnapshot({
      members: [MEMBER],
      workItems: [item([phase({ id: "p1" })])],
      bufferHoursPerWeek: 8,
      startYmd: "2026-03-02",
      weeks: 1,
    });

    expect(snapshot.horizonWeeks).toHaveLength(1);
    expect(snapshot.horizonWeeks[0].committedHours).toBe(16);
    expect(snapshot.horizonWeeks[0].capacityHours).toBe(32);
    expect(snapshot.bufferHoursPerWeek).toBe(8);
  });

  it("counts overlapping phases on the same person as stacked, not even-spread", () => {
    const snapshot = buildDashboardSnapshot({
      members: [MEMBER],
      workItems: [
        item([
          phase({ id: "p1", estimated_hours: 8 }),
          phase({
            id: "p2",
            estimated_hours: 8,
            start_date: "2026-03-02",
          }),
        ]),
      ],
      bufferHoursPerWeek: 0,
      startYmd: "2026-03-02",
      weeks: 1,
    });

    // Both phases front-load Monday; stacking still totals 16h in the week.
    expect(snapshot.horizonWeeks[0].committedHours).toBe(16);
    expect(snapshot.horizonWeeks[0].capacityHours).toBe(40);
  });
});
