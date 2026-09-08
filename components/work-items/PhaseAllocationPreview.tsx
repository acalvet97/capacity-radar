"use client";

import { useState } from "react";
import { formatHoursForDisplay } from "@/lib/hours";
import { formatDateDMmm } from "@/lib/dates";
import type { FrontLoadAllocation } from "@/lib/phaseAllocation";

export function PhaseAllocationPreview({
  allocation,
}: {
  allocation: FrontLoadAllocation;
}) {
  const [open, setOpen] = useState(false);

  if (allocation.days.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        {open ? "Hide" : "See hours by day"}
      </button>
      {open ? (
        <ul className="mt-2 space-y-1 rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {allocation.days.map((day) => (
            <li key={day.date} className="flex justify-between gap-3">
              <span>{formatDateDMmm(day.date)}</span>
              <span>{formatHoursForDisplay(day.hours)}h</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
