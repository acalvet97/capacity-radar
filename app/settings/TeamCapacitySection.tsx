"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HOURS_STEP, sanitizeHoursInputAllowZero } from "@/lib/hours";
import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import {
  updateTeamMembersHoursAction,
  createTeamMemberAction,
  deleteTeamMemberAction,
  type TeamMemberUpdate,
} from "@/app/actions/team";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
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
    hoursInput: String(m.hours_per_cycle),
    isNew: false,
  }));
}

export function TeamCapacitySection({ initialMembers }: { initialMembers: TeamMemberRow[] }) {
  const router = useRouter();
  const [members, setMembers] = React.useState<MemberRow[]>(() => toMemberRows(initialMembers));
  const [isPending, startTransition] = React.useTransition();
  const nextNewIdRef = React.useRef(0);

  const totalCapacity = React.useMemo(() => {
    return members.reduce((sum, m) => sum + sanitizeHoursInputAllowZero(m.hoursInput), 0);
  }, [members]);

  const hasChanges = React.useMemo(() => {
    const existing = members.filter((m) => !m.isNew);
    const updates: TeamMemberUpdate[] = existing.map((m) => ({
      id: m.id,
      name: m.name,
      hours_per_cycle: sanitizeHoursInputAllowZero(m.hoursInput),
    }));
    const sameAsInitial =
      existing.length === initialMembers.length &&
      updates.every((u) => {
        const orig = initialMembers.find((x) => x.id === u.id);
        return (
          orig &&
          (u.name ?? null) === (orig.name ?? null) &&
          u.hours_per_cycle === orig.hours_per_cycle
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

  function handleHoursBlur(index: number) {
    setMembers((prev) => {
      const next = [...prev];
      const sanitized = sanitizeHoursInputAllowZero(next[index].hoursInput);
      next[index] = { ...next[index], hoursInput: String(sanitized) };
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

  function handleAddMember() {
    setMembers((prev) => [
      ...prev,
      {
        id: `new-${++nextNewIdRef.current}`,
        name: null,
        hoursInput: "0",
        isNew: true,
      },
    ]);
  }

  function handleDelete(index: number) {
    const row = members[index];
    if (row.isNew) {
      setMembers((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    startTransition(async () => {
      const result = await deleteTeamMemberAction(MVP_TEAM_ID, row.id);
      if (result.ok) {
        setMembers((prev) => prev.filter((_, i) => i !== index));
        toast.success("Member removed.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!hasChanges || isPending) return;

    const existing = members.filter((m) => !m.isNew);
    const newRows = members.filter((m) => m.isNew);

    startTransition(async () => {
      const updates: TeamMemberUpdate[] = existing.map((m) => ({
        id: m.id,
        name: m.name ?? null,
        hours_per_cycle: sanitizeHoursInputAllowZero(m.hoursInput),
      }));
      if (updates.length) {
        const res = await updateTeamMembersHoursAction(MVP_TEAM_ID, updates);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
      }
      for (const row of newRows) {
        const name = (row.name ?? "").trim() || "New member";
        const hours = sanitizeHoursInputAllowZero(row.hoursInput);
        const res = await createTeamMemberAction(MVP_TEAM_ID, name, hours);
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
    <Card className="rounded-md max-w-2xl">
      <CardHeader>
        <h2 className="text-base font-semibold">Team Capacity</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define how much work this team can deliver per 4-week cycle. Weekly capacity is this total
          ÷ 4.
        </p>
      </CardHeader>
      <CardContent className="px-6">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium px-3 py-2">Name</th>
                  <th className="text-left font-medium px-3 py-2 w-[140px]">Hours per 4-week cycle</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
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
              className="rounded-md"
              onClick={handleAddMember}
              disabled={isPending}
            >
              <Plus className="size-4 mr-1" />
              Add member
            </Button>
            <p className="text-sm text-muted-foreground">
              Total capacity (4-week cycle):{" "}
              <span className="font-medium text-foreground">{totalCapacity}h</span>
            </p>
          </div>
          <Button
            type="submit"
            className="rounded-md"
            disabled={!hasChanges || isPending}
          >
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
