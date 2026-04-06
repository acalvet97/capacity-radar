export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { getWorkItemsForTeam } from "@/lib/db/getWorkItemsForTeam";
import { getTeamBufferAndCapacity } from "@/lib/db/getTeamSettings";
import { getTeamIdForUser } from "@/lib/db/getTeamIdForUser";
import {
  DEFAULT_TZ,
  todayYmdInTz,
  ymdToUtcDate,
  utcDateToYmd,
  startOfIsoWeekUtc,
  addDaysUtc,
  formatDateDdMmYyyy,
} from "@/lib/dates";
import { normalizeViewSearchParam, weeksForHorizonView } from "@/lib/horizonView";
import { getViewLabel } from "@/lib/dashboardConstants";
import { DashboardViewSelector } from "@/components/dashboard/DashboardViewSelector";
import { CommittedWorkList } from "./CommittedWorkList";
import { CommittedWorkHeader } from "./CommittedWorkHeader";

export const metadata: Metadata = {
  title: "Committed Work",
  description: "List of committed work items, sortable by deadline or hours.",
};

export default async function CommittedWorkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const teamId = await getTeamIdForUser();

  const [workItems, { weeklyAvailableCapacity }] = await Promise.all([
    getWorkItemsForTeam(teamId),
    getTeamBufferAndCapacity(teamId),
  ]);

  const params = await searchParams;
  const view = normalizeViewSearchParam(params?.view);
  const todayYmd = todayYmdInTz(DEFAULT_TZ);
  const weekCount = weeksForHorizonView(view, todayYmd);
  const viewStart = startOfIsoWeekUtc(ymdToUtcDate(todayYmd));
  const viewStartYmd = utcDateToYmd(viewStart);
  const viewEndYmd = utcDateToYmd(addDaysUtc(viewStart, weekCount * 7 - 1));
  const horizonHint =
    viewStartYmd && viewEndYmd
      ? `${formatDateDdMmYyyy(viewStartYmd)} → ${formatDateDdMmYyyy(viewEndYmd)}`
      : "";
  const viewLabel = getViewLabel(view);

  return (
    <div className="mx-auto max-w-6xl w-full py-[52px] px-4">
      <CommittedWorkHeader />

      <div className="-mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
        {horizonHint ? (
          <p className="text-sm">
            <span className="text-foreground">Showing data for:</span>{" "}
            <span className="text-muted-foreground">
              {viewLabel}: {horizonHint.replace(" → ", " -> ")}
            </span>
          </p>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">View:</span>
          <DashboardViewSelector view={view} />
        </div>
      </div>

      <section className="space-y-4">
        <CommittedWorkList
          teamId={teamId}
          items={workItems}
          viewStartYmd={viewStartYmd}
          viewEndYmd={viewEndYmd}
          weeklyCapacityHours={weeklyAvailableCapacity}
        />
      </section>
    </div>
  );
}
