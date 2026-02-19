"use client";

import { WorkItemsTable } from "@/components/work-items/WorkItemsTable";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";

export function WorkItemsList(props: {
  teamId: string;
  items: WorkItemRow[];
  title?: string;
  viewStartYmd: string;
  viewEndYmd: string;
  weeklyCapacityHours: number;
}) {
  const {
    teamId,
    items,
    title = "Committed work",
    viewStartYmd,
    viewEndYmd,
    weeklyCapacityHours,
  } = props;

  return (
    <WorkItemsTable
      teamId={teamId}
      items={items}
      viewStartYmd={viewStartYmd}
      viewEndYmd={viewEndYmd}
      weeklyCapacityHours={weeklyCapacityHours}
      title={title}
    />
  );
}
