"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkItemsTable } from "@/components/work-items/WorkItemsTable";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import {
  weeklyLoadInWindow,
  pctWeeklyCapacity,
  impactFromPct,
  type ImpactLevel,
} from "@/lib/workItemTableUtils";

export type SortKey = "deadline" | "hours";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "deadline", label: "Closest deadline first" },
  { value: "hours", label: "Most hours first" },
];

const IMPACT_FILTER_OPTIONS: { value: "all" | ImpactLevel; label: string }[] = [
  { value: "all", label: "All impact levels" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function sortItems(items: WorkItemRow[], sortBy: SortKey): WorkItemRow[] {
  const copy = [...items];
  if (sortBy === "deadline") {
    copy.sort((a, b) => {
      const da = a.deadline ?? "";
      const db = b.deadline ?? "";
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
  } else {
    copy.sort((a, b) => b.estimated_hours - a.estimated_hours);
  }
  return copy;
}

function filterByImpact(
  items: WorkItemRow[],
  impactFilter: "all" | ImpactLevel,
  viewStartYmd: string,
  viewEndYmd: string,
  weeklyCapacityHours: number
): WorkItemRow[] {
  if (impactFilter === "all") return items;
  return items.filter((item) => {
    const weeklyLoad = weeklyLoadInWindow(item, viewStartYmd, viewEndYmd);
    const pct = pctWeeklyCapacity(weeklyLoad, weeklyCapacityHours);
    const impact = impactFromPct(pct);
    return impact === impactFilter;
  });
}

export function CommittedWorkList(props: {
  teamId: string;
  items: WorkItemRow[];
  viewStartYmd: string;
  viewEndYmd: string;
  weeklyCapacityHours: number;
}) {
  const {
    teamId,
    items,
    viewStartYmd,
    viewEndYmd,
    weeklyCapacityHours,
  } = props;
  const [sortBy, setSortBy] = React.useState<SortKey>("deadline");
  const [impactFilter, setImpactFilter] = React.useState<"all" | ImpactLevel>("all");

  const filtered = React.useMemo(
    () =>
      filterByImpact(
        items,
        impactFilter,
        viewStartYmd,
        viewEndYmd,
        weeklyCapacityHours
      ),
    [items, impactFilter, viewStartYmd, viewEndYmd, weeklyCapacityHours]
  );

  const sorted = React.useMemo(
    () => sortItems(filtered, sortBy),
    [filtered, sortBy]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between gap-4">
        <Select
          value={impactFilter}
          onValueChange={(v) => setImpactFilter(v as "all" | ImpactLevel)}
        >
          <SelectTrigger className="w-[200px]" size="default">
            <SelectValue placeholder="Filter by impact" />
          </SelectTrigger>
          <SelectContent>
            {IMPACT_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-row items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SortKey)}
          >
            <SelectTrigger className="w-[220px]" size="default">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
          </Select>
        </div>
      </div>
      <WorkItemsTable
        teamId={teamId}
        items={sorted}
        viewStartYmd={viewStartYmd}
        viewEndYmd={viewEndYmd}
        weeklyCapacityHours={weeklyCapacityHours}
        title=""
      />
    </div>
  );
}
