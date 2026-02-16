"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { deleteWorkItemAction, updateWorkItemAction } from "@/app/actions/workItems";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";

export function WorkItemsList(props: { teamId: string; items: WorkItemRow[] }) {
  const { teamId, items } = props;

  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState("");
  const [draftHours, setDraftHours] = React.useState("");
  const [draftStart, setDraftStart] = React.useState("");
  const [draftDeadline, setDraftDeadline] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

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

  function beginEdit(item: WorkItemRow) {
    setEditingId(item.id);
    setDraftName(item.name ?? "");
    setDraftHours(String(item.estimated_hours ?? ""));
    setDraftStart(item.start_date ?? "");
    setDraftDeadline(item.deadline ?? "");
    setErrorMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setErrorMessage(null);
  }

  function onSubmitEdit(workItemId: string) {
    setErrorMessage(null);

    const parsedHours = Number(draftHours);
    if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
      setErrorMessage("Estimated hours must be greater than 0.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await updateWorkItemAction({
          teamId,
          workItemId,
          name: draftName,
          estimatedHours: parsedHours,
          startDate: draftStart,
          deadline: draftDeadline || null,
        });

        if (!res.ok) {
          setErrorMessage(res.message ?? "Update failed.");
          return;
        }

        setEditingId(null);
        router.refresh();
      } catch (err: any) {
        setErrorMessage(err?.message ?? "Update failed (unexpected error).");
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
            {items.map((it) => {
              const isEditing = editingId === it.id;
              const displayName = (it.name ?? "").trim() || `Work item #${it.id.slice(0, 8)}`;

              return (
                <div
                  key={it.id}
                  className="space-y-2 rounded-xl border p-3"
                >
                  {!isEditing ? (
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {displayName}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {Math.round(it.estimated_hours)}h · start {formatDate(it.start_date)} ·
                          deadline {formatDate(it.deadline)} · created {formatDate(it.created_at)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => beginEdit(it)}
                          className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => onDelete(it.id)}
                          className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">
                        Edit {displayName}
                      </div>
                      <div className="grid gap-2 md:grid-cols-4">
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="text-muted-foreground">Name</span>
                          <input
                            className="rounded-md border px-2 py-1 text-sm"
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                          />
                        </label>

                        <label className="flex flex-col gap-1 text-xs">
                          <span className="text-muted-foreground">Estimated hours</span>
                          <input
                            className="rounded-md border px-2 py-1 text-sm"
                            inputMode="numeric"
                            value={draftHours}
                            onChange={(e) => setDraftHours(e.target.value)}
                          />
                        </label>

                        <label className="flex flex-col gap-1 text-xs">
                          <span className="text-muted-foreground">Start date</span>
                          <input
                            className="rounded-md border px-2 py-1 text-sm"
                            type="date"
                            value={draftStart}
                            onChange={(e) => setDraftStart(e.target.value)}
                          />
                        </label>

                        <label className="flex flex-col gap-1 text-xs">
                          <span className="text-muted-foreground">Deadline (optional)</span>
                          <input
                            className="rounded-md border px-2 py-1 text-sm"
                            type="date"
                            value={draftDeadline}
                            onChange={(e) => setDraftDeadline(e.target.value)}
                          />
                        </label>
                      </div>

                      {errorMessage ? (
                        <p className="text-xs text-red-600">{errorMessage}</p>
                      ) : null}

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
                          onClick={cancelEdit}
                          disabled={isPending}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
                          onClick={() => onSubmitEdit(it.id)}
                          disabled={isPending}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
