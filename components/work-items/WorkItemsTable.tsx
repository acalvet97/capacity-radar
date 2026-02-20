"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { deleteWorkItemAction, updateWorkItemAction } from "@/app/actions/workItems";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import { formatDateDdMmYyyy } from "@/lib/dates";
import {
  weeklyLoadInWindow,
  pctWeeklyCapacity,
  impactFromPct,
  IMPACT_LABELS,
  IMPACT_BADGE_STYLES,
} from "@/lib/workItemTableUtils";
import { sanitizeHoursInput, formatHoursForDisplay } from "@/lib/hours";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return formatDateDdMmYyyy(dateStr);
}

export type WorkItemsTableProps = {
  teamId: string;
  items: WorkItemRow[];
  viewStartYmd: string;
  viewEndYmd: string;
  weeklyCapacityHours: number;
  title?: string;
};

export function WorkItemsTable({
  teamId,
  items,
  viewStartYmd,
  viewEndYmd,
  weeklyCapacityHours,
  title = "Work items",
}: WorkItemsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState("");
  const [draftHours, setDraftHours] = React.useState("");
  const [draftStart, setDraftStart] = React.useState("");
  const [draftDeadline, setDraftDeadline] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  function onDelete(item: WorkItemRow) {
    const ok = window.confirm("Delete this work item?");
    if (!ok) return;
    startTransition(async () => {
      try {
        const res = await deleteWorkItemAction({ teamId, workItemId: item.id });
        if (!res?.ok) {
          window.alert(res?.message ?? "Delete failed");
          return;
        }
        router.refresh();
      } catch (err: unknown) {
        console.error("deleteWorkItemAction error", err);
        window.alert(err instanceof Error ? err.message : "Delete failed");
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
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  const buttonClass =
    "shrink-0 rounded-lg border px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="rounded-md border">
      {title ? (
        <div className="border-b bg-muted/30 px-3 py-2">
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No work items.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Total Hours</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead className="text-right">Weekly Load</TableHead>
              <TableHead className="text-right">% Weekly Capacity</TableHead>
              <TableHead>Impact</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const displayName =
                (item.name ?? "").trim() || `Work item #${item.id.slice(0, 8)}`;
              const weeklyLoad = weeklyLoadInWindow(
                item,
                viewStartYmd,
                viewEndYmd
              );
              const pct = pctWeeklyCapacity(weeklyLoad, weeklyCapacityHours);
              const impact = impactFromPct(pct);
              const isEditing = editingId === item.id;

              return (
                <React.Fragment key={item.id}>
                  <TableRow>
                    <TableCell className="font-medium">{displayName}</TableCell>
                    <TableCell className="text-right">
                      {formatHoursForDisplay(item.estimated_hours)}h
                    </TableCell>
                    <TableCell>{formatDate(item.start_date)}</TableCell>
                    <TableCell>{formatDate(item.deadline)}</TableCell>
                    <TableCell className="text-right">
                      {weeklyCapacityHours > 0
                        ? `${formatHoursForDisplay(weeklyLoad)}h`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {weeklyCapacityHours > 0
                        ? `${Math.round(pct * 10) / 10}%`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={IMPACT_BADGE_STYLES[impact]}
                      >
                        {IMPACT_LABELS[impact]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => beginEdit(item)}
                          className={buttonClass}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => onDelete(item)}
                          className={buttonClass}
                        >
                          Delete
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isEditing && (
                    <TableRow className="bg-muted/20">
                      <TableCell
                        colSpan={8}
                        className="p-4"
                      >
                        <div className="space-y-3">
                          <div className="text-sm font-medium">
                            Edit {displayName}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-4">
                            <label className="flex flex-col gap-1 text-xs">
                              <span className="text-muted-foreground">Name</span>
                              <Input
                                value={draftName}
                                onChange={(e) =>
                                  setDraftName(e.target.value)
                                }
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs">
                              <span className="text-muted-foreground">
                                Estimated hours
                              </span>
                              <Input
                                type="number"
                                min={0.5}
                                step={0.5}
                                inputMode="decimal"
                                value={draftHours}
                                onChange={(e) =>
                                  setDraftHours(e.target.value)
                                }
                                onBlur={() => {
                                  const sanitized = sanitizeHoursInput(draftHours);
                                  if (Number(draftHours) !== sanitized) {
                                    setDraftHours(String(sanitized));
                                  }
                                }}
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs">
                              <span className="text-muted-foreground">
                                Start date
                              </span>
                              <Input
                                type="date"
                                value={draftStart}
                                onChange={(e) =>
                                  setDraftStart(e.target.value)
                                }
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs">
                              <span className="text-muted-foreground">
                                Deadline (optional)
                              </span>
                              <Input
                                type="date"
                                value={draftDeadline}
                                onChange={(e) =>
                                  setDraftDeadline(e.target.value)
                                }
                              />
                            </label>
                          </div>
                          {errorMessage && (
                            <p className="text-xs text-rose-600">
                              {errorMessage}
                            </p>
                          )}
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className={buttonClass}
                              onClick={cancelEdit}
                              disabled={isPending}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className={buttonClass}
                              onClick={() => onSubmitEdit(item.id)}
                              disabled={isPending}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
