"use client";

import { InfoTooltip } from "@/components/ui/InfoTooltip";

export function PeakLoadLabel() {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <p className="text-sm text-muted-foreground">Peak load</p>
      <InfoTooltip content="Highest weekly utilization in this window. Where your team is most constrained." />
    </div>
  );
}
