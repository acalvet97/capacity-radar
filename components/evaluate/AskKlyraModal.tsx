"use client";

import * as React from "react";
import { Maximize2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { DashboardSnapshot } from "@/lib/dashboardEngine";
import { EvaluateClient } from "@/components/evaluate/EvaluateClient";
import { useAskKlyra } from "@/context/AskKlyraContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AskKlyraModalProps {
  onClose: () => void;
  snapshot: DashboardSnapshot;
  todayYmd: string;
  displayName: string;
}

export function AskKlyraModal({
  onClose,
  snapshot,
  todayYmd,
  displayName,
}: AskKlyraModalProps) {
  const router = useRouter();
  const { isResponding } = useAskKlyra();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  React.useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleExpand = () => {
    onClose();
    router.push("/evaluate");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-2xl mx-4 bg-background rounded-xl border shadow-xl flex flex-col overflow-hidden"
        style={{ height: "70vh" }}
        role="dialog"
        aria-modal="true"
        aria-label="Ask Klyra"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
          <span className="text-sm font-medium">Ask Klyra</span>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleExpand}
                  disabled={isResponding}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Open full view"
                >
                  <Maximize2 className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open full view</TooltipContent>
            </Tooltip>

            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        <EvaluateClient
          snapshot={snapshot}
          todayYmd={todayYmd}
          displayName={displayName}
        />
      </div>
    </div>
  );
}
