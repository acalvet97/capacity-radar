"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

import type { DashboardSnapshot } from "@/lib/dashboardEngine";
import { evaluateNewWork, type NewWorkInput } from "@/lib/evaluateEngine";
import { commitWork } from "@/app/evaluate/actions";

type Bucket = "low" | "medium" | "high";
type ViewKey = "month" | "4w" | "12w" | "quarter" | "6m";

const badgeStyles: Record<Bucket, string> = {
  low: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  high: "bg-red-500/10 text-red-600 border-red-500/20",
};

const barFill: Record<Bucket, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-red-500",
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
  };

  function maybeAutoExpandToDeadline(nextDeadlineYmd: string) {
    const d = nextDeadlineYmd.trim();
    if (!d || !isValidYmd(d) || !viewEnd) return;
    if (d <= viewEnd) return;

    const neededWeeks = weeksBetweenIsoWeeksInclusive(startYmd || defaultStart, d);
    const nextView = viewForNeededWeeks(neededWeeks);

    if (nextView !== view) {
      toast.message("View expanded to include deadline", {
        description: `Switched to ${
          nextView === "6m"
            ? "6 months"
            : nextView === "quarter"
            ? "Current Quarter"
            : nextView === "12w"
            ? "Next 12 weeks"
            : "Next 4 weeks"
        }.`,
      });
      setViewInUrl(nextView);
    } else if (nextView === "6m" && neededWeeks > 26) {
      toast.message("Deadline exceeds 6-month view cap", {
        description: "View is capped at 6 months for MVP; impact beyond that isn’t shown yet.",
      });
    }
  }

  const result = useMemo(() => {
    if (!safeHours) return null;
    if (!name.trim()) return null;
    if (!isValidYmd(startYmd)) return null;
    if (deadlineYmd.trim() && !isValidYmd(deadlineYmd.trim())) return null;
    if (deadlineYmd.trim() && deadlineYmd.trim() < startYmd) return null;

    return evaluateNewWork(before, input);
  }, [before, name, safeHours, startYmd, deadlineYmd]);

  const horizonHint =
    before.horizonWeeks.length > 0
      ? `${before.horizonWeeks[0].weekStartYmd} → ${
          before.horizonWeeks[before.horizonWeeks.length - 1].weekEndYmd
        }`
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
    <section className="grid gap-4 md:grid-cols-3">
      <div>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Inputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>View window</Label>
              <Select value={view} onValueChange={(v) => setViewInUrl(v as ViewKey)}>
                <SelectTrigger className="rounded-xl">
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

            <div className="space-y-2">
              <Label htmlFor="name">Work name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hours">Total hours</Label>
              <Input
                id="hours"
                inputMode="numeric"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Distributed uniformly across the selected date range (weekly buckets).
              </p>
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

            <div className="space-y-2">
              <Label htmlFor="deadlineYmd">Deadline date (optional)</Label>
              <Input
                id="deadlineYmd"
                type="date"
                value={deadlineYmd}
                onChange={(e) => {
                  const v = e.target.value;
                  setDeadlineYmd(v);
                  maybeAutoExpandToDeadline(v);
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setDeadlineYmd("")}
                  disabled={isPending || !deadlineYmd}
                >
                  Clear deadline
                </Button>

                {viewEnd ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => {
                      setDeadlineYmd(viewEnd);
                      maybeAutoExpandToDeadline(viewEnd);
                    }}
                    disabled={isPending}
                  >
                    Set to end of view
                  </Button>
                ) : null}
              </div>
            </div>

            <Separator />

            <Button
              className="w-full rounded-xl"
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
                    });

                    toast.success("Work committed", {
                      description: `Saved as ${res.id.slice(0, 8)}…`,
                    });

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

            <p className="text-xs text-muted-foreground">
              Committing writes this work item to the database (so it affects future snapshots).
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <div className="md:col-span-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Impact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {!result ? (
              <p className="text-sm text-muted-foreground">
                Enter hours and dates to see impact across the current view.
              </p>
            ) : (
              <>
                {/* Before → After quick deltas */}
                <div className="grid gap-2 rounded-2xl border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Committed</span>
                    <span className="font-medium">
                      {result.before.totalCommittedHours}h → {result.after.totalCommittedHours}h
                      <span className="text-muted-foreground">
                        {" "}
                        (+{result.deltas.totalCommittedHours}h)
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Overall utilization</span>
                    <span className="font-medium">
                      {result.before.overallUtilizationPct}% → {result.after.overallUtilizationPct}%
                      <span className="text-muted-foreground">
                        {" "}
                        (+{result.deltas.overallUtilizationPct})
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Max utilization</span>
                    <span className="font-medium">
                      {result.before.maxUtilizationPct}% → {result.after.maxUtilizationPct}%
                      <span className="text-muted-foreground">
                        {" "}
                        (+{result.deltas.maxUtilizationPct})
                      </span>
                    </span>
                  </div>
                </div>

                {/* Summary cards */}
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        Exposure
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                      <div className="text-lg font-semibold">
                        {bucketLabel(result.after.exposureBucket as Bucket)}
                      </div>
                      <Badge
                        variant="outline"
                        className={badgeStyles[result.after.exposureBucket as Bucket]}
                      >
                        {result.after.maxUtilizationPct}% max
                      </Badge>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        Committed
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <div className="text-lg font-semibold">
                        {result.after.totalCommittedHours}h{" "}
                        <span className="text-muted-foreground font-medium">
                          / {result.after.totalCapacityHours}h
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {result.after.overallUtilizationPct}% of capacity
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        Applied
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <div className="text-lg font-semibold">{result.applied.weekRangeLabel}</div>
                      <div className="text-xs text-muted-foreground">
                        {result.applied.perWeekHours}h / week ({result.applied.weeksCount} weeks)
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Week-by-week */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Week-by-week impact</h3>
                    <p className="text-xs text-muted-foreground">Before → After (utilization)</p>
                  </div>

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

                      return (
                        <div key={afterWeek.weekStartYmd} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">
                              {afterWeek.weekLabel}{" "}
                              <span className="text-muted-foreground font-normal">
                                ({afterWeek.weekStartYmd} → {afterWeek.weekEndYmd})
                              </span>
                            </span>
                            <span className="text-muted-foreground">
                              {beforePct}% → {afterPct}%
                              {afterPct > 100 && (
                                <span className="ml-2 text-xs text-red-600">
                                  +{afterPct - 100}% over
                                </span>
                              )}
                            </span>
                          </div>

                          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full ${barFill[afterBucket]}`}
                              style={{ width: `${Math.min(afterPct, 100)}%` }}
                            />
                          </div>

                          <div className="text-xs text-muted-foreground">
                            {Math.round(beforeWeek.committedHours)}h →{" "}
                            {Math.round(afterWeek.committedHours)}h (
                            +{Math.max(0, Math.round(afterWeek.committedHours - beforeWeek.committedHours))}h)
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}


