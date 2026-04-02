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
    <div className="mx-auto px-4 pb-4 pt-0">
      <EvaluateClient snapshot={snapshot} todayYmd={todayYmd} />
    </div>
  );
}
