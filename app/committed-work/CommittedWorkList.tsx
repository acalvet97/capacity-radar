"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { WorkItemCard } from "@/components/work-items/WorkItemCard";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";

export type SortKey = "deadline" | "hours";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "deadline", label: "Closest deadline first" },
  { value: "hours", label: "Most hours first" },
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

export function CommittedWorkList(props: {
  teamId: string;
  items: WorkItemRow[];
}) {
  const { teamId, items } = props;
  const [sortBy, setSortBy] = React.useState<SortKey>("deadline");

  const sorted = React.useMemo(
    () => sortItems(items, sortBy),
    [items, sortBy]
  );

  return (
    <Card className="rounded-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <h2 className="text-base font-semibold">Work items</h2>
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
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No committed work items.</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((it) => (
              <WorkItemCard key={it.id} teamId={teamId} item={it} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
