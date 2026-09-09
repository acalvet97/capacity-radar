"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatHoursForDisplay, HOURS_STEP } from "@/lib/hours";
import {
  ALL_ZERO_HOURS_MESSAGE,
  DAY_ARIA_LABELS,
  DAY_KEYS,
  DAY_LABELS,
  type DailyHoursInput,
  type DayKey,
  MAX_HOURS_PER_DAY,
  dailyHoursFromInputs,
  sumDailyHours,
} from "@/lib/dailyHours";

type Props = {
  /** Identifies which row a change belongs to, so callers can pass one stable
   *  handler for every row instead of a fresh closure per row. */
  rowIndex: number;
  value: DailyHoursInput;
  onChange: (rowIndex: number, day: DayKey, raw: string) => void;
  onBlurDay: (rowIndex: number, day: DayKey) => void;
  disabled?: boolean;
  idPrefix: string;
};

function DailyHoursInputsImpl({
  rowIndex,
  value,
  onChange,
  onBlurDay,
  disabled,
  idPrefix,
}: Props) {
  const weeklyTotal = sumDailyHours(dailyHoursFromInputs(value));
  const allZero = weeklyTotal <= 0;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end gap-1.5">
        {DAY_KEYS.map((day) => {
          const inputId = `${idPrefix}-${day}`;
          return (
            <div key={day} className="space-y-1">
              <label
                htmlFor={inputId}
                className="block text-xs text-muted-foreground text-center"
              >
                {DAY_LABELS[day]}
              </label>
              <Input
                id={inputId}
                type="number"
                min={0}
                max={MAX_HOURS_PER_DAY}
                step={HOURS_STEP}
                inputMode="decimal"
                value={value[day]}
                onChange={(e) => onChange(rowIndex, day, e.target.value)}
                onBlur={() => onBlurDay(rowIndex, day)}
                disabled={disabled}
                aria-label={`${DAY_ARIA_LABELS[day]} hours`}
                aria-invalid={allZero || undefined}
                className="h-8 w-14 px-1 text-center tabular-nums"
              />
            </div>
          );
        })}
        <div className="space-y-1 min-w-[3.5rem] pl-1">
          <p className="text-xs text-muted-foreground">Weekly</p>
          <p className="h-8 flex items-center text-sm font-medium tabular-nums">
            {formatHoursForDisplay(weeklyTotal)}h
          </p>
        </div>
      </div>
      {allZero ? (
        <p className="text-xs text-destructive">{ALL_ZERO_HOURS_MESSAGE}</p>
      ) : null}
    </div>
  );
}

/**
 * Memoized: members state lives at the section root, so without this one digit
 * typed in any row re-renders every member's seven inputs.
 */
export const DailyHoursInputs = React.memo(DailyHoursInputsImpl);
