// app/(app)/dashboard/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Dashboard" };

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { WorkItemsTable } from "@/components/work-items/WorkItemsTable";
import { getDefaultDashboardSnapshot, exposureBucketFromUtilization } from "@/lib/dashboardEngine";
import { recomputeSnapshot } from "@/lib/evaluateEngine";
import { getWorkItemsForTeam } from "@/lib/db/getWorkItemsForTeam";
import { getTeamIdForUser } from "@/lib/db/getTeamIdForUser";

import { DashboardViewSelector } from "@/components/dashboard/DashboardViewSelector";
import { CardTitleWithTooltip } from "@/components/dashboard/CardTitleWithTooltip";
import { PeakLoadLabel } from "@/components/dashboard/PeakLoadLabel";
import { WeekUtilizationBar } from "@/components/dashboard/WeekUtilizationBar";
import {
  EXPOSURE_BADGE_STYLES,
  exposureBucketLabel,
  getViewLabel,
} from "@/lib/dashboardConstants";
import { DEFAULT_TZ, todayYmdInTz, formatDateDdMmYyyy } from "@/lib/dates";
import { normalizeViewSearchParam, weeksForHorizonView } from "@/lib/horizonView";
import { checkAndCreateStalenessNotification } from "@/lib/notifications";

function daysUntil(deadlineYmd: string, todayYmd: string): number {
  const deadline = new Date(deadlineYmd + 'T00:00:00Z');
  const today = new Date(todayYmd + 'T00:00:00Z');
  return Math.ceil(
    (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = normalizeViewSearchParam(params?.view);
  const todayYmd = todayYmdInTz(DEFAULT_TZ);
  const weeksInView = weeksForHorizonView(view, todayYmd);

  const teamId = await getTeamIdForUser();

  // Fire-and-forget: check for stale work items and create notification if needed
  checkAndCreateStalenessNotification(teamId).catch(() => {});

  const [fullSnapshot, workItems] = await Promise.all([
    getDefaultDashboardSnapshot(teamId, todayYmd),
    getWorkItemsForTeam(teamId),
  ]);

  const horizonWeeksForView = fullSnapshot.horizonWeeks.slice(0, weeksInView);
  const snapshot = recomputeSnapshot(fullSnapshot, horizonWeeksForView);

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

  const atRiskWeeks = horizonWeeksForView
    .map((week) => {
      const utilizationPct = Math.round((week.committedHours / week.capacityHours) * 100);
      return { ...week, utilizationPct, bucket: exposureBucketFromUtilization(utilizationPct) };
    })
    .filter((w) => w.utilizationPct > 90);

  const thisWeek = horizonWeeksForView[0];
  const freeHoursThisWeek = thisWeek
    ? Math.max(0, Math.round(thisWeek.capacityHours - thisWeek.committedHours))
    : 0;
  const thisWeekUtilizationPct = thisWeek && thisWeek.capacityHours > 0
    ? Math.round((thisWeek.committedHours / thisWeek.capacityHours) * 100)
    : 0;

  const BREATHING_ROOM_THRESHOLD_PCT = 70;
  const nextBreathingRoomWeek = horizonWeeksForView.find(w => {
    if (w.capacityHours <= 0) return false;
    const pct = (w.committedHours / w.capacityHours) * 100;
    return pct < BREATHING_ROOM_THRESHOLD_PCT;
  }) ?? null;
  const breathingRoomFreeHours = nextBreathingRoomWeek
    ? Math.max(0, Math.round(
        nextBreathingRoomWeek.capacityHours - nextBreathingRoomWeek.committedHours
      ))
    : 0;

  const fourWeeksAheadYmd = horizonWeeksForView[
    Math.min(3, horizonWeeksForView.length - 1)
  ]?.weekEndYmd ?? '';
  const upcomingDeadlines = workItems
    .filter(item => {
      if (!item.deadline) return false;
      return item.deadline >= todayYmd && item.deadline <= fourWeeksAheadYmd;
    })
    .sort((a, b) =>
      (a.deadline ?? '').localeCompare(b.deadline ?? '')
    );

  const horizonHint =
    horizonWeeksForView.length > 0
      ? `${formatDateDdMmYyyy(horizonWeeksForView[0].weekStartYmd)} → ${formatDateDdMmYyyy(
          horizonWeeksForView[horizonWeeksForView.length - 1].weekEndYmd
        )}`
      : "";

  const viewLabel = getViewLabel(view);

  return (
    <div className="mx-auto max-w-6xl w-full py-[52px] px-4 space-y-10">
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
            <span className="text-muted-foreground">
              {viewLabel}: {horizonHint.replace(" → ", " -> ")}
            </span>
          </p>
        )}
      </header>

      <section className="grid gap-4 md:grid-cols-4" aria-label="Overview">
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

        <Card className="rounded-md">
          <CardHeader className="pb-1">
            <CardTitleWithTooltip
              title="Total committed"
              tooltip={snapshot.bufferHoursPerWeek > 0 ? `Project work only. The ${snapshot.bufferHoursPerWeek}h/week structural buffer is shown separately in each week bar.` : undefined}
              className="text-sm font-medium text-muted-foreground"
            />
          </CardHeader>
          <CardContent className="space-y-0.5">
            <div className="text-2xl font-semibold tracking-tight">
              {snapshot.totalCommittedHours}h / {snapshot.totalCapacityHours}h
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-md">
          <CardHeader className="pb-1">
            <CardTitleWithTooltip
              title="Free this week"
              tooltip="Available hours in the current week after committed work and buffer."
              className="text-sm font-medium text-muted-foreground"
            />
          </CardHeader>
          <CardContent className="space-y-0.5">
            <div className="text-2xl font-semibold tracking-tight">
              {freeHoursThisWeek}h
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {thisWeekUtilizationPct}% committed this week
            </p>
          </CardContent>
        </Card>
      </section>

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

        <div className="space-y-4">
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

          <Card className="rounded-md">
            <CardHeader>
              <CardTitleWithTooltip
                title="Next breathing room"
                tooltip="First week below 70% utilization in the current view."
                as="h2"
                className="text-sm font-medium text-muted-foreground"
              />
            </CardHeader>
            <CardContent>
              {nextBreathingRoomWeek ? (
                <div className="space-y-1">
                  <p className="text-xl font-medium">
                    {nextBreathingRoomWeek.weekLabel}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {breathingRoomFreeHours}h free
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No open weeks in this view
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {upcomingDeadlines.length > 0 && (
        <section className="pt-4">
          <Card className="rounded-md">
            <CardHeader>
              <h2 className="text-base font-semibold">Upcoming deadlines</h2>
              <p className="text-sm text-muted-foreground">
                Work due in the next 4 weeks
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {upcomingDeadlines.map(item => {
                  const days = daysUntil(item.deadline!, todayYmd);
                  const isUrgent = days <= 7;
                  const daysLabel =
                    days === 0 ? 'Due today'
                    : days === 1 ? 'Due tomorrow'
                    : `In ${days} days`;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-3 border-b last:border-0 gap-4"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                          {item.estimated_hours}h estimated
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-medium tabular-nums ${
                          isUrgent ? 'text-rose-600' : 'text-foreground'
                        }`}>
                          {formatDateDdMmYyyy(item.deadline!)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {daysLabel}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section className="pt-4">
        <WorkItemsTable
          teamId={teamId}
          items={top5WorkItems}
          title="Committed work (top 5 by hours)"
          viewStartYmd={viewStartYmd}
          viewEndYmd={viewEndYmd}
          weeklyCapacityHours={horizonWeeksForView[0]?.capacityHours ?? 0}
        />
      </section>
    </div>
  );
}
