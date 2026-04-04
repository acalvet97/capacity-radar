"use client";

import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const PAGE_LABELS: Record<string, string> = {
  "/evaluate": "Ask Klyra",
  "/dashboard": "Dashboard",
  "/committed-work": "Workload",
  "/settings": "Settings",
  "/account": "Account",
};

export function TopBarBreadcrumbs({ teamName }: { teamName: string }) {
  const pathname = usePathname();
  const pageLabel = PAGE_LABELS[pathname] ?? null;

  return (
    <nav className="flex items-center gap-1.5 text-sm">
      <span className="font-medium text-foreground">{teamName}</span>
      {pageLabel && (
        <>
          <ChevronRight className="size-3.5 text-muted-foreground/60 shrink-0" />
          <span className="text-muted-foreground">{pageLabel}</span>
        </>
      )}
    </nav>
  );
}
