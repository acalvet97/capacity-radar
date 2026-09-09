import type { TeamMemberRow } from "@/lib/db/getTeamMembers";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import {
  computeFrontLoadAllocation,
  isStartAfterDeadline,
  resolvePhaseStartDate,
  type FrontLoadAllocation,
} from "@/lib/phaseAllocation";
import {
  evaluateHypotheticalAddition,
  getStackedDailyHours,
  type EdfKey,
} from "@/lib/capacityStacking";

export type AllocationView = {
  owner: TeamMemberRow | null;
  resolvedStart: string | null;
  inferredStart: string | null;
  explicitInverted: boolean;
  inferredInverted: boolean;
  allocation: FrontLoadAllocation | null;
  stackingLeftoverHours: number;
  deadline: string;
};

export type AllocationViewInput = {
  ownerMemberId: string;
  startDate: string;
  deadline: string;
  hours: number;
  previousDeadline: string | null;
  workItemStartDate: string;
  teamMembers: TeamMemberRow[];
  allWorkItems: WorkItemRow[];
  excludePhaseId?: string | null;
  edfKey: EdfKey;
};

/**
 * Resolve a phase's start date and its front-loaded day-by-day allocation,
 * accounting for what the owner is already committed to.
 *
 * Expensive: getStackedDailyHours walks every work item and phase owned by this
 * member. Callers rendering a list should memoize rather than call per row per
 * render.
 */
export function allocationViewFor(input: AllocationViewInput): AllocationView {
  const owner =
    input.teamMembers.find((member) => member.id === input.ownerMemberId) ??
    null;
  const explicit = input.startDate.trim();
  const inferredStart = resolvePhaseStartDate({
    startDate: null,
    previousDeadline: input.previousDeadline,
    workItemStartDate: input.workItemStartDate,
  });
  const resolvedStart = resolvePhaseStartDate({
    startDate: explicit || null,
    previousDeadline: input.previousDeadline,
    workItemStartDate: input.workItemStartDate,
  });
  const deadline = input.deadline.trim();
  const explicitInverted = Boolean(
    explicit && deadline && isStartAfterDeadline(explicit, deadline)
  );
  const inferredInverted = Boolean(
    !explicit &&
      resolvedStart &&
      deadline &&
      isStartAfterDeadline(resolvedStart, deadline)
  );

  let allocation: FrontLoadAllocation | null = null;
  let stackingLeftoverHours = 0;
  if (
    owner &&
    resolvedStart &&
    deadline &&
    input.hours > 0 &&
    !explicitInverted &&
    !inferredInverted
  ) {
    allocation = computeFrontLoadAllocation({
      startDate: resolvedStart,
      deadline,
      totalHours: input.hours,
      dailyHours: owner.daily_hours,
    });
    const stacked = getStackedDailyHours({
      memberId: owner.id,
      range: { start: resolvedStart, end: deadline },
      workItems: input.allWorkItems,
      members: input.teamMembers,
      excludePhaseId: input.excludePhaseId,
      onlyBefore: {
        deadline,
        startDate: resolvedStart,
        sortOrder: input.edfKey.sortOrder,
        id: input.edfKey.id,
      },
    });
    stackingLeftoverHours = evaluateHypotheticalAddition({
      hypotheticalPhase: {
        startDate: resolvedStart,
        totalHours: input.hours,
        rangeEnd: deadline,
      },
      existingStackedHours: stacked,
      dailyHours: owner.daily_hours,
    }).leftoverHours;
  }

  return {
    owner,
    resolvedStart,
    inferredStart,
    explicitInverted,
    inferredInverted,
    allocation,
    stackingLeftoverHours,
    deadline,
  };
}
