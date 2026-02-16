"use client";

import { useState } from "react";

export function CollapsibleHelp({
  children,
  label = "What's this?",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        {open ? "Hide" : label}
      </button>
      {open && (
        <div className="mt-2 rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground [&_p+_p]:mt-2">
          {children}
        </div>
      )}
    </div>
  );
}
