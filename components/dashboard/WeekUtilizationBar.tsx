"use client";

import { exposureBucketFromUtilization } from "@/lib/dashboardEngine";
import { EXPOSURE_BAR_FILL } from "@/lib/dashboardConstants";

type Props = {
  capacityHours: number;
  committedHours: number;
  bufferHoursPerWeek?: number;
};

/**
 * Single responsibility: render a utilization bar (buffer + work by exposure bucket).
 * Used on Dashboard and Evaluate for consistent styling (DRY).
 */
export function WeekUtilizationBar({
  capacityHours,
  committedHours,
  bufferHoursPerWeek = 0,
}: Props) {
  const utilization = Math.round((committedHours / capacityHours) * 100);
  const bucket = exposureBucketFromUtilization(utilization);
  const workHours = Math.max(0, committedHours - bufferHoursPerWeek);
  const bufferPct =
    capacityHours > 0 ? Math.min(100, (bufferHoursPerWeek / capacityHours) * 100) : 0;
  const workPct =
    capacityHours > 0
      ? Math.min(100 - bufferPct, (workHours / capacityHours) * 100)
      : Math.min(utilization, 100);

  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
      {bufferHoursPerWeek > 0 && bufferPct > 0 && (
        <div
          className="h-full bg-slate-400/40 shrink-0"
          style={{ width: `${bufferPct}%` }}
          title="Reserved capacity"
        />
      )}
      <div
        className={`h-full shrink-0 ${EXPOSURE_BAR_FILL[bucket]}`}
        style={{ width: `${workPct}%` }}
      />
    </div>
  );
}
