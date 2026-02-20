"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { HOURS_STEP, sanitizeHoursInput } from "@/lib/hours";
import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { updateReservedCapacityAction } from "@/app/actions/team";
import { toast } from "sonner";

type Props = {
  initialEnabled: boolean;
  initialHoursPerWeek: number;
  weeklyCapacity: number;
};

export function ReservedCapacitySection({
  initialEnabled,
  initialHoursPerWeek,
  weeklyCapacity,
}: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [hoursInput, setHoursInput] = React.useState(
    initialEnabled ? String(initialHoursPerWeek) : ""
  );
  const [isTogglePending, startToggleTransition] = React.useTransition();
  const [isHoursPending, startHoursTransition] = React.useTransition();
  const lastSavedHoursRef = React.useRef(initialEnabled ? initialHoursPerWeek : 0);

  const currentHours = React.useMemo(() => {
    if (!enabled) return 0;
    return sanitizeHoursInput(hoursInput);
  }, [enabled, hoursInput]);

  const hasHoursChanges =
    enabled &&
    Number.isFinite(sanitizeHoursInput(hoursInput)) &&
    sanitizeHoursInput(hoursInput) !== lastSavedHoursRef.current;

  function handleToggleChange(checked: boolean) {
    setEnabled(checked);
    if (!checked) {
      const h = sanitizeHoursInput(hoursInput);
      if (h > 0) lastSavedHoursRef.current = h;
      setHoursInput("");
    } else if (lastSavedHoursRef.current > 0) {
      setHoursInput(String(lastSavedHoursRef.current));
    }

    startToggleTransition(async () => {
      const result = await updateReservedCapacityAction(
        MVP_TEAM_ID,
        checked,
        checked && lastSavedHoursRef.current > 0 ? lastSavedHoursRef.current : 0
      );
      if (result.ok) {
        toast.success(checked ? "Reserved capacity enabled." : "Reserved capacity disabled.");
        router.refresh();
      } else {
        toast.error(result.message);
        setEnabled(!checked);
      }
    });
  }

  function handleHoursBlur() {
    const sanitized = sanitizeHoursInput(hoursInput);
    setHoursInput(String(sanitized));
  }

  function handleHoursSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!enabled || !hasHoursChanges || isHoursPending) return;

    const sanitized = sanitizeHoursInput(hoursInput);
    if (sanitized <= 0) {
      toast.error("Enter at least 0.5 hours.");
      return;
    }
    if (sanitized > weeklyCapacity) {
      toast.error(`Cannot exceed weekly capacity (${weeklyCapacity}h).`);
      return;
    }

    startHoursTransition(async () => {
      const result = await updateReservedCapacityAction(MVP_TEAM_ID, true, sanitized);
      if (result.ok) {
        lastSavedHoursRef.current = sanitized;
        toast.success("Reserved capacity hours updated.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  const maxHoursRounded = Math.round(weeklyCapacity * 2) / 2;

  return (
    <Card className="rounded-md max-w-2xl">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Reserved Capacity</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Weekly hours set aside for meetings, admin and unplanned work. These hours reduce
            available capacity.
          </p>
        </div>
        <Switch
          id="reserved-capacity-toggle"
          checked={enabled}
          onCheckedChange={handleToggleChange}
          disabled={isTogglePending}
          className="scale-125 shrink-0"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {enabled && (
          <form onSubmit={handleHoursSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reserved-capacity-hours">Hours per week</Label>
              <Input
                id="reserved-capacity-hours"
                type="number"
                min={HOURS_STEP}
                max={maxHoursRounded}
                step={HOURS_STEP}
                inputMode="decimal"
                value={hoursInput}
                onChange={(e) => setHoursInput(e.target.value)}
                onBlur={handleHoursBlur}
                disabled={isHoursPending}
                className="max-w-[120px]"
                required
              />
              <p className="text-xs text-muted-foreground">Max {maxHoursRounded}h (0.5 increments)</p>
            </div>
            <Button
              type="submit"
              className="rounded-md"
              disabled={!hasHoursChanges || isHoursPending}
            >
              {isHoursPending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
