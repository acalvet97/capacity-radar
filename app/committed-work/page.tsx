export const dynamic = "force-dynamic";
export const revalidate = 0;

import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { getWorkItemsForTeam } from "@/lib/db/getWorkItemsForTeam";
import { CommittedWorkList } from "./CommittedWorkList";

export const metadata = {
  title: "Committed Work",
  description: "List of committed work items, sortable by deadline or hours.",
};

export default async function CommittedWorkPage() {
  const workItems = await getWorkItemsForTeam(MVP_TEAM_ID);

  return (
    <main className="mx-auto max-w-6xl w-full py-[52px] px-4">
      <header className="mb-8">
        <h1 className="text-[2rem] font-semibold tracking-tight">
          Committed Work
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All work items for your team. Sort by closest deadline or by amount of
          hours.
        </p>
      </header>

      <section>
        <CommittedWorkList teamId={MVP_TEAM_ID} items={workItems} />
      </section>
    </main>
  );
}
