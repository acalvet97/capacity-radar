"use client";

import * as React from "react";
import { CalendarIcon, X } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Parse a YYYY-MM-DD string to a Date (local time, no UTC shift). */
function ymdToDate(ymd: string): Date | undefined {
  if (!ymd) return undefined;
  const d = parse(ymd, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

/** Format a Date to a YYYY-MM-DD string. */
function dateToYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

type Props = {
  value: string; // YYYY-MM-DD or ""
  onChange: (value: string) => void; // YYYY-MM-DD or ""
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
};

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled = false,
  clearable = false,
  className,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const selected = ymdToDate(value);

  function handleSelect(date: Date | undefined) {
    onChange(date ? dateToYmd(date) : "");
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="size-4 shrink-0" />
          <span className="flex-1 truncate">
            {selected ? format(selected, "dd MMM yyyy") : placeholder}
          </span>
          {clearable && selected && (
            <span
              role="button"
              aria-label="Clear date"
              onClick={handleClear}
              className="ml-1 rounded-sm p-0.5 hover:bg-muted"
            >
              <X className="size-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected}
          captionLayout="dropdown"
        />
      </PopoverContent>
    </Popover>
  );
}
