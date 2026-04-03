// app/(app)/evaluate/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { EvaluateClient } from "@/components/evaluate/EvaluateClient";
import { getDashboardSnapshotFromDb } from "@/lib/dashboardEngine";
import { DEFAULT_TZ, todayYmdInTz } from "@/lib/dates";
import { getTeamIdForUser } from "@/lib/db/getTeamIdForUser";
import { supabaseServer } from "@/lib/supabaseServer";

export default async function EvaluatePage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const displayName =
    user?.user_metadata?.display_name ||
    user?.email?.split("@")[0] ||
    "there";

  const teamId = await getTeamIdForUser();
  const todayYmd = todayYmdInTz(DEFAULT_TZ);

  const snapshot = await getDashboardSnapshotFromDb(teamId, {
    startYmd: todayYmd,
    weeks: 26,
    maxWeeks: 26,
    locale: "en-GB",
    tz: DEFAULT_TZ,
  });

  return (
    <div className="flex h-[calc(100svh-4.25rem)] min-h-0 min-w-0 w-full flex-col overflow-hidden pb-4 pt-0">
      <EvaluateClient snapshot={snapshot} todayYmd={todayYmd} displayName={displayName} />
    </div>
  );
}
