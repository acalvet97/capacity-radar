"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DailyHoursInputs } from "@/components/team/DailyHoursInputs";
import { UnconfirmedHoursHint } from "@/components/team/UnconfirmedHoursHint";
import {
  type DayKey,
  dailyHoursEqual,
  dailyHoursFromInputs,
  sanitizeDayHours,
  sumDailyHours,
  validateDailyHours,
} from "@/lib/dailyHours";
import { formatHoursForDisplay } from "@/lib/hours";
import { type MemberRow, newMemberRow, toMemberRows } from "@/lib/teamMemberRows";
import {
  updateTeamMembersHoursAction,
  createTeamMemberAction,
  deleteTeamMemberAction,
  type TeamMemberUpdate,
} from "@/app/actions/team";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { TeamMemberRow } from "@/lib/db/getTeamMembers";

export function TeamCapacitySection({
  teamId,
  initialMembers,
}: {
  teamId: string;
  initialMembers: TeamMemberRow[];
}) {
  const router = useRouter();
  const [members, setMembers] = React.useState<MemberRow[]>(() =>
    toMemberRows(initialMembers)
  );
  const [isPending, startTransition] = React.useTransition();
  const nextNewIdRef = React.useRef(0);

  React.useEffect(() => {
    setMembers(toMemberRows(initialMembers));
  }, [initialMembers]);

  const totalCapacity = React.useMemo(() => {
    return members.reduce(
      (sum, m) => sum + sumDailyHours(dailyHoursFromInputs(m.dailyHours)),
      0
    );
  }, [members]);

  const hasChanges = React.useMemo(() => {
    const existing = members.filter((m) => !m.isNew);
    const sameAsInitial =
      existing.length === initialMembers.length &&
      existing.every((m) => {
        const orig = initialMembers.find((x) => x.id === m.id);
        if (!orig) return false;
        return (
          (m.name ?? null) === (orig.name ?? null) &&
          dailyHoursEqual(dailyHoursFromInputs(m.dailyHours), orig.daily_hours)
        );
      });
    const hasNew = members.some((m) => m.isNew);
    const hasDeleted = initialMembers.length > existing.length;
    return !sameAsInitial || hasNew || hasDeleted;
  }, [members, initialMembers]);

  function handleNameChange(index: number, value: string) {
    setMembers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], name: value || null };
      return next;
    });
  }

  function handleDayChange(index: number, day: DayKey, raw: string) {
    setMembers((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        dailyHours: { ...next[index].dailyHours, [day]: raw },
      };
      return next;
    });
  }

  function handleDayBlur(index: number, day: DayKey) {
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
  }

  function handleAddMember() {
    setMembers((prev) => [...prev, newMemberRow(`new-${++nextNewIdRef.current}`)]);
  }

  function handleDelete(index: number) {
    const row = members[index];
    if (row.isNew) {
      setMembers((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    startTransition(async () => {
      const result = await deleteTeamMemberAction(teamId, row.id);
      if (result.ok) {
        setMembers((prev) => prev.filter((_, i) => i !== index));
        toast.success("Member removed.");
        router.refresh();
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

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!hasChanges || isPending) return;

    const existing = members.filter((m) => !m.isNew);
    const newRows = members.filter((m) => m.isNew);

    for (const row of members) {
      const hoursError = validateDailyHours(dailyHoursFromInputs(row.dailyHours));
      if (hoursError) {
        toast.error(hoursError);
        return;
      }
    }

    startTransition(async () => {
      const updates: TeamMemberUpdate[] = existing.map((m) => ({
        id: m.id,
        name: m.name ?? null,
        daily_hours: dailyHoursFromInputs(m.dailyHours),
      }));
      if (updates.length) {
        const res = await updateTeamMembersHoursAction(teamId, updates);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
      }
      for (const row of newRows) {
        const name = (row.name ?? "").trim() || "New member";
        const res = await createTeamMemberAction(
          teamId,
          name,
          dailyHoursFromInputs(row.dailyHours)
        );
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
      }
      toast.success("Team capacity updated.");
      router.refresh();
    });
  }

  return (
    <Card className="rounded-md">
      <CardHeader>
        <h2 className="text-base font-medium">Team Capacity</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Set how many hours each person works on each day of the week.
        </p>
      </CardHeader>
      <CardContent className="px-6">
        <form onSubmit={handleSave} className="space-y-4">
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
                        idPrefix={`member-${m.id}`}
                        value={m.dailyHours}
                        onChange={(day, raw) => handleDayChange(index, day, raw)}
                        onBlurDay={(day) => handleDayBlur(index, day)}
                        disabled={isPending}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(index)}
                        disabled={isPending}
                        aria-label="Remove member"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddMember}
              disabled={isPending}
            >
              <Plus className="size-4 mr-1" />
              Add member
            </Button>
            <p className="text-sm text-muted-foreground">
              Total weekly capacity:{" "}
              <span className="font-medium text-foreground">
                {formatHoursForDisplay(totalCapacity)}h
              </span>
            </p>
          </div>
          <Button type="submit" disabled={!hasChanges || isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
