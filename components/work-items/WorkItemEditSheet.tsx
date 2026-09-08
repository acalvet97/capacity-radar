"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  deleteWorkItemAction,
  updateWorkItemAction,
} from "@/app/actions/workItems";
import {
  PhaseList,
  type PhaseDraft,
} from "@/components/work-items/PhaseList";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";
import { formatHoursForDisplay } from "@/lib/hours";
import { formatDateDdMmYyyy } from "@/lib/dates";

export type WorkItemEditSheetProps = {
  teamId: string;
  item: WorkItemRow;
  teamMembers: TeamMemberRow[];
  allWorkItems: WorkItemRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deleteIfEmptyOnClose?: boolean;
  initialAddDraft?: PhaseDraft;
};

export function WorkItemEditSheet({
  teamId,
  item,
  teamMembers,
  allWorkItems,
  open,
  onOpenChange,
  deleteIfEmptyOnClose = false,
  initialAddDraft,
}: WorkItemEditSheetProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [draftName, setDraftName] = React.useState(item.name ?? "");
  const [draftStart, setDraftStart] = React.useState(item.start_date ?? "");
  const [draftDeadline, setDraftDeadline] = React.useState(item.deadline ?? "");
  const [keepAfterClose, setKeepAfterClose] = React.useState(
    item.phases.length > 0
  );
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (item.phases.length > 0) setKeepAfterClose(true);
  }, [item.phases.length]);

  const phaseTotal = item.phases.reduce(
    (sum, phase) => sum + phase.estimated_hours,
    0
  );

  const latePhases = draftDeadline
    ? item.phases.filter((phase) => phase.deadline > draftDeadline)
    : [];

  function handleOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (deleteIfEmptyOnClose && item.phases.length === 0 && !keepAfterClose) {
      startTransition(async () => {
        await deleteWorkItemAction({ teamId, workItemId: item.id });
        onOpenChange(false);
        router.refresh();
      });
      return;
    }
    onOpenChange(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);

    if (!draftName.trim()) {
      setErrorMessage("Name is required.");
      return;
    }

    if (deleteIfEmptyOnClose && item.phases.length === 0 && !keepAfterClose) {
      setErrorMessage("Add a phase before saving.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await updateWorkItemAction({
          teamId,
          workItemId: item.id,
          name: draftName,
          startDate: draftStart,
          deadline: draftDeadline || null,
        });
        if (!res.ok) {
          setErrorMessage(res.message ?? "Update failed.");
          return;
        }
        handleOpenChange(false);
        router.refresh();
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  const displayName = (item.name ?? "").trim() || "work item";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="left-auto right-8 max-h-[92vh] w-full max-w-2xl gap-0 overflow-y-auto rounded-t-xl p-10"
      >
        <SheetHeader className="p-0 pb-8">
          <SheetTitle className="text-2xl font-medium">
            Edit {displayName}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            Hours come from phases. Assign an owner and dates on each phase so
            capacity stacking can see the work.
          </p>
        </SheetHeader>

        <form
          id="edit-work-item-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <div className="space-y-2">
            <Label htmlFor="edit-name">Commitment title</Label>
            <Input
              id="edit-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Add a title"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-hours">Total hours (from phases)</Label>
            <Input
              id="edit-hours"
              value={formatHoursForDisplay(phaseTotal)}
              disabled
            />
            <p className="text-xs text-muted-foreground">
              {item.phases.length === 0
                ? "Add a phase below to set hours."
                : `Total: sum of ${item.phases.length} ${
                    item.phases.length === 1 ? "phase" : "phases"
                  }.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start date</Label>
              <DatePicker
                value={draftStart}
                onChange={setDraftStart}
                placeholder="dd/mm/yyyy"
              />
            </div>
            <div className="space-y-2">
              <Label>Deadline</Label>
              <DatePicker
                value={draftDeadline}
                onChange={setDraftDeadline}
                placeholder="No deadline"
                clearable
              />
            </div>
          </div>

          {latePhases.length > 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {latePhases.length === 1
                ? `"${latePhases[0].name}" is due after this deadline`
                : `${latePhases.length} phases are due after this deadline`}{" "}
              ({formatDateDdMmYyyy(draftDeadline)}). That is allowed — adjust
              the deadline if it should cover every phase.
            </p>
          ) : null}

          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </form>

        <Separator className="my-8" />

        <PhaseList
          workItemId={item.id}
          phases={item.phases}
          teamMembers={teamMembers}
          workItemStartDate={draftStart}
          allWorkItems={allWorkItems}
          disabled={isPending}
          initialAddDraft={initialAddDraft}
          onPhaseSaved={() => setKeepAfterClose(true)}
        />

        <SheetFooter className="flex flex-col gap-3 px-0 pt-10 pb-0">
          <Button
            type="submit"
            form="edit-work-item-form"
            disabled={isPending}
            size="lg"
            className="w-full"
          >
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
