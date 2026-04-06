"use client";

import { Scale, Activity, SlidersHorizontal, type LucideIcon } from "lucide-react";

export const PROMPT_ICON_MAP: Record<string, LucideIcon> = {
  Scale,
  Activity,
  SlidersHorizontal,
};

const PROMPTS: { title: string; description: string; iconName: string }[] = [
  {
    title: "Evaluate new work",
    description: "Can we take this on without overloading the team?",
    iconName: "Scale",
  },
  {
    title: "Check team health",
    description: "Where are we overcommitted and what's at risk?",
    iconName: "Activity",
  },
  {
    title: "Help me prioritise",
    description: "If we're stretched, what should we focus on and what can wait?",
    iconName: "SlidersHorizontal",
  },
];

export function SuggestedPrompts({
  onSelect,
}: {
  onSelect: (prompt: string, iconName: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 w-full max-w-3xl">
      <p className="text-xs text-muted-foreground">Get started with some examples</p>
      <div className="flex flex-col sm:flex-row gap-2.5">
        {PROMPTS.map(({ title, description, iconName }) => {
          const Icon = PROMPT_ICON_MAP[iconName];
          return (
            <button
              key={title}
              type="button"
              onClick={() => onSelect(title, iconName)}
              className="flex-1 rounded-xl border bg-background px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            >
              <Icon className="size-3.5 text-muted-foreground mb-5" />
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
