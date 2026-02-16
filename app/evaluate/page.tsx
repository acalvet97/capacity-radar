// app/evaluate/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { EvaluateClient } from "@/components/evaluate/EvaluateClient";
import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { getDashboardSnapshotFromDb } from "@/lib/dashboardEngine";
import { todayYmdInTz, ymdToUtcDate, utcDateToYmd, startOfIsoWeekUtc, addDaysUtc } from "@/lib/dates";

type ViewKey = "month" | "4w" | "12w" | "quarter" | "6m";

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

function normalizeView(raw: unknown): ViewKey {
  const v =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
      ? raw[0]
      : "";

  if (v === "month" || v === "4w" || v === "12w" || v === "quarter" || v === "6m") return v;
  return "4w";
}

function weeksForView(view: ViewKey, todayYmd: string): { weeks: number } {
  if (view === "4w") return { weeks: 4 };
  if (view === "12w") return { weeks: 12 };
  if (view === "quarter") return { weeks: 13 };
  if (view === "6m") return { weeks: 26 };

  const monthEndYmd = lastDayOfMonthYmd(todayYmd);
  const endSundayYmd = utcDateToYmd(endOfIsoWeekUtc(ymdToUtcDate(monthEndYmd)));
  const weeks = weeksBetweenIsoWeeksInclusive(todayYmd, endSundayYmd);
  return { weeks };
}

export default async function EvaluatePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const view = normalizeView(searchParams?.view);
  const todayYmd = todayYmdInTz("Europe/Madrid");

  const { weeks } = weeksForView(view, todayYmd);

  const before = await getDashboardSnapshotFromDb(MVP_TEAM_ID, {
    startYmd: todayYmd,
    weeks,
    maxWeeks: 26,
    locale: "en-GB",
    tz: "Europe/Madrid",
  });

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Evaluate New Work</h1>
        <p className="text-sm text-muted-foreground">
          Live simulation based on your current plan. Commit work to include it.
        </p>
      </header>

      {/* ✅ remount on view changes */}
      <EvaluateClient key={view} before={before} view={view} />
    </main>
  );
}

