"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { commitWork } from "@/app/evaluate/actions";
import { sanitizeHoursInput } from "@/lib/hours";

export function CommittedWorkHeader() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [estimatedHours, setEstimatedHours] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function openSheet() {
    setSheetOpen(true);
    setError(null);
    setName("");
    setStartDate("");
    setDeadline("");
    setEstimatedHours("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const hours = sanitizeHoursInput(estimatedHours);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (hours <= 0) {
      setError("Estimated hours must be greater than 0.");
      return;
    }
    if (!startDate.trim()) {
      setError("Start date is required.");
      return;
    }
    startTransition(async () => {
      try {
        await commitWork({
          name: name.trim(),
          totalHours: hours,
          startYmd: startDate.trim(),
          deadlineYmd: deadline.trim() || undefined,
        });
        setSheetOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <>
      <header className="mb-8 flex flex-row items-end justify-between gap-6 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            Committed Work
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All work items for your team. Sort by closest deadline or by amount
            of hours.
          </p>
        </div>
        <div className="flex shrink-0 flex-row items-center gap-2">
          <Button size="lg" className="py-3" asChild>
            <Link href="/evaluate">Evaluate new work</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="py-3"
            onClick={openSheet}
          >
            Add existing commitment
          </Button>
        </div>
      </header>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="flex h-full flex-col gap-0 overflow-hidden sm:max-w-md"
        >
          <SheetHeader className="shrink-0">
            <SheetTitle>Add existing commitment</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <form
              id="add-commitment-form"
              onSubmit={handleSubmit}
              className="flex flex-col gap-4 px-4 py-4"
            >
              <div className="space-y-2">
                <Label htmlFor="add-name">Name</Label>
<Input
                id="add-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Work item name"
                autoComplete="off"
                className="scroll-mt-4 scroll-mb-4"
              />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-start">Start date</Label>
<Input
                id="add-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="scroll-mt-4 scroll-mb-4"
              />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-deadline">Deadline (optional)</Label>
<Input
                id="add-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="scroll-mt-4 scroll-mb-4"
              />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-hours">Estimated hours</Label>
                <Input
                  id="add-hours"
                  type="number"
                  min={0.5}
                  step={0.5}
                  inputMode="decimal"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  onBlur={() => {
                    const sanitized = sanitizeHoursInput(estimatedHours);
                    if (Number(estimatedHours) !== sanitized) {
                      setEstimatedHours(String(sanitized));
                    }
                  }}
                  placeholder="e.g. 40"
                  className="scroll-mt-4 scroll-mb-4"
                />
              </div>
              <div className="min-h-[1.25rem]" role="alert" aria-live="polite">
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : null}
              </div>
            </form>
          </div>
          <SheetFooter className="shrink-0 border-t border-border px-4 py-4">
            <Button
              type="submit"
              form="add-commitment-form"
              disabled={isPending}
              size="lg"
              className="py-3"
            >
              {isPending ? "Adding…" : "Add commitment"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
