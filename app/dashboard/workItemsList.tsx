"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { deleteWorkItemAction } from "@/app/actions/workItems";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";

export function WorkItemsList(props: { teamId: string; items: WorkItemRow[] }) {
  const { teamId, items } = props;

  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "—";
    // Works for ISO strings and "YYYY-MM-DD"
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString();
  }

  function onDelete(workItemId: string) {
    const ok = window.confirm("Delete this work item?");
    if (!ok) return;

    startTransition(async () => {
      try {
        console.log("calling deleteWorkItemAction", { teamId, workItemId });
        const res = await deleteWorkItemAction({ teamId, workItemId });
        console.log("deleteWorkItemAction result", res);
        if (!res || !res.ok) {
          window.alert(res?.message ?? "Delete failed");
          return;
        }
        // Refresh to update the UI after server-side deletion
        router.refresh();
      } catch (err: any) {
        // Surface unexpected errors to the developer/user
        // eslint-disable-next-line no-console
        console.error("deleteWorkItemAction error", err);
        window.alert(err?.message ?? "Delete failed (unexpected error)");
      }
    });
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Committed Work
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No committed work yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-4 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    Work item #{it.id.slice(0, 8)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {Math.round(it.estimated_hours)}h · start {formatDate(it.start_date)} · deadline{" "}
                    {formatDate(it.deadline)} · created {formatDate(it.created_at)}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onDelete(it.id)}
                  className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
