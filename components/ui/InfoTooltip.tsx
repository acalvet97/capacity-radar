"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function InfoTooltip({ content }: { content: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-4 shrink-0 rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="More info"
        >
          <Info className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px]">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
