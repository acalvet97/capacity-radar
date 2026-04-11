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
      <div className="flex flex-col gap-4 sm:flex-row">
        {PROMPTS.map(({ title, description, iconName }) => {
          const Icon = PROMPT_ICON_MAP[iconName];
          return (
            <button
              key={title}
              type="button"
              onClick={() => onSelect(title, iconName)}
              className="flex flex-1 flex-col items-start rounded-lg border border-transparent bg-white px-4 py-3 text-left transition-colors hover:border-zinc-100 hover:bg-white dark:bg-white dark:hover:border-zinc-100 dark:hover:bg-white"
            >
              <Icon className="size-4 shrink-0 text-zinc-500" aria-hidden />
              <span className="mt-8 flex min-w-0 w-full flex-col gap-0.5 text-left">
                <span className="text-[0.875rem]! font-medium text-zinc-800">
                  {title}
                </span>
                <span className="text-[0.75rem]! leading-snug text-zinc-500">
                  {description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
