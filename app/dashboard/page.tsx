// app/dashboard/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { getDashboardSnapshotFromDb } from "@/lib/dashboardEngine";
import { recomputeSnapshot } from "@/lib/evaluateEngine";
import { getWorkItemsForTeam } from "@/lib/db/getWorkItemsForTeam";
import { WorkItemsList } from "./workItemsList";

import { DashboardViewSelector, type ViewKey } from "@/components/dashboard/DashboardViewSelector";
import {
  todayYmdInTz,
  ymdToUtcDate,
  utcDateToYmd,
  startOfIsoWeekUtc,
  addDaysUtc,
  formatDateDdMmYyyy,
} from "@/lib/dates";

type Bucket = "low" | "medium" | "high";

const bucketLabel = (b: Bucket) => (b === "low" ? "LOW" : b === "medium" ? "MEDIUM" : "HIGH");

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

function normalizeView(raw: unknown): ViewKey {
  // ✅ handle string | string[] | undefined
  const v =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
      ? raw[0]
      : "";

  if (v === "month" || v === "4w" || v === "12w" || v === "quarter" || v === "6m") return v;
  return "4w";
}

function endOfIsoWeekUtc(d: Date): Date {
  return addDaysUtc(startOfIsoWeekUtc(d), 6);
}

function diffDaysUtc(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function weeksBetweenIsoWeeksInclusive(startYmd: string, endYmd: string): number {
  const start = startOfIsoWeekUtc(ymdToUtcDate(startYmd));
  const end = startOfIsoWeekUtc(ymdToUtcDate(endYmd));
  const days = diffDaysUtc(end, start);
  return Math.floor(days / 7) + 1;
}

function lastDayOfMonthYmd(todayYmd: string): string {
  const [yy, mm] = todayYmd.split("-").map(Number);
  const last = new Date(Date.UTC(yy, mm, 0));
  return utcDateToYmd(last);
}

function lastDayOfQuarterYmd(todayYmd: string): string {
  const [yy, mm] = todayYmd.split("-").map(Number);
  // mm is 1-based month number. Determine quarter end month (3,6,9,12)
  const quarter = Math.floor((mm - 1) / 3);
  const quarterEndMonth = (quarter + 1) * 3; // 3,6,9,12
  const last = new Date(Date.UTC(yy, quarterEndMonth, 0));
  return utcDateToYmd(last);
}

function weeksForView(view: ViewKey, todayYmd: string): number {
  if (view === "4w") return 4;
  if (view === "12w") return 12;
  if (view === "quarter") {
    // Current quarter -> include ISO weeks until the week containing quarter-end
    const quarterEndYmd = lastDayOfQuarterYmd(todayYmd);
    const endSundayYmd = utcDateToYmd(endOfIsoWeekUtc(ymdToUtcDate(quarterEndYmd)));
    return weeksBetweenIsoWeeksInclusive(todayYmd, endSundayYmd);
  }
  if (view === "6m") return 26;

  // month view -> include ISO weeks until the week containing month-end
  const monthEndYmd = lastDayOfMonthYmd(todayYmd);
  const endSundayYmd = utcDateToYmd(endOfIsoWeekUtc(ymdToUtcDate(monthEndYmd)));
  return weeksBetweenIsoWeeksInclusive(todayYmd, endSundayYmd);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = normalizeView(params?.view);
  const todayYmd = todayYmdInTz("Europe/Madrid");
  const weeksInView = weeksForView(view, todayYmd);

  // ✅ Always fetch full 26-week snapshot for underlying data
  const fullSnapshot = await getDashboardSnapshotFromDb(MVP_TEAM_ID, {
    startYmd: todayYmd,
    weeks: 26,
    maxWeeks: 26,
    locale: "en-GB",
    tz: "Europe/Madrid",
  });

  // ✅ Filter weeks for display based on view
  const horizonWeeksForView = fullSnapshot.horizonWeeks.slice(0, weeksInView);

  // ✅ Recalculate KPIs for the selected view window
  const snapshot = recomputeSnapshot(fullSnapshot, horizonWeeksForView);

  const workItems = await getWorkItemsForTeam(MVP_TEAM_ID);

  // ✅ At-risk weeks only from the current view
  const atRiskWeeks = horizonWeeksForView
    .map((week) => {
      const utilizationPct = Math.round((week.committedHours / week.capacityHours) * 100);
      return { ...week, utilizationPct, bucket: bucketFromUtilization(utilizationPct) as Bucket };
    })
    .filter((w) => w.utilizationPct > 90);

  // ✅ Hint shows only the view window (dd/mm/yyyy)
  const horizonHint =
    horizonWeeksForView.length > 0
      ? `${formatDateDdMmYyyy(horizonWeeksForView[0].weekStartYmd)} → ${formatDateDdMmYyyy(
          horizonWeeksForView[horizonWeeksForView.length - 1].weekEndYmd
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
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Shows how much of your team&apos;s capacity is already committed in this window.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">View window:</span>
          <DashboardViewSelector view={view} horizonHint={horizonHint} />
        </div>
      </header>

      {/* KPIs — Risk first, context second. 4-col: primary 2, others 1 each. */}
      <section className="grid gap-4 md:grid-cols-4">
        {/* Tier 1: Primary — Max Utilization + Exposure (2 cols) */}
        <Card className="rounded-md md:col-span-2">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-3xl font-semibold tracking-tight">
                  {snapshot.maxUtilizationPct}%
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Highest weekly load in this window
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground/80">
                  (This is where your team is most constrained.)
                </p>
              </div>
              <Badge
                variant="outline"
                className={badgeStyles[snapshot.exposureBucket as Bucket]}
                aria-label={`Exposure: ${bucketLabel(snapshot.exposureBucket as Bucket)}`}
              >
                {bucketLabel(snapshot.exposureBucket as Bucket)} exposure
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Tier 2: Committed (1 col) */}
        <Card className="rounded-md">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Committed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5">
            <div className="text-xl font-semibold tracking-tight">
              {snapshot.totalCommittedHours}h / {snapshot.totalCapacityHours}h
            </div>
            <p className="text-xs text-muted-foreground">
              {snapshot.overallUtilizationPct}% of capacity in view
            </p>
          </CardContent>
        </Card>

        {/* Tier 2: Weeks Equivalent (1 col) */}
        <Card className="rounded-md">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Weeks Equivalent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5">
            <div className="text-xl font-semibold tracking-tight">
              {snapshot.weeksEquivalent}w
            </div>
            <p className="text-xs text-muted-foreground">
              Total committed expressed as weeks of team capacity
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Horizon + At-risk */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Capacity Horizon ({viewLabel})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {horizonWeeksForView.map((week) => {
                const utilization = Math.round((week.committedHours / week.capacityHours) * 100);
                const bucket = bucketFromUtilization(utilization);
                const fillWidth = Math.min(utilization, 100);

                return (
                  <div key={week.weekStartYmd} className="space-y-2">
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium">{week.weekLabel}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            <span className="font-medium text-foreground">
                              {Math.round(week.committedHours)}h / {Math.round(week.capacityHours)}h
                            </span>{" "}
                            committed
                          </span>
                          <span>
                            <span className="font-medium text-foreground">
                              {utilization}%
                            </span>{" "}
                            utilization
                          </span>
                          {utilization > 100 && (
                            <span className="text-red-600">
                              +{utilization - 100}% over capacity
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${barFill[bucket]}`}
                        style={{ width: `${fillWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                At Risk Weeks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {atRiskWeeks.length > 0 ? (
                atRiskWeeks.map((week) => (
                  <div key={week.weekStartYmd} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{week.weekLabel}</span>
                    <Badge variant="outline" className={badgeStyles[week.bucket]}>
                      {week.utilizationPct}%
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No weeks above 90% utilization.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-1">
        <WorkItemsList teamId={MVP_TEAM_ID} items={workItems} />
      </section>
    </main>
  );
}

