"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { commitWork } from "@/app/(app)/evaluate/actions";
import { sanitizeHoursInput } from "@/lib/hours";
import { CommitmentAllocationFieldset } from "@/components/committed-work/CommitmentAllocationFieldset";

export function CommittedWorkHeader() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [estimatedHours, setEstimatedHours] = React.useState("");
  const [allocationMode, setAllocationMode] = React.useState<"fill_capacity" | "even">("even");
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function openSheet() {
    setSheetOpen(true);
    setError(null);
    setName("");
    setStartDate("");
    setDeadline("");
    setEstimatedHours("");
    setAllocationMode("even");
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
          allocationMode,
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
          side="bottom"
          className="left-auto right-8 w-full max-w-lg rounded-t-xl p-16 gap-0"
        >
          <SheetHeader className="p-0 pb-12">
            <SheetTitle className="text-2xl font-medium">Add existing commitment</SheetTitle>
            <p className="text-sm text-muted-foreground">
              Log work your team is already committed to. No capacity analysis — just a straight addition to the pipeline.
            </p>
          </SheetHeader>

          <form
            id="add-commitment-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
          >
            <div className="space-y-2">
              <Label htmlFor="add-name">Commitment title</Label>
              <Input
                id="add-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Add a title"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-hours">Expected total hours</Label>
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
                placeholder="E.g.: 40"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start date</Label>
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="dd/mm/yyyy"
                />
              </div>
              <div className="space-y-2">
                <Label>Deadline</Label>
                <DatePicker
                  value={deadline}
                  onChange={setDeadline}
                  placeholder="dd/mm/yyyy"
                  clearable
                />
              </div>
            </div>
            <CommitmentAllocationFieldset
              idPrefix="sheet-add-commitment"
              value={allocationMode}
              onChange={setAllocationMode}
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </form>

          <SheetFooter className="flex flex-col gap-3 pt-12 px-0 pb-0">
            <Button
              type="submit"
              form="add-commitment-form"
              disabled={isPending}
              size="lg"
              className="w-full"
            >
              {isPending ? "Adding…" : "Fast commit"}
            </Button>
            <Link
              href="/evaluate"
              className="text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
            >
              Evaluate work before committing
            </Link>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
