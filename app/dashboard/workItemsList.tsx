"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { WorkItemCard } from "@/components/work-items/WorkItemCard";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";

export function WorkItemsList(props: {
  teamId: string;
  items: WorkItemRow[];
  title?: string;
}) {
  const { teamId, items, title = "Committed work" } = props;

  return (
    <Card className="rounded-md">
      <CardHeader>
        <h2 className="text-base font-semibold">{title}</h2>
      </CardHeader>

      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">None</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <WorkItemCard key={it.id} teamId={teamId} item={it} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
