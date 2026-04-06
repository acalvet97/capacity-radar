"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";

type Mode = "even" | "fill_capacity";

const OPTIONS = [
  { value: "even" as const, label: "Evenly distributed", disabled: false },
  {
    value: "fill_capacity" as const,
    label: "Fill any time gap available",
    disabled: true,
  },
];

/**
 * Allocation choice for “add / commit existing work” flows.
 * Only evenly distributed is available; fill-capacity is shown as coming soon.
 */
export function CommitmentAllocationFieldset({
  value,
  onChange,
  idPrefix = "commit-alloc",
}: {
  value: Mode;
  onChange: (mode: Mode) => void;
  /** Prefix for button a11y / keys when multiple instances exist on a page */
  idPrefix?: string;
}) {
  const effective: Mode = value === "fill_capacity" ? "even" : value;

  return (
    <div className="space-y-2">
      <Label>Allocation mode</Label>
      <div className="flex flex-col gap-2">
        {OPTIONS.map(({ value: optionValue, label, disabled }) => {
          const selected = effective === optionValue;
          return (
            <button
              key={optionValue}
              id={`${idPrefix}-${optionValue}`}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange(optionValue)}
              className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm transition-colors text-left ${
                disabled
                  ? "border-input opacity-50 cursor-not-allowed"
                  : selected
                    ? "border-foreground"
                    : "border-input hover:border-muted-foreground"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                  selected ? "border-foreground bg-foreground text-background" : "border-input"
                }`}
              >
                {selected && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="flex-1">{label}</span>
              {disabled && (
                <span className="ml-auto text-[10px] font-medium tracking-wide uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Coming soon
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
