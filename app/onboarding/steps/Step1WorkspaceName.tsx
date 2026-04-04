"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateWorkspaceNameAction } from "@/app/actions/onboarding";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

type Props = {
  initialName: string;
  onContinue: () => void;
};

export function Step1WorkspaceName({ initialName, onContinue }: Props) {
  const [name, setName] = React.useState(initialName);
  const [isPending, startTransition] = React.useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Please enter a team name.");
      return;
    }

    startTransition(async () => {
      const result = await updateWorkspaceNameAction(trimmed);
      if (result.ok) {
        onContinue();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to klira</h1>
        <p className="text-muted-foreground">
          Let&apos;s get your workspace set up. This takes about 2 minutes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="team-name" className="text-base font-medium">
            What&apos;s your team called?
          </Label>
          <Input
            id="team-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Design Studio, Product Team"
            className="max-w-sm"
            disabled={isPending}
            autoFocus
          />
        </div>

        <Button type="submit" disabled={isPending || !name.trim()} className="rounded-md">
          {isPending ? "Saving…" : "Continue"}
          {!isPending && <ArrowRight className="size-4" />}
        </Button>
      </form>
    </div>
  );
}
