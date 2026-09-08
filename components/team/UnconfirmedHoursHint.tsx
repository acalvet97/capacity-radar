"use client";

import { Button } from "@/components/ui/button";

export function UnconfirmedHoursHint({
  disabled,
  onConfirm,
}: {
  disabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-1.5 max-w-[240px] space-y-1">
      <p className="text-xs text-muted-foreground">
        Estimated from weekly hours — confirm this is accurate
      </p>
      <Button
        type="button"
        variant="link"
        size="xs"
        className="h-auto p-0"
        onClick={onConfirm}
        disabled={disabled}
      >
        Confirm schedule
      </Button>
    </div>
  );
}
