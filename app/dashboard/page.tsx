// app/dashboard/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { getDashboardSnapshotFromDb, exposureBucketFromUtilization, type Bucket } from "@/lib/dashboardEngine";
import { recomputeSnapshot } from "@/lib/evaluateEngine";
import { getWorkItemsForTeam } from "@/lib/db/getWorkItemsForTeam";
import { WorkItemsList } from "./workItemsList";

import { DashboardViewSelector, type ViewKey } from "@/components/dashboard/DashboardViewSelector";
import { CardTitleWithTooltip } from "@/components/dashboard/CardTitleWithTooltip";
import { PeakLoadLabel } from "@/components/dashboard/PeakLoadLabel";
import { WeekUtilizationBar } from "@/components/dashboard/WeekUtilizationBar";
import {
  EXPOSURE_BADGE_STYLES,
  exposureBucketLabel,
  getViewLabel,
} from "@/lib/dashboardConstants";
import {
  todayYmdInTz,
  ymdToUtcDate,
  utcDateToYmd,
  startOfIsoWeekUtc,
  endOfIsoWeekUtc,
  formatDateDdMmYyyy,
  weeksBetweenIsoWeeksInclusive,
} from "@/lib/dates";

function normalizeView(raw: unknown): ViewKey {
  // handle string | string[] | undefined
  const v =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
      ? raw[0]
      : "";

  if (v === "month" || v === "4w" || v === "12w" || v === "quarter" || v === "6m") return v;
  return "4w";
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

  // ✅ Work items in current view and top 5 by hours
  const viewStartYmd = horizonWeeksForView[0]?.weekStartYmd ?? "";
  const viewEndYmd = horizonWeeksForView[horizonWeeksForView.length - 1]?.weekEndYmd ?? "";
  const workItemsInView = (() => {
    if (!viewStartYmd || !viewEndYmd) return [];
    return workItems.filter((item) => {
      const start = item.start_date ?? "";
      if (!start) return false;
      const end = item.deadline ?? "9999-12-31";
      return start <= viewEndYmd && end >= viewStartYmd;
    });
  })();
  const top5WorkItems = [...workItemsInView]
    .sort((a, b) => b.estimated_hours - a.estimated_hours)
    .slice(0, 5);

  // ✅ At-risk weeks only from the current view
  const atRiskWeeks = horizonWeeksForView
    .map((week) => {
      const utilizationPct = Math.round((week.committedHours / week.capacityHours) * 100);
      return { ...week, utilizationPct, bucket: exposureBucketFromUtilization(utilizationPct) };
    })
    .filter((w) => w.utilizationPct > 90);

  // ✅ Hint shows only the view window (dd/mm/yyyy)
  const horizonHint =
    horizonWeeksForView.length > 0
      ? `${formatDateDdMmYyyy(horizonWeeksForView[0].weekStartYmd)} → ${formatDateDdMmYyyy(
          horizonWeeksForView[horizonWeeksForView.length - 1].weekEndYmd
        )}`
      : "";

  const viewLabel = getViewLabel(view);

  return (
    <main className="mx-auto max-w-6xl w-full py-[52px] px-4 space-y-10">
      <header className="mb-[52px]">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold tracking-normal">Dashboard</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">View:</span>
            <DashboardViewSelector view={view} />
          </div>
        </div>
        {horizonHint && (
          <p className="text-sm">
            <span className="text-foreground">Showing data for:</span>{" "}
            <span className="text-muted-foreground">{horizonHint.replace(" → ", " -> ")}</span>
          </p>
        )}
      </header>

      {/* KPIs — Risk first, context second. 4-col: primary 2, others 1 each. */}
      <section className="grid gap-4 md:grid-cols-4" aria-label="Overview">
        {/* Tier 1: Primary — Max Utilization + Exposure (2 cols) */}
        <Card className="rounded-md md:col-span-2 flex flex-col justify-end">
          <CardContent className="py-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-5xl font-semibold tracking-tight">
                  {snapshot.maxUtilizationPct}%
                </div>
                <PeakLoadLabel />
              </div>
              <Badge
                variant="outline"
                className={EXPOSURE_BADGE_STYLES[snapshot.exposureBucket]}
                aria-label={`Exposure: ${exposureBucketLabel(snapshot.exposureBucket)}`}
              >
                {exposureBucketLabel(snapshot.exposureBucket)} exposure
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Tier 2: Committed (1 col) */}
        <Card className="rounded-md">
          <CardHeader className="pb-1">
            <CardTitleWithTooltip
              title="Total committed"
              tooltip={snapshot.bufferHoursPerWeek > 0 ? `Includes ${snapshot.bufferHoursPerWeek}h/week reserved capacity.` : undefined}
              className="text-sm font-medium text-muted-foreground"
            />
          </CardHeader>
          <CardContent className="space-y-0.5">
            <div className="text-2xl font-semibold tracking-tight">
              {snapshot.totalCommittedHours}h / {snapshot.totalCapacityHours}h
            </div>
          </CardContent>
        </Card>

        {/* Tier 2: Weeks (1 col) */}
        <Card className="rounded-md">
          <CardHeader className="pb-1">
            <CardTitleWithTooltip
              title="Weeks equivalence"
              tooltip="Total committed expressed as weeks of team capacity."
              className="text-sm font-medium text-muted-foreground"
            />
          </CardHeader>
          <CardContent className="space-y-0.5">
            <div className="text-2xl font-semibold tracking-tight">
              {snapshot.weeksEquivalent}w
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Horizon + At-risk */}
      <section className="grid gap-4 md:grid-cols-3 pt-4">
        <div className="md:col-span-2">
          <Card className="rounded-md">
            <CardHeader>
              <h2 className="text-base font-semibold">Capacity overview</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {horizonWeeksForView.map((week) => {
                const utilization = Math.round((week.committedHours / week.capacityHours) * 100);
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
                            <span className="text-rose-600">
                              +{utilization - 100}% over capacity
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <WeekUtilizationBar
                      capacityHours={week.capacityHours}
                      committedHours={week.committedHours}
                      bufferHoursPerWeek={snapshot.bufferHoursPerWeek}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="rounded-md">
            <CardHeader>
              <CardTitleWithTooltip
                title="Weeks at risk"
                tooltip="Weeks above 90% utilization."
                as="h2"
                className="text-sm font-medium text-muted-foreground"
              />
            </CardHeader>
            <CardContent className="space-y-2">
              {atRiskWeeks.length > 0 ? (
                atRiskWeeks.map((week) => (
                  <div key={week.weekStartYmd} className="flex items-center justify-between text-xl">
                    <span className="text-xl font-medium">{week.weekLabel}</span>
                    <Badge variant="outline" className={EXPOSURE_BADGE_STYLES[week.bucket]}>
                      {week.utilizationPct}%
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">None</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="pt-4">
        <WorkItemsList
          teamId={MVP_TEAM_ID}
          items={top5WorkItems}
          title="Committed work (top 5 by hours)"
          viewStartYmd={viewStartYmd}
          viewEndYmd={viewEndYmd}
          weeklyCapacityHours={
            horizonWeeksForView.length > 0
              ? snapshot.totalCapacityHours / horizonWeeksForView.length
              : 0
          }
        />
      </section>
    </main>
  );
}

