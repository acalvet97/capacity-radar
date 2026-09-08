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
import { updateWorkItemAction } from "@/app/actions/workItems";
import { PhaseList } from "@/components/work-items/PhaseList";
import type { WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";
import {
  HOURS_STEP,
  formatHoursForDisplay,
  sanitizeHoursInput,
} from "@/lib/hours";
import { formatDateDdMmYyyy } from "@/lib/dates";

export type WorkItemEditSheetProps = {
  teamId: string;
  item: WorkItemRow;
  teamMembers: TeamMemberRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function WorkItemEditSheet({
  teamId,
  item,
  teamMembers,
  open,
  onOpenChange,
}: WorkItemEditSheetProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [draftName, setDraftName] = React.useState(item.name ?? "");
  const [draftHours, setDraftHours] = React.useState(
    String(item.estimated_hours ?? "")
  );
  const [draftStart, setDraftStart] = React.useState(item.start_date ?? "");
  const [draftDeadline, setDraftDeadline] = React.useState(item.deadline ?? "");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const hasPhases = item.phases.length > 0;
  const phaseTotal = item.phases.reduce(
    (sum, phase) => sum + phase.estimated_hours,
    0
  );

  // Deleting the last phase hands the total back to the user, so seed the input
  // with the total they just had rather than leaving a stale draft.
  const previouslyHadPhases = React.useRef(hasPhases);
  React.useEffect(() => {
    if (previouslyHadPhases.current && !hasPhases) {
      setDraftHours(String(item.estimated_hours));
    }
    previouslyHadPhases.current = hasPhases;
  }, [hasPhases, item.estimated_hours]);

  // The project deadline stays independent of phase deadlines, so a later phase
  // is a warning rather than a blocked save.
  const latePhases = draftDeadline
    ? item.phases.filter((phase) => phase.deadline > draftDeadline)
    : [];

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);

    if (!draftName.trim()) {
      setErrorMessage("Name is required.");
      return;
    }

    let estimatedHours: number | undefined;
    if (!hasPhases) {
      estimatedHours = sanitizeHoursInput(draftHours);
      if (estimatedHours <= 0) {
        setErrorMessage("Estimated hours must be greater than 0.");
        return;
      }
      setDraftHours(String(estimatedHours));
    }

    startTransition(async () => {
      try {
        const res = await updateWorkItemAction({
          teamId,
          workItemId: item.id,
          name: draftName,
          // Omitted when phases own the total; the action rejects it outright.
          estimatedHours,
          startDate: draftStart,
          deadline: draftDeadline || null,
        });
        if (!res.ok) {
          setErrorMessage(res.message ?? "Update failed.");
          return;
        }
        onOpenChange(false);
        router.refresh();
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  const displayName = (item.name ?? "").trim() || "work item";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="left-auto right-8 max-h-[92vh] w-full max-w-2xl gap-0 overflow-y-auto rounded-t-xl p-10"
      >
        <SheetHeader className="p-0 pb-8">
          <SheetTitle className="text-2xl font-medium">
            Edit {displayName}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            Update the commitment, or break it into phases so its hours reflect
            how the work actually runs.
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
            <Label htmlFor="edit-hours">
              {hasPhases ? "Total hours (from phases)" : "Expected total hours"}
            </Label>
            <Input
              id="edit-hours"
              type="number"
              min={HOURS_STEP}
              step={HOURS_STEP}
              inputMode="decimal"
              value={hasPhases ? formatHoursForDisplay(phaseTotal) : draftHours}
              disabled={hasPhases}
              onChange={(e) => setDraftHours(e.target.value)}
              onBlur={() => {
                if (hasPhases) return;
                const sanitized = sanitizeHoursInput(draftHours);
                if (Number(draftHours) !== sanitized) {
                  setDraftHours(String(sanitized));
                }
              }}
              placeholder="E.g.: 40"
            />
            {hasPhases ? (
              <p className="text-xs text-muted-foreground">
                Total: sum of {item.phases.length}{" "}
                {item.phases.length === 1 ? "phase" : "phases"}. Edit the phase
                hours below to change it.
              </p>
            ) : null}
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
          disabled={isPending}
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
