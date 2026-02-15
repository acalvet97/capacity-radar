// components/evaluate/EvaluateClient.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

export function EvaluateClient({ before }: { before: DashboardSnapshot }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("New work item");
  const [hours, setHours] = useState<string>("40");
  const [startWeek, setStartWeek] = useState<string>("0"); // 0..3
  const [deadlineWeek, setDeadlineWeek] = useState<string>("none"); // "none" | 0..3

  const parsedHours = Number(hours);
  const safeHours = Number.isFinite(parsedHours) ? Math.max(0, parsedHours) : 0;

  const input: NewWorkInput = {
    name,
    totalHours: safeHours,
    startWeekIndex: Number(startWeek),
    deadlineWeekIndex: deadlineWeek === "none" ? undefined : Number(deadlineWeek),
  };

  const result = useMemo(() => {
    if (!safeHours) return null;
    return evaluateNewWork(before, input);
  }, [before, input.startWeekIndex, input.deadlineWeekIndex, input.totalHours, name, safeHours]);

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {/* Inputs */}
      <div>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Inputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                Distributed uniformly across selected weeks.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Start week</Label>
              <Select value={startWeek} onValueChange={setStartWeek}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Choose start week" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">W1</SelectItem>
                  <SelectItem value="1">W2</SelectItem>
                  <SelectItem value="2">W3</SelectItem>
                  <SelectItem value="3">W4</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Deadline week (optional)</Label>
              <Select value={deadlineWeek} onValueChange={setDeadlineWeek}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="No deadline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No deadline (to W4)</SelectItem>
                  <SelectItem value="0">W1</SelectItem>
                  <SelectItem value="1">W2</SelectItem>
                  <SelectItem value="2">W3</SelectItem>
                  <SelectItem value="3">W4</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <Button
              className="w-full rounded-xl"
              type="button"
              disabled={isPending || safeHours <= 0 || !name.trim()}
              onClick={() => {
                startTransition(async () => {
                  try {
                    const res = await commitWork({
                      name,
                      totalHours: safeHours,
                      startWeekIndex: Number(startWeek),
                      deadlineWeekIndex: deadlineWeek === "none" ? undefined : Number(deadlineWeek),
                    });

                    toast.success("Work committed", {
                      description: `Saved as ${res.id.slice(0, 8)}…`,
                    });

                    // Refresh server-fetched baseline (DB-backed "before")
                    router.refresh();

                    // Optional: clear hours after commit (signals "accepted")
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
                Enter hours to see impact across the next 4 weeks.
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
                        <div key={afterWeek.weekLabel} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{afterWeek.weekLabel}</span>
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
                            {Math.round(beforeWeek.committedHours)}h → {Math.round(afterWeek.committedHours)}h (
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

