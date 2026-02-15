// app/evaluate/page.tsx
import { EvaluateClient } from "@/components/evaluate/EvaluateClient";
import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { getDashboardSnapshotFromDb } from "@/lib/dashboardEngine";

export default async function EvaluatePage() {
  const before = await getDashboardSnapshotFromDb(MVP_TEAM_ID);

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Evaluate New Work</h1>
        <p className="text-sm text-muted-foreground">
          Live simulation based on your current plan. Commit work to include it.
        </p>
      </header>

      <EvaluateClient before={before} />
    </main>
  );
}

