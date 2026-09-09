"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { HOURS_STEP, sanitizeHoursInput, formatHoursForDisplay } from "@/lib/hours";
import { DailyHoursInputs } from "@/components/team/DailyHoursInputs";
import { UnconfirmedHoursHint } from "@/components/team/UnconfirmedHoursHint";
import {
  type DayKey,
  dailyHoursFromInputs,
  sanitizeDayHours,
  sumDailyHours,
  validateDailyHours,
} from "@/lib/dailyHours";
import { type MemberRow, newMemberRow, toMemberRows } from "@/lib/teamMemberRows";
import {
  updateTeamMembersHoursAction,
  createTeamMemberAction,
  deleteTeamMemberAction,
  updateReservedCapacityAction,
  type TeamMemberUpdate,
} from "@/app/actions/team";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";

type Props = {
  teamId: string;
  initialMembers: TeamMemberRow[];
  initialBufferHoursPerWeek: number;
  onContinue: () => void;
};

export function Step2TeamSetup({
  teamId,
  initialMembers,
  initialBufferHoursPerWeek,
  onContinue,
}: Props) {
  const [members, setMembers] = React.useState<MemberRow[]>(() =>
    toMemberRows(initialMembers)
  );
  const [bufferEnabled, setBufferEnabled] = React.useState(initialBufferHoursPerWeek > 0);
  const [bufferInput, setBufferInput] = React.useState(
    initialBufferHoursPerWeek > 0 ? String(initialBufferHoursPerWeek) : ""
  );
  const [isPending, startTransition] = React.useTransition();
  const nextNewIdRef = React.useRef(0);

  React.useEffect(() => {
    setMembers(toMemberRows(initialMembers));
  }, [initialMembers]);

  const totalWeeklyHours = React.useMemo(
    () =>
      members.reduce(
        (sum, m) => sum + sumDailyHours(dailyHoursFromInputs(m.dailyHours)),
        0
      ),
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

  // Functional setMembers means these never close over members, so they stay
  // stable for the life of the section and DailyHoursInputs' memo holds.
  const handleDayChange = React.useCallback((index: number, day: DayKey, raw: string) => {
    setMembers((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        dailyHours: { ...next[index].dailyHours, [day]: raw },
      };
      return next;
    });
  }, []);

  const handleDayBlur = React.useCallback((index: number, day: DayKey) => {
    setMembers((prev) => {
      const next = [...prev];
      const sanitized = formatHoursForDisplay(
        sanitizeDayHours(next[index].dailyHours[day])
      );
      next[index] = {
        ...next[index],
        dailyHours: { ...next[index].dailyHours, [day]: sanitized },
      };
      return next;
    });
  }, []);

  function handleAddMember() {
    setMembers((prev) => [...prev, newMemberRow(`new-${++nextNewIdRef.current}`)]);
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

  function handleConfirmSchedule(index: number) {
    const row = members[index];
    if (row.isNew || row.isDailyHoursConfirmed || isPending) return;

    const dailyHours = dailyHoursFromInputs(row.dailyHours);
    const hoursError = validateDailyHours(dailyHours);
    if (hoursError) {
      toast.error(hoursError);
      return;
    }

    startTransition(async () => {
      const res = await updateTeamMembersHoursAction(teamId, [
        {
          id: row.id,
          name: row.name ?? null,
          daily_hours: dailyHours,
          confirmDailyHours: true,
        },
      ]);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setMembers((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], isDailyHoursConfirmed: true };
        return next;
      });
      toast.success("Schedule confirmed.");
    });
  }

  async function saveAllChanges() {
    for (const row of members) {
      const hoursError = validateDailyHours(dailyHoursFromInputs(row.dailyHours));
      if (hoursError) {
        throw new Error(hoursError);
      }
    }

    const existingMembers = members.filter((m) => !m.isNew);
    const newMembers = members.filter((m) => m.isNew);

    if (existingMembers.length > 0) {
      const updates: TeamMemberUpdate[] = existingMembers.map((m) => ({
        id: m.id,
        name: m.name ?? null,
        daily_hours: dailyHoursFromInputs(m.dailyHours),
      }));
      const res = await updateTeamMembersHoursAction(teamId, updates);
      if (!res.ok) throw new Error(res.message);
    }

    for (const row of newMembers) {
      const name = (row.name ?? "").trim() || "New member";
      const res = await createTeamMemberAction(
        teamId,
        name,
        dailyHoursFromInputs(row.dailyHours)
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
        <h1 className="text-2xl font-medium tracking-tight">Set up your team</h1>
        <p className="text-muted-foreground">
          Add your team members and how many hours they work each day so Klira can
          calculate capacity.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Team members</h2>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted">
                <th className="text-left font-medium px-3 py-2 min-w-[180px]">Name</th>
                <th className="text-left font-medium px-3 py-2">Hours by day</th>
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
                <tr key={m.id} className="border-b last:border-b-0 align-top">
                  <td className="px-3 py-2">
                    <Input
                      type="text"
                      value={m.name ?? ""}
                      onChange={(e) => handleNameChange(index, e.target.value)}
                      placeholder={`Member ${index + 1}`}
                      disabled={isPending}
                      className="h-8 max-w-[200px]"
                    />
                    {!m.isNew && !m.isDailyHoursConfirmed ? (
                      <UnconfirmedHoursHint
                        disabled={isPending}
                        onConfirm={() => handleConfirmSchedule(index)}
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <DailyHoursInputs
                      rowIndex={index}
                      idPrefix={`onboarding-member-${m.id}`}
                      value={m.dailyHours}
                      onChange={handleDayChange}
                      onBlurDay={handleDayBlur}
                      disabled={isPending}
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

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">Capacity buffer</h2>
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

      <div className="rounded-md border bg-muted/40 p-4 space-y-1 font-mono text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total weekly hours</span>
          <span className="font-medium">{formatHoursForDisplay(totalWeeklyHours)}h</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Buffer</span>
          <span className="font-medium">− {bufferHours}h</span>
        </div>
        <div className="border-t border-border my-1" />
        <div className="flex justify-between">
          <span className="font-medium text-foreground">Usable capacity</span>
          <span className="font-medium text-foreground">
            {formatHoursForDisplay(usableCapacity)}h / week
          </span>
        </div>
      </div>

      {showNoMembersWarning && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          You haven&apos;t added any team members yet. Klira needs this to calculate capacity.
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
