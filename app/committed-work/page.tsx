export const dynamic = "force-dynamic";
export const revalidate = 0;

import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { getWorkItemsForTeam } from "@/lib/db/getWorkItemsForTeam";
import { getTeamBufferAndCapacity } from "@/lib/db/getTeamSettings";
import { todayYmdInTz, ymdToUtcDate, utcDateToYmd, startOfIsoWeekUtc, addDaysUtc } from "@/lib/dates";
import { CommittedWorkList } from "./CommittedWorkList";
import { CommittedWorkHeader } from "./CommittedWorkHeader";

export const metadata = {
  title: "Committed Work",
  description: "List of committed work items, sortable by deadline or hours.",
};

export default async function CommittedWorkPage() {
  const [workItems, { weeklyCapacity }] = await Promise.all([
    getWorkItemsForTeam(MVP_TEAM_ID),
    getTeamBufferAndCapacity(MVP_TEAM_ID),
  ]);

  const todayYmd = todayYmdInTz("Europe/Madrid");
  const viewStart = startOfIsoWeekUtc(ymdToUtcDate(todayYmd));
  const viewStartYmd = utcDateToYmd(viewStart);
  const viewEndYmd = utcDateToYmd(addDaysUtc(viewStart, 27));

  return (
    <main className="mx-auto max-w-6xl w-full py-[52px] px-4">
      <CommittedWorkHeader />

      <section className="space-y-4">
        <CommittedWorkList
          teamId={MVP_TEAM_ID}
          items={workItems}
          viewStartYmd={viewStartYmd}
          viewEndYmd={viewEndYmd}
          weeklyCapacityHours={weeklyCapacity}
        />
      </section>
    </main>
  );
}
