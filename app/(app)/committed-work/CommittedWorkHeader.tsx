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
          side="bottom"
          className="left-auto right-8 w-full max-w-md rounded-t-xl p-0 gap-0"
        >
          <SheetHeader className="px-6 pt-6 pb-2">
            <SheetTitle>Add existing commitment</SheetTitle>
          </SheetHeader>

          <form
            id="add-commitment-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 px-6 py-4"
          >
            <div className="space-y-2">
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Work item name"
                autoComplete="off"
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
              />
            </div>
            <div className="space-y-2">
              <Label>Start date</Label>
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder="Pick a start date"
              />
            </div>
            <div className="space-y-2">
              <Label>Deadline (optional)</Label>
              <DatePicker
                value={deadline}
                onChange={setDeadline}
                placeholder="No deadline"
                clearable
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </form>

          <SheetFooter className="px-6 pb-6 pt-2">
            <Button
              type="submit"
              form="add-commitment-form"
              disabled={isPending}
              size="lg"
              className="w-full"
            >
              {isPending ? "Adding…" : "Add commitment"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
