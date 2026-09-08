"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createPhaseAction,
  deletePhaseAction,
  reorderPhasesAction,
  updatePhaseAction,
} from "@/app/actions/phases";
import type { WorkItemPhaseRow } from "@/lib/db/workItemPhases";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";
import {
  HOURS_STEP,
  formatHoursForDisplay,
  sanitizeHoursInput,
} from "@/lib/hours";
import { formatDateDMmm, formatDateDdMmYyyy } from "@/lib/dates";
import {
  computeFrontLoadAllocation,
  isStartAfterDeadline,
  resolvePhaseStartDate,
  type FrontLoadAllocation,
} from "@/lib/phaseAllocation";
import { PhaseAllocationPreview } from "@/components/work-items/PhaseAllocationPreview";

type PhaseDraft = {
  name: string;
  ownerMemberId: string;
  startDate: string;
  deadline: string;
  hours: string;
};

const EMPTY_DRAFT: PhaseDraft = {
  name: "",
  ownerMemberId: "",
  startDate: "",
  deadline: "",
  hours: "",
};

function draftFromPhase(phase: WorkItemPhaseRow): PhaseDraft {
  return {
    name: phase.name,
    ownerMemberId: phase.owner_member_id ?? "",
    startDate: phase.start_date ?? "",
    deadline: phase.deadline,
    hours: String(phase.estimated_hours),
  };
}

function memberLabel(member: TeamMemberRow): string {
  return member.name?.trim() || "Unnamed member";
}

function hoursFromDraft(hours: string): number {
  const raw = Number(hours);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return sanitizeHoursInput(hours);
}

type AllocationView = {
  owner: TeamMemberRow | null;
  resolvedStart: string | null;
  inferredStart: string | null;
  explicitInverted: boolean;
  inferredInverted: boolean;
  allocation: FrontLoadAllocation | null;
};

function allocationViewFor(input: {
  ownerMemberId: string;
  startDate: string;
  deadline: string;
  hours: number;
  previousDeadline: string | null;
  workItemStartDate: string;
  teamMembers: TeamMemberRow[];
}): AllocationView {
  const owner =
    input.teamMembers.find((member) => member.id === input.ownerMemberId) ??
    null;
  const explicit = input.startDate.trim();
  const inferredStart = resolvePhaseStartDate({
    startDate: null,
    previousDeadline: input.previousDeadline,
    workItemStartDate: input.workItemStartDate,
  });
  const resolvedStart = resolvePhaseStartDate({
    startDate: explicit || null,
    previousDeadline: input.previousDeadline,
    workItemStartDate: input.workItemStartDate,
  });
  const deadline = input.deadline.trim();
  const explicitInverted = Boolean(
    explicit && deadline && isStartAfterDeadline(explicit, deadline)
  );
  const inferredInverted = Boolean(
    !explicit &&
      resolvedStart &&
      deadline &&
      isStartAfterDeadline(resolvedStart, deadline)
  );

  let allocation: FrontLoadAllocation | null = null;
  if (
    owner &&
    resolvedStart &&
    deadline &&
    input.hours > 0 &&
    !explicitInverted &&
    !inferredInverted
  ) {
    allocation = computeFrontLoadAllocation({
      startDate: resolvedStart,
      deadline,
      totalHours: input.hours,
      dailyHours: owner.daily_hours,
    });
  }

  return {
    owner,
    resolvedStart,
    inferredStart,
    explicitInverted,
    inferredInverted,
    allocation,
  };
}

function PhaseAllocationNotes({
  view,
}: {
  view: AllocationView;
}) {
  if (!view.owner) {
    return (
      <p className="text-xs text-muted-foreground">
        Assign an owner to see how hours land.
      </p>
    );
  }

  if (view.inferredInverted) {
    return (
      <p className="text-xs text-muted-foreground">
        The inferred start is after this deadline, so hours can&apos;t be
        allocated. Set an explicit start date, or adjust the deadline.
      </p>
    );
  }

  if (!view.resolvedStart) {
    return (
      <p className="text-xs text-muted-foreground">
        Set a start date on this work item to see how hours land.
      </p>
    );
  }

  const ownerName = memberLabel(view.owner);

  return (
    <>
      {view.allocation?.overflow ? (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          This phase may not fit in the available time at {ownerName}&apos;s
          current pace
          {view.allocation.leftoverHours > 0
            ? ` (${formatHoursForDisplay(view.allocation.leftoverHours)}h would land after the deadline)`
            : ""}
          .
        </p>
      ) : null}
      {view.allocation ? (
        <PhaseAllocationPreview allocation={view.allocation} />
      ) : null}
    </>
  );
}

export type PhaseListProps = {
  workItemId: string;
  phases: WorkItemPhaseRow[];
  teamMembers: TeamMemberRow[];
  workItemStartDate: string;
  disabled?: boolean;
};

export function PhaseList({
  workItemId,
  phases,
  teamMembers,
  workItemStartDate,
  disabled = false,
}: PhaseListProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<PhaseDraft>(EMPTY_DRAFT);
  const [isAdding, setIsAdding] = React.useState(false);
  const [addDraft, setAddDraft] = React.useState<PhaseDraft>(EMPTY_DRAFT);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    React.useState<WorkItemPhaseRow | null>(null);

  const busy = disabled || isPending;
  const hasMembers = teamMembers.length > 0;

  function previousDeadlineAt(index: number | "new"): string | null {
    if (index === "new") {
      return phases[phases.length - 1]?.deadline ?? null;
    }
    return index > 0 ? phases[index - 1]?.deadline ?? null : null;
  }

  function ownerNameFor(phase: WorkItemPhaseRow): string {
    if (!phase.owner_member_id) return "Unassigned";
    const member = teamMembers.find((m) => m.id === phase.owner_member_id);
    return member ? memberLabel(member) : "Unassigned";
  }

  function beginEdit(phase: WorkItemPhaseRow) {
    setIsAdding(false);
    setErrorMessage(null);
    setEditingId(phase.id);
    setDraft(draftFromPhase(phase));
  }

  function beginAdd() {
    if (!hasMembers) return;
    setEditingId(null);
    setErrorMessage(null);
    setIsAdding(true);
    setAddDraft(EMPTY_DRAFT);
  }

  function validate(value: PhaseDraft): string | null {
    if (!hasMembers) return "Add a team member first.";
    if (!value.name.trim()) return "Phase name is required.";
    if (!value.ownerMemberId.trim()) return "Phase owner is required.";
    if (!value.deadline.trim()) return "Phase deadline is required.";
    if (sanitizeHoursInput(value.hours) <= 0) {
      return "Phase hours must be greater than 0.";
    }
    const start = value.startDate.trim();
    if (start && start > value.deadline.trim()) {
      return "Start date must be on or before the deadline.";
    }
    return null;
  }

  function handleAdd() {
    const problem = validate(addDraft);
    if (problem) {
      setErrorMessage(problem);
      return;
    }
    setErrorMessage(null);
    startTransition(async () => {
      const res = await createPhaseAction({
        workItemId,
        name: addDraft.name,
        deadline: addDraft.deadline,
        estimatedHours: sanitizeHoursInput(addDraft.hours),
        ownerMemberId: addDraft.ownerMemberId,
        startDate: addDraft.startDate.trim() || null,
      });
      if (!res.ok) {
        setErrorMessage(res.message);
        return;
      }
      setIsAdding(false);
      setAddDraft(EMPTY_DRAFT);
      router.refresh();
    });
  }

  function handleSave(phaseId: string) {
    const problem = validate(draft);
    if (problem) {
      setErrorMessage(problem);
      return;
    }
    setErrorMessage(null);
    startTransition(async () => {
      const res = await updatePhaseAction({
        phaseId,
        name: draft.name,
        deadline: draft.deadline,
        estimatedHours: sanitizeHoursInput(draft.hours),
        ownerMemberId: draft.ownerMemberId,
        startDate: draft.startDate.trim() || null,
      });
      if (!res.ok) {
        setErrorMessage(res.message);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(phase: WorkItemPhaseRow) {
    setPendingDelete(null);
    setErrorMessage(null);
    startTransition(async () => {
      const res = await deletePhaseAction({ phaseId: phase.id });
      if (!res.ok) {
        setErrorMessage(res.message);
        return;
      }
      if (res.revertedToManualHours) {
        toast.success("Back to a single estimate", {
          description:
            "This work item has no phases left, so you can edit its total hours directly again.",
        });
      }
      if (editingId === phase.id) setEditingId(null);
      router.refresh();
    });
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= phases.length) return;

    const reordered = [...phases];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];

    setErrorMessage(null);
    startTransition(async () => {
      const res = await reorderPhasesAction({
        workItemId,
        phaseIds: reordered.map((p) => p.id),
      });
      if (!res.ok) {
        setErrorMessage(res.message);
        return;
      }
      router.refresh();
    });
  }

  function renderFields(
    value: PhaseDraft,
    onChange: (next: PhaseDraft) => void,
    idPrefix: string,
    previousDeadline: string | null
  ) {
    const view = allocationViewFor({
      ownerMemberId: value.ownerMemberId,
      startDate: value.startDate,
      deadline: value.deadline,
      hours: hoursFromDraft(value.hours),
      previousDeadline,
      workItemStartDate,
      teamMembers,
    });

    const startHint = !value.startDate.trim() && view.inferredStart
      ? previousDeadline
        ? `Starts ${formatDateDMmm(view.inferredStart)} (day after previous phase)`
        : `Starts ${formatDateDMmm(view.inferredStart)} (with this work item)`
      : null;

    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-name`} className="text-xs">
            Phase name
          </Label>
          <Input
            id={`${idPrefix}-name`}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="E.g.: Content gathering"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Owner</Label>
          <Select
            value={value.ownerMemberId || undefined}
            onValueChange={(next) =>
              onChange({ ...value, ownerMemberId: next })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select owner" />
            </SelectTrigger>
            <SelectContent>
              {teamMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {memberLabel(member)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Start date</Label>
            <DatePicker
              value={value.startDate}
              onChange={(next) => onChange({ ...value, startDate: next })}
              placeholder="Inferred"
              clearable
            />
            {startHint ? (
              <p className="text-xs text-muted-foreground">{startHint}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Deadline</Label>
            <DatePicker
              value={value.deadline}
              onChange={(next) => onChange({ ...value, deadline: next })}
              placeholder="dd/mm/yyyy"
            />
          </div>
        </div>
        {view.explicitInverted ? (
          <p className="text-xs text-destructive" role="alert">
            Start date must be on or before the deadline.
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-hours`} className="text-xs">
            Hours
          </Label>
          <Input
            id={`${idPrefix}-hours`}
            type="number"
            min={HOURS_STEP}
            step={HOURS_STEP}
            inputMode="decimal"
            value={value.hours}
            onChange={(e) => onChange({ ...value, hours: e.target.value })}
            onBlur={() => {
              if (!value.hours.trim()) return;
              const sanitized = sanitizeHoursInput(value.hours);
              if (Number(value.hours) !== sanitized) {
                onChange({ ...value, hours: String(sanitized) });
              }
            }}
            placeholder="E.g.: 8"
          />
        </div>
        <PhaseAllocationNotes view={view} />
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Phases</h3>
          <p className="text-xs text-muted-foreground">
            Break the work into stages so the hours land where the work actually
            happens.
          </p>
        </div>
        {phases.length > 0 && !isAdding ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !hasMembers}
            onClick={beginAdd}
          >
            <Plus className="size-4" />
            Add phase
          </Button>
        ) : null}
      </div>

      {phases.length === 0 && !isAdding ? (
        <div className="rounded-md border border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground">
            This work item uses a single estimate.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={busy || !hasMembers}
            onClick={beginAdd}
          >
            <Plus className="size-4" />
            Break this into phases
          </Button>
          {!hasMembers ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Add a team member first.
            </p>
          ) : null}
        </div>
      ) : null}

      {phases.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {phases.map((phase, index) => {
            const isEditing = editingId === phase.id;
            const savedView = allocationViewFor({
              ownerMemberId: phase.owner_member_id ?? "",
              startDate: phase.start_date ?? "",
              deadline: phase.deadline,
              hours: phase.estimated_hours,
              previousDeadline: previousDeadlineAt(index),
              workItemStartDate,
              teamMembers,
            });
            const spanLabel =
              savedView.resolvedStart && !savedView.inferredInverted
                ? `${formatDateDMmm(savedView.resolvedStart)} – ${formatDateDMmm(phase.deadline)}`
                : formatDateDdMmYyyy(phase.deadline);

            return (
              <li key={phase.id} className="p-3">
                {isEditing ? (
                  <div className="space-y-3">
                    {renderFields(
                      draft,
                      setDraft,
                      `phase-${phase.id}`,
                      previousDeadlineAt(index)
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => handleSave(phase.id)}
                      >
                        Save phase
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          <span className="mr-2 text-muted-foreground">
                            {index + 1}.
                          </span>
                          {phase.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {ownerNameFor(phase)} · {spanLabel} ·{" "}
                          {formatHoursForDisplay(phase.estimated_hours)}h
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-foreground"
                          disabled={busy || index === 0}
                          onClick={() => handleMove(index, -1)}
                          aria-label={`Move ${phase.name} earlier`}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-foreground"
                          disabled={busy || index === phases.length - 1}
                          onClick={() => handleMove(index, 1)}
                          aria-label={`Move ${phase.name} later`}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-foreground"
                          disabled={busy}
                          onClick={() => beginEdit(phase)}
                          aria-label={`Edit ${phase.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          onClick={() => setPendingDelete(phase)}
                          aria-label={`Delete ${phase.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <PhaseAllocationNotes view={savedView} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {isAdding ? (
        <div className="space-y-3 rounded-md border bg-muted/20 p-3">
          {renderFields(
            addDraft,
            setAddDraft,
            "phase-new",
            previousDeadlineAt("new")
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setIsAdding(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={handleAdd}
            >
              Add phase
            </Button>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete?.name ?? "this phase"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `This removes ${formatHoursForDisplay(
                    pendingDelete.estimated_hours
                  )}h from the work item's total.${
                    phases.length === 1
                      ? " It is the last phase, so the work item goes back to a single editable estimate."
                      : ""
                  }`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep phase</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && handleDelete(pendingDelete)}
            >
              Delete phase
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
