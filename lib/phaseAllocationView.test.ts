import { describe, expect, it } from "vitest";
import { DEFAULT_DAILY_HOURS } from "@/lib/dailyHours";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import { allocationViewFor } from "@/lib/phaseAllocationView";

const OWNER: TeamMemberRow = {
  id: "member-1",
  name: "Ada",
  hours_per_cycle: 160,
  daily_hours: DEFAULT_DAILY_HOURS,
  is_daily_hours_confirmed: true,
};

const NO_WORK_ITEMS: WorkItemRow[] = [];

function viewFor(overrides: Partial<Parameters<typeof allocationViewFor>[0]> = {}) {
  return allocationViewFor({
    ownerMemberId: OWNER.id,
    startDate: "2026-03-02",
    deadline: "2026-03-06",
    hours: 16,
    previousDeadline: null,
    workItemStartDate: "2026-03-02",
    teamMembers: [OWNER],
    allWorkItems: NO_WORK_ITEMS,
    excludePhaseId: null,
    edfKey: {
      deadline: "2026-03-06",
      startDate: "2026-03-02",
      sortOrder: 0,
      id: "phase-1",
    },
    ...overrides,
  });
}

describe("allocationViewFor", () => {
  it("allocates against an owner with capacity", () => {
    const view = viewFor();

    expect(view.owner).toEqual(OWNER);
    expect(view.resolvedStart).toBe("2026-03-02");
    expect(view.explicitInverted).toBe(false);
    expect(view.inferredInverted).toBe(false);
    expect(view.allocation).not.toBeNull();
    // 16h at 8h/day on an empty schedule places fully, leaving nothing over.
    expect(view.stackingLeftoverHours).toBe(0);
  });

  it("skips allocation when the owner is missing", () => {
    const view = viewFor({ ownerMemberId: "" });

    expect(view.owner).toBeNull();
    expect(view.allocation).toBeNull();
    expect(view.stackingLeftoverHours).toBe(0);
    // Dates still resolve so the row can render its span label.
    expect(view.resolvedStart).toBe("2026-03-02");
  });

  it("flags an explicit start after the deadline and skips allocation", () => {
    const view = viewFor({ startDate: "2026-03-10", deadline: "2026-03-06" });

    expect(view.explicitInverted).toBe(true);
    expect(view.inferredInverted).toBe(false);
    expect(view.allocation).toBeNull();
  });

  it("flags an inferred start after the deadline", () => {
    // No explicit start: it infers the day after the previous phase, which
    // lands past this phase's deadline.
    const view = viewFor({
      startDate: "",
      previousDeadline: "2026-03-20",
      deadline: "2026-03-06",
    });

    expect(view.explicitInverted).toBe(false);
    expect(view.inferredInverted).toBe(true);
    expect(view.allocation).toBeNull();
  });

  it("reports leftover hours when the window is too short", () => {
    // 80h needs 10 working days; this window has 5.
    const view = viewFor({ hours: 80 });

    expect(view.allocation).not.toBeNull();
    expect(view.stackingLeftoverHours).toBeGreaterThan(0);
  });
});
