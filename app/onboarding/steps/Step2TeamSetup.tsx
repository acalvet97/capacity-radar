"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { HOURS_STEP, sanitizeHoursInputAllowZero, sanitizeHoursInput } from "@/lib/hours";
import { cycleToWeekly, weeklyToCycle } from "@/lib/capacityUnits";
import {
  updateTeamMembersHoursAction,
  createTeamMemberAction,
  deleteTeamMemberAction,
  updateReservedCapacityAction,
  type TeamMemberUpdate,
} from "@/app/actions/team";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";

type MemberRow = {
  id: string;
  name: string | null;
  hoursInput: string;
  isNew?: boolean;
};

function toMemberRows(rows: TeamMemberRow[]): MemberRow[] {
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    hoursInput: String(cycleToWeekly(m.hours_per_cycle)),
    isNew: false,
  }));
}

type Props = {
  teamId: string;
  initialMembers: TeamMemberRow[];
  initialBufferHoursPerWeek: number;
  initialWeeklyCapacity: number;
  onContinue: () => void;
};

export function Step2TeamSetup({
  teamId,
  initialMembers,
  initialBufferHoursPerWeek,
  initialWeeklyCapacity,
  onContinue,
}: Props) {
  const [members, setMembers] = React.useState<MemberRow[]>(() => toMemberRows(initialMembers));
  const [bufferEnabled, setBufferEnabled] = React.useState(initialBufferHoursPerWeek > 0);
  const [bufferInput, setBufferInput] = React.useState(
    initialBufferHoursPerWeek > 0 ? String(initialBufferHoursPerWeek) : ""
  );
  const [isPending, startTransition] = React.useTransition();
  const nextNewIdRef = React.useRef(0);

  const totalWeeklyHours = React.useMemo(
    () => members.reduce((sum, m) => sum + sanitizeHoursInputAllowZero(m.hoursInput), 0),
    [members]
  );

  const bufferHours = bufferEnabled ? sanitizeHoursInput(bufferInput) : 0;
  const usableCapacity = Math.max(0, totalWeeklyHours - bufferHours);

  const showNoMembersWarning = members.length === 0;

  function handleNameChange(index: number, value: string) {
    setMembers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], name: value || null };
      return next;
    });
  }

  function handleHoursChange(index: number, value: string) {
    setMembers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], hoursInput: value };
      return next;
    });
  }

  function handleHoursBlur(index: number) {
    setMembers((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        hoursInput: String(sanitizeHoursInputAllowZero(next[index].hoursInput)),
      };
      return next;
    });
  }

  function handleAddMember() {
    setMembers((prev) => [
      ...prev,
      { id: `new-${++nextNewIdRef.current}`, name: null, hoursInput: "40", isNew: true },
    ]);
  }

  function handleDeleteMember(index: number) {
    const row = members[index];
    if (row.isNew) {
      setMembers((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    startTransition(async () => {
      const result = await deleteTeamMemberAction(teamId, row.id);
      if (result.ok) {
        setMembers((prev) => prev.filter((_, i) => i !== index));
      } else {
        toast.error(result.message);
      }
    });
  }

  async function saveAllChanges() {
    const existingMembers = members.filter((m) => !m.isNew);
    const newMembers = members.filter((m) => m.isNew);

    if (existingMembers.length > 0) {
      const updates: TeamMemberUpdate[] = existingMembers.map((m) => ({
        id: m.id,
        name: m.name ?? null,
        hours_per_cycle: weeklyToCycle(sanitizeHoursInputAllowZero(m.hoursInput)),
      }));
      const res = await updateTeamMembersHoursAction(teamId, updates);
      if (!res.ok) throw new Error(res.message);
    }

    for (const row of newMembers) {
      const name = (row.name ?? "").trim() || "New member";
      const res = await createTeamMemberAction(
        teamId,
        name,
        weeklyToCycle(sanitizeHoursInputAllowZero(row.hoursInput))
      );
      if (!res.ok) throw new Error(res.message);
    }

    const bufferHoursToSave = bufferEnabled ? sanitizeHoursInput(bufferInput) : 0;
    const bufferRes = await updateReservedCapacityAction(
      teamId,
      bufferEnabled && bufferHoursToSave > 0,
      bufferHoursToSave
    );
    if (!bufferRes.ok) throw new Error(bufferRes.message);
  }

  function handleContinue() {
    startTransition(async () => {
      try {
        await saveAllChanges();
        onContinue();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save changes.");
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Set up your team</h1>
        <p className="text-muted-foreground">
          Add your team members and their weekly hours so Klyra can calculate capacity.
        </p>
      </div>

      {/* Member table */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Team members</h2>
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted">
                <th className="text-left font-medium px-3 py-2">Name</th>
                <th className="text-left font-medium px-3 py-2 w-[160px]">Hours / week</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {members.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-sm text-muted-foreground text-center">
                    No members yet — add one below
                  </td>
                </tr>
              )}
              {members.map((m, index) => (
                <tr key={m.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <Input
                      type="text"
                      value={m.name ?? ""}
                      onChange={(e) => handleNameChange(index, e.target.value)}
                      placeholder={`Member ${index + 1}`}
                      disabled={isPending}
                      className="h-8 max-w-[200px]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      step={HOURS_STEP}
                      inputMode="decimal"
                      value={m.hoursInput}
                      onChange={(e) => handleHoursChange(index, e.target.value)}
                      onBlur={() => handleHoursBlur(index)}
                      disabled={isPending}
                      className="max-w-[120px] h-8"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteMember(index)}
                      disabled={isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-md"
          onClick={handleAddMember}
          disabled={isPending}
        >
          <Plus className="size-4 mr-1" />
          Add member
        </Button>
      </div>

      {/* Buffer / reserved capacity */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Capacity buffer</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hours per week reserved for meetings, admin, and unplanned work.
            </p>
          </div>
          <Switch
            checked={bufferEnabled}
            onCheckedChange={(checked) => {
              setBufferEnabled(checked);
              if (!checked) setBufferInput("");
            }}
            disabled={isPending}
          />
        </div>
        {bufferEnabled && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Hours per week</Label>
            <Input
              type="number"
              min={HOURS_STEP}
              step={HOURS_STEP}
              inputMode="decimal"
              value={bufferInput}
              onChange={(e) => setBufferInput(e.target.value)}
              onBlur={() =>
                setBufferInput(String(sanitizeHoursInput(bufferInput)))
              }
              disabled={isPending}
              className="max-w-[120px]"
            />
          </div>
        )}
      </div>

      {/* Capacity summary */}
      <div className="rounded-md border bg-muted/40 p-4 space-y-1 font-mono text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total weekly hours</span>
          <span className="font-medium">{totalWeeklyHours}h</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Buffer</span>
          <span className="font-medium">− {bufferHours}h</span>
        </div>
        <div className="border-t border-border my-1" />
        <div className="flex justify-between">
          <span className="font-semibold text-foreground">Usable capacity</span>
          <span className="font-semibold text-foreground">{usableCapacity}h / week</span>
        </div>
      </div>

      {/* No members warning */}
      {showNoMembersWarning && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          You haven&apos;t added any team members yet. Klyra needs this to calculate capacity.
        </p>
      )}

      <Button
        onClick={handleContinue}
        disabled={isPending}
        className="rounded-md"
      >
        {isPending ? "Saving…" : "Continue"}
        {!isPending && <ArrowRight className="size-4" />}
      </Button>
    </div>
  );
}
