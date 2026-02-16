"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { updateBufferAction } from "@/app/actions/team";
import { toast } from "sonner";

type Props = {
  initialBuffer: number;
  weeklyCapacity: number;
};

export function BufferForm({ initialBuffer, weeklyCapacity }: Props) {
  const router = useRouter();
  const [buffer, setBuffer] = React.useState(String(initialBuffer));
  const [isPending, startTransition] = React.useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseInt(buffer, 10);
    if (!Number.isFinite(num) || num < 0) {
      toast.error("Enter a valid non-negative number.");
      return;
    }

    startTransition(async () => {
      const result = await updateBufferAction(MVP_TEAM_ID, num);
      if (result.ok) {
        toast.success("Buffer updated.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  const currentValue = parseInt(buffer, 10);
  const isIncreasing = Number.isFinite(currentValue) && currentValue > initialBuffer;

  return (
    <Card className="rounded-md max-w-md">
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-semibold">
            Buffer
          </h2>
          <InfoTooltip content="Weekly overhead (meetings/admin). Added on top of planned work to reflect reality." />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Weekly hours for untracked work (meetings, admin). Counts as committed.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="buffer">Buffer (hours/week)</Label>
            <Input
              id="buffer"
              type="number"
              min={0}
              max={weeklyCapacity}
              step={1}
              inputMode="numeric"
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              disabled={isPending}
              className="max-w-[120px]"
            />
            <p className="text-xs text-muted-foreground">
              Max {weeklyCapacity}h
            </p>
          </div>
          <Button type="submit" className="rounded-md" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
