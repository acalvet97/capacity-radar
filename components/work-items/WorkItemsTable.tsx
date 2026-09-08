"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { deleteWorkItemAction } from "@/app/actions/workItems";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { WorkItemEditSheet } from "@/components/work-items/WorkItemEditSheet";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";
import type { PhaseDraft } from "@/components/work-items/PhaseList";
import { formatDateDdMmYyyy } from "@/lib/dates";
import {
  weeklyLoadInWindow,
  pctWeeklyCapacity,
  impactFromPct,
  IMPACT_LABELS,
  IMPACT_BADGE_STYLES,
} from "@/lib/workItemTableUtils";
import { formatHoursForDisplay } from "@/lib/hours";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return formatDateDdMmYyyy(dateStr);
}

export type WorkItemsTableProps = {
  teamId: string;
  items: WorkItemRow[];
  teamMembers: TeamMemberRow[];
  /** Full team list for stacking; defaults to `items`. */
  allWorkItems?: WorkItemRow[];
  viewStartYmd: string;
  viewEndYmd: string;
  weeklyCapacityHours: number;
  title?: string;
  openItemId?: string | null;
  deleteIfEmptyOnClose?: boolean;
  initialAddDraft?: PhaseDraft;
  onEditorClosed?: () => void;
};

export function WorkItemsTable({
  teamId,
  items,
  teamMembers,
  allWorkItems,
  viewStartYmd,
  viewEndYmd,
  weeklyCapacityHours,
  title = "Work items",
  openItemId = null,
  deleteIfEmptyOnClose = false,
  initialAddDraft,
  onEditorClosed,
}: WorkItemsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [editing, setEditing] = React.useState<WorkItemRow | null>(null);
  const stackingItems = allWorkItems ?? items;

  React.useEffect(() => {
    if (!openItemId) return;
    const found =
      stackingItems.find((item) => item.id === openItemId) ??
      items.find((item) => item.id === openItemId) ??
      null;
    if (found) setEditing(found);
  }, [openItemId, stackingItems, items]);

  // Prefer the row from the latest props so the open sheet picks up phase
  // changes after a refresh, falling back to the row as it was when opened.
  // Dashboard only passes the top 5 by hours, so editing phases can push an
  // item out of the list -- keep the sheet open instead of letting it vanish.
  const editingItem = editing
    ? (stackingItems.find((item) => item.id === editing.id) ??
      items.find((item) => item.id === editing.id) ??
      editing)
    : null;

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

  return (
    <div className="rounded-md border">
      {title ? (
        <div className="border-b bg-muted/30 px-3 py-2">
          <h2 className="text-base font-medium">{title}</h2>
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
              <TableHead className="text-right">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help">Weekly Load</span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Hours/week using even spread of this item&apos;s total across ISO weeks from start to deadline. The dashboard bars use stacked daily hours instead.
                  </TooltipContent>
                </Tooltip>
              </TableHead>
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
              const phaseCount = item.phases.length;

              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{displayName}</TableCell>
                  <TableCell className="text-right">
                    {formatHoursForDisplay(item.estimated_hours)}h
                    {phaseCount > 0 ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {phaseCount} {phaseCount === 1 ? "phase" : "phases"}
                      </span>
                    ) : null}
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                        disabled={isPending}
                        onClick={() => setEditing(item)}
                        aria-label="Edit work item"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={isPending}
                        onClick={() => onDelete(item)}
                        aria-label="Delete work item"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {editingItem ? (
        <WorkItemEditSheet
          key={editingItem.id}
          teamId={teamId}
          item={editingItem}
          teamMembers={teamMembers}
          allWorkItems={stackingItems}
          open
          deleteIfEmptyOnClose={
            deleteIfEmptyOnClose && editingItem.id === openItemId
          }
          initialAddDraft={
            editingItem.id === openItemId ? initialAddDraft : undefined
          }
          onOpenChange={(next) => {
            if (!next) {
              setEditing(null);
              onEditorClosed?.();
            }
          }}
        />
      ) : null}
    </div>
  );
}
