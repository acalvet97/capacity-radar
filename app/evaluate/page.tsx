// app/evaluate/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { EvaluateClient } from "@/components/evaluate/EvaluateClient";
import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { getDashboardSnapshotFromDb } from "@/lib/dashboardEngine";
import { DEFAULT_TZ, todayYmdInTz } from "@/lib/dates";

export default async function EvaluatePage() {
  const todayYmd = todayYmdInTz(DEFAULT_TZ);

  const snapshot = await getDashboardSnapshotFromDb(MVP_TEAM_ID, {
    startYmd: todayYmd,
    weeks: 26,
    maxWeeks: 26,
    locale: "en-GB",
    tz: DEFAULT_TZ,
  });

  return (
    <div className="flex h-[calc(100svh-4.25rem)] min-h-0 min-w-0 w-full flex-col overflow-hidden pb-4 pt-0">
      <EvaluateClient snapshot={snapshot} todayYmd={todayYmd} />
    </div>
  );
}
