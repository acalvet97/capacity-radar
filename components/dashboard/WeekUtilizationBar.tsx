"use client";

import { exposureBucketFromUtilization, EXPOSURE_BAR_FILL } from "@/lib/dashboardConstants";

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
  // Color is based on utilization of *available* capacity (total minus buffer)
  const utilization = capacityHours > 0 ? Math.round((committedHours / capacityHours) * 100) : 0;
  const bucket = exposureBucketFromUtilization(utilization);

  // Bar widths are relative to *total* capacity (available + buffer) so proportions are correct
  const totalCapacity = capacityHours + bufferHoursPerWeek;
  const bufferPct = totalCapacity > 0 ? (bufferHoursPerWeek / totalCapacity) * 100 : 0;
  const workPct =
    totalCapacity > 0
      ? Math.min(100 - bufferPct, (committedHours / totalCapacity) * 100)
      : 0;

  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
      {bufferHoursPerWeek > 0 && bufferPct > 0 && (
        <div
          className="h-full bg-zinc-400/40 shrink-0"
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
