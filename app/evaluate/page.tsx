// app/evaluate/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { EvaluateClient } from "@/components/evaluate/EvaluateClient";
import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { getDashboardSnapshotFromDb } from "@/lib/dashboardEngine";
import { recomputeSnapshot } from "@/lib/evaluateEngine";
import { DEFAULT_TZ, todayYmdInTz } from "@/lib/dates";
import { normalizeViewSearchParam, weeksForHorizonView } from "@/lib/horizonView";

export default async function EvaluatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = normalizeViewSearchParam(params?.view);
  const todayYmd = todayYmdInTz(DEFAULT_TZ);

  const before = await getDashboardSnapshotFromDb(MVP_TEAM_ID, {
    startYmd: todayYmd,
    weeks: 26,
    maxWeeks: 26,
    locale: "en-GB",
    tz: DEFAULT_TZ,
  });

  const weeks = weeksForHorizonView(view, todayYmd);
  const viewBefore = recomputeSnapshot(before, before.horizonWeeks.slice(0, weeks));

  return (
    <div className="mx-auto max-w-6xl py-[52px] px-4 space-y-10">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-normal">Albert</h1>
      </header>

      <EvaluateClient key={view} before={viewBefore} view={view} />
    </div>
  );
}
