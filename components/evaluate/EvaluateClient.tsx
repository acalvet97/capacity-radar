"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { CollapsibleHelp } from "@/components/ui/CollapsibleHelp";

import type { DashboardSnapshot } from "@/lib/dashboardEngine";
import { formatDateDdMmYyyy } from "@/lib/dates";
import { evaluateNewWork, type NewWorkInput } from "@/lib/evaluateEngine";
import { commitWork } from "@/app/evaluate/actions";

type Bucket = "low" | "medium" | "high";
type ViewKey = "month" | "4w" | "12w" | "quarter" | "6m";

const barFill: Record<Bucket, string> = {
  low: "bg-emerald-600",
  medium: "bg-amber-600",
  high: "bg-rose-600",
};

const bucketFromUtilization = (pct: number): Bucket => {
  if (pct < 80) return "low";
  if (pct <= 90) return "medium";
  return "high";
};

const bucketLabel = (b: Bucket) => (b === "low" ? "LOW" : b === "medium" ? "MEDIUM" : "HIGH");

function isValidYmd(ymd: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd);
}

function viewForNeededWeeks(neededWeeks: number): ViewKey {
  if (neededWeeks <= 4) return "4w";
  if (neededWeeks <= 12) return "12w";
  if (neededWeeks <= 13) return "quarter";
  return "6m";
}

function weeksBetweenIsoWeeksInclusive(startYmd: string, endYmd: string): number {
  const start = new Date(`${startYmd}T00:00:00Z`);
  const end = new Date(`${endYmd}T00:00:00Z`);

  const startMondayIndex = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - startMondayIndex);

  const endMonday = new Date(end);
  const endMondayIndex = (endMonday.getUTCDay() + 6) % 7;
  endMonday.setUTCDate(endMonday.getUTCDate() - endMondayIndex);

  const ms = endMonday.getTime() - start.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return Math.floor(days / 7) + 1;
}

export function EvaluateClient({ before, view }: { before: DashboardSnapshot; view: ViewKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("New work item");
  const [hours, setHours] = useState<string>("40");

  const defaultStart = before.horizonWeeks[0]?.weekStartYmd ?? "";
  const viewEnd = before.horizonWeeks[before.horizonWeeks.length - 1]?.weekEndYmd ?? "";

  const [startYmd, setStartYmd] = useState<string>(defaultStart);
  const [deadlineYmd, setDeadlineYmd] = useState<string>("");
  const [allocationMode, setAllocationMode] = useState<"even" | "fill_capacity">("fill_capacity");

  const parsedHours = Number(hours);
  const safeHours = Number.isFinite(parsedHours) ? Math.max(0, parsedHours) : 0;

  function setViewInUrl(nextView: ViewKey) {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("view", nextView);
    // Use push so App Router updates search params and re-renders server components.
    router.push(`${pathname}?${params.toString()}`);
  }


  const input: NewWorkInput = {
    name,
    totalHours: safeHours,
    startYmd,
    deadlineYmd: deadlineYmd.trim() ? deadlineYmd.trim() : undefined,
    allocationMode,
  };

  function maybeAutoExpandToDeadline(nextDeadlineYmd: string) {
    const d = nextDeadlineYmd.trim();
    if (!d || !isValidYmd(d) || !viewEnd) return;
    if (d <= viewEnd) return;

    const neededWeeks = weeksBetweenIsoWeeksInclusive(startYmd || defaultStart, d);
    const nextView = viewForNeededWeeks(neededWeeks);

    if (nextView !== view) {
      toast.message("View expanded to include deadline");
      setViewInUrl(nextView);
    } else if (nextView === "6m" && neededWeeks > 26) {
      toast.message("Deadline beyond 6-month view");
    }
  }

  const result = useMemo(() => {
    if (!safeHours) return null;
    if (!name.trim()) return null;
    if (!isValidYmd(startYmd)) return null;
    if (deadlineYmd.trim() && !isValidYmd(deadlineYmd.trim())) return null;
    if (deadlineYmd.trim() && deadlineYmd.trim() < startYmd) return null;

    return evaluateNewWork(before, input);
  }, [before, name, safeHours, startYmd, deadlineYmd, allocationMode]);

  const horizonHint =
    before.horizonWeeks.length > 0
      ? `${formatDateDdMmYyyy(before.horizonWeeks[0].weekStartYmd)} → ${formatDateDdMmYyyy(
          before.horizonWeeks[before.horizonWeeks.length - 1].weekEndYmd
        )}`
      : "";

  const viewLabel =
    view === "month"
      ? "Current month"
      : view === "4w"
      ? "Next 4 weeks"
      : view === "12w"
      ? "Next 12 weeks"
      : view === "quarter"
      ? "Current Quarter"
      : "6 months";

  return (
    <section className="grid gap-8 md:grid-cols-3">
      <div>
        <Card className="rounded-md">
          <CardHeader>
            <h2 className="text-base font-semibold">Work to evaluate</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>View window</Label>
              <Select value={view} onValueChange={(v) => setViewInUrl(v as ViewKey)}>
                <SelectTrigger className="rounded-md">
                  <SelectValue placeholder="Choose a view" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Current month</SelectItem>
                  <SelectItem value="4w">Next 4 weeks</SelectItem>
                  <SelectItem value="12w">Next 12 weeks</SelectItem>
                  <SelectItem value="quarter">Current Quarter</SelectItem>
                  <SelectItem value="6m">6 months</SelectItem>
                </SelectContent>
              </Select>

              {horizonHint && (
                <p className="text-xs text-muted-foreground">
                  {viewLabel}: {horizonHint}
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Work name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hours">Total hours</Label>
                  <Input
                    id="hours"
                    inputMode="numeric"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="startYmd">Start date</Label>
                  <Input
                    id="startYmd"
                    type="date"
                    value={startYmd}
                    onChange={(e) => setStartYmd(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadlineYmd">Deadline (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="deadlineYmd"
                    type="date"
                    value={deadlineYmd}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDeadlineYmd(v);
                      maybeAutoExpandToDeadline(v);
                    }}
                    className="flex-1"
                  />
                  {deadlineYmd && (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-md"
                      onClick={() => setDeadlineYmd("")}
                      disabled={isPending}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Allocation mode</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="allocationMode"
                      value="fill_capacity"
                      checked={allocationMode === "fill_capacity"}
                      onChange={(e) => setAllocationMode(e.target.value as "even" | "fill_capacity")}
                      className="h-4 w-4 border border-input text-primary focus:ring-2 focus:ring-ring"
                    />
                    <span className="text-sm">Fill capacity</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="allocationMode"
                      value="even"
                      checked={allocationMode === "even"}
                      onChange={(e) => setAllocationMode(e.target.value as "even" | "fill_capacity")}
                      className="h-4 w-4 border border-input text-primary focus:ring-2 focus:ring-ring"
                    />
                    <span className="text-sm">Even spread</span>
                  </label>
                </div>
                <CollapsibleHelp>
                  <p><strong>Fill capacity:</strong> Uses remaining capacity each week. Fits work into open slots and respects limits. Best for realistic planning.</p>
                  <p><strong>Even spread:</strong> Distributes hours evenly across the range. Ignores capacity—use for rough estimates or simulation.</p>
                </CollapsibleHelp>
              </div>
            </div>

            <Separator />

            <Button
              className="w-full rounded-md"
              type="button"
              disabled={
                isPending ||
                safeHours <= 0 ||
                !name.trim() ||
                !isValidYmd(startYmd) ||
                (deadlineYmd.trim() ? !isValidYmd(deadlineYmd.trim()) : false) ||
                (deadlineYmd.trim() ? deadlineYmd.trim() < startYmd : false)
              }
              onClick={() => {
                startTransition(async () => {
                  try {
                    const res = await commitWork({
                      name,
                      totalHours: safeHours,
                      startYmd: startYmd.trim(),
                      deadlineYmd: deadlineYmd.trim() ? deadlineYmd.trim() : undefined,
                      allocationMode,
                    });

                    toast.success("Work committed");

                    router.refresh();
                    setHours("");
                  } catch (e: any) {
                    toast.error("Could not commit work", {
                      description: e?.message ?? "Unknown error",
                    });
                  }
                });
              }}
            >
              {isPending ? "Committing…" : "Commit work"}
            </Button>

          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <div className="md:col-span-2 bg-background">
        <div className="space-y-6">
          <h2 className="text-base font-semibold">Simulation result</h2>
            {!result ? (
              <p className="text-sm text-muted-foreground">
                Enter hours and dates to see impact.
              </p>
            ) : (
              <>
                {/* Hero: decision signal */}
                <div className="pt-8 pb-8">
                  <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Peak exposure: {bucketLabel(result.after.exposureBucket as Bucket)}</span>
                    <InfoTooltip content="Based on highest weekly utilization in this view." />
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-5xl font-bold tracking-tight tabular-nums leading-none">
                      {result.after.maxUtilizationPct}%
                    </div>
                    <div className="text-lg text-muted-foreground leading-tight">Peak week</div>
                    {result.after.maxUtilizationPct > 100 && (
                      <div className="text-base font-medium text-rose-600 tabular-nums">
                        +{result.after.maxUtilizationPct - 100}% over capacity
                      </div>
                    )}
                  </div>
                </div>

                {/* Supporting metrics: muted, inline */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground pb-8">
                  <span className="tabular-nums">
                    {result.after.totalCommittedHours}h / {result.after.totalCapacityHours}h
                  </span>
                  <span className="tabular-nums">{result.after.overallUtilizationPct}% utilization</span>
                  <span className="tabular-nums">
                    {result.applied.weeksCount} week{result.applied.weeksCount !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Week-by-week */}
                <div className="space-y-3 pt-8">
                  <h3 className="text-sm font-medium text-muted-foreground">Weekly impact</h3>

                  <div className="space-y-4">
                    {result.after.horizonWeeks.map((afterWeek, idx) => {
                      const beforeWeek = result.before.horizonWeeks[idx];

                      const beforePct = Math.round(
                        (beforeWeek.committedHours / beforeWeek.capacityHours) * 100
                      );
                      const afterPct = Math.round(
                        (afterWeek.committedHours / afterWeek.capacityHours) * 100
                      );

                      const afterBucket = bucketFromUtilization(afterPct);
                      const buffer = result.after.bufferHoursPerWeek;
                      const workHours = Math.max(0, afterWeek.committedHours - buffer);
                      const bufferPct = afterWeek.capacityHours > 0
                        ? Math.min(100, (buffer / afterWeek.capacityHours) * 100)
                        : 0;
                      const workPct = afterWeek.capacityHours > 0
                        ? Math.min(100 - bufferPct, (workHours / afterWeek.capacityHours) * 100)
                        : Math.min(afterPct, 100);

                      return (
                        <div key={afterWeek.weekStartYmd} className="space-y-2">
                          <div className="flex items-center justify-between gap-4 text-sm">
                            <div className="font-medium">{afterWeek.weekLabel}</div>
                            <div className="text-xs tabular-nums">
                              {beforePct}% → {afterPct}%
                              {afterPct > 100 && (
                                <span className="text-rose-600"> +{afterPct - 100}%</span>
                              )}
                            </div>
                          </div>

                          <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                            {buffer > 0 && bufferPct > 0 && (
                              <div
                                className="h-full bg-slate-400/40 shrink-0"
                                style={{ width: `${bufferPct}%` }}
                                title="Structural buffer"
                              />
                            )}
                            <div
                              className={`h-full shrink-0 ${barFill[afterBucket]}`}
                              style={{ width: `${workPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
        </div>
      </div>
    </section>
  );
}


