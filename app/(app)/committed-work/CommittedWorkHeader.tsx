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
import { commitWork } from "@/app/(app)/evaluate/actions";
import { trackWorkItemAdded } from "@/lib/mixpanel";

export function CommittedWorkHeader() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function openSheet() {
    setSheetOpen(true);
    setError(null);
    setName("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    startTransition(async () => {
      try {
        const { id } = await commitWork({ name: name.trim() });
        trackWorkItemAdded({
          source: "committed_work",
          estimated_hours: 0,
          has_deadline: false,
          allocation_mode: "even",
        });
        setSheetOpen(false);
        router.push(`/committed-work?edit=${id}&stub=1`);
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
          <h1 className="text-2xl font-medium tracking-normal">
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
            <SheetTitle className="text-2xl font-medium">
              Add existing commitment
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              Name the project, then add phases with owners and dates so it
              counts toward capacity.
            </p>
          </SheetHeader>

          <form
            id="add-commitment-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
          >
            <div className="space-y-2">
              <Label htmlFor="add-name">Project name</Label>
              <Input
                id="add-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Add a title"
                autoComplete="off"
              />
            </div>
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
              {isPending ? "Adding…" : "Continue to phases"}
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
