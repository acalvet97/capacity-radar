"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { deleteWorkItemAction, updateWorkItemAction } from "@/app/actions/workItems";
import { Input } from "@/components/ui/input";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import { formatDateDdMmYyyy } from "@/lib/dates";
import { sanitizeHoursInput, formatHoursForDisplay } from "@/lib/hours";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return formatDateDdMmYyyy(dateStr);
}

export function WorkItemCard(props: { teamId: string; item: WorkItemRow }) {
  const { teamId, item } = props;
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftName, setDraftName] = React.useState(item.name ?? "");
  const [draftHours, setDraftHours] = React.useState(String(item.estimated_hours ?? ""));
  const [draftStart, setDraftStart] = React.useState(item.start_date ?? "");
  const [draftDeadline, setDraftDeadline] = React.useState(item.deadline ?? "");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const displayName = (item.name ?? "").trim() || `Work item #${item.id.slice(0, 8)}`;

  function onDelete() {
    const ok = window.confirm("Delete this work item?");
    if (!ok) return;

    startTransition(async () => {
      try {
        const res = await deleteWorkItemAction({ teamId, workItemId: item.id });
        if (!res || !res.ok) {
          window.alert(res?.message ?? "Delete failed");
          return;
        }
        router.refresh();
      } catch (err: unknown) {
        console.error("deleteWorkItemAction error", err);
        window.alert(err instanceof Error ? err.message : "Delete failed (unexpected error)");
      }
    });
  }

  function beginEdit() {
    setDraftName(item.name ?? "");
    setDraftHours(String(item.estimated_hours ?? ""));
    setDraftStart(item.start_date ?? "");
    setDraftDeadline(item.deadline ?? "");
    setErrorMessage(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setErrorMessage(null);
  }

  function onSubmitEdit() {
    setErrorMessage(null);

    const parsedHours = sanitizeHoursInput(draftHours);
    if (parsedHours <= 0) {
      setErrorMessage("Estimated hours must be greater than 0.");
      return;
    }

    setDraftHours(String(parsedHours));
    startTransition(async () => {
      try {
        const res = await updateWorkItemAction({
          teamId,
          workItemId: item.id,
          name: draftName,
          estimatedHours: parsedHours,
          startDate: draftStart,
          deadline: draftDeadline || null,
        });

        if (!res.ok) {
          setErrorMessage(res.message ?? "Update failed.");
          return;
        }

        setIsEditing(false);
        router.refresh();
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Update failed (unexpected error).");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      {!isEditing ? (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-medium truncate">{displayName}</div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {formatHoursForDisplay(item.estimated_hours)}h
              </span>
              {item.start_date && item.deadline ? (
                <>
                  {" "}
                  · {formatDate(item.start_date)} → {formatDate(item.deadline)}
                </>
              ) : item.start_date ? (
                <>
                  {" "}
                  · starts {formatDate(item.start_date)}
                </>
              ) : item.deadline ? (
                <>
                  {" "}
                  · deadline {formatDate(item.deadline)}
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={beginEdit}
              className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={onDelete}
              className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm font-medium">Edit {displayName}</div>
          <div className="grid gap-2 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Name</span>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Estimated hours</span>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                inputMode="decimal"
                value={draftHours}
                onChange={(e) => setDraftHours(e.target.value)}
                onBlur={() => {
                  const sanitized = sanitizeHoursInput(draftHours);
                  if (Number(draftHours) !== sanitized) {
                    setDraftHours(String(sanitized));
                  }
                }}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Start date</span>
              <Input
                type="date"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Deadline (optional)</span>
              <Input
                type="date"
                value={draftDeadline}
                onChange={(e) => setDraftDeadline(e.target.value)}
              />
            </label>
          </div>

          {errorMessage ? (
            <p className="text-xs text-rose-600">{errorMessage}</p>
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
              onClick={onSubmitEdit}
              disabled={isPending}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
