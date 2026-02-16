"use client";

import { CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

export function CardTitleWithTooltip({
  title,
  tooltip,
  className,
  as: Tag = "div",
}: {
  title: string;
  tooltip?: string;
  className?: string;
  as?: "div" | "h2";
}) {
  const content = (
    <div className="flex items-center gap-1.5">
      {Tag === "h2" ? (
        <h2 className={className ?? "text-base font-semibold"}>{title}</h2>
      ) : (
        <CardTitle className={className}>{title}</CardTitle>
      )}
      {tooltip && <InfoTooltip content={tooltip} />}
    </div>
  );
  return content;
}
