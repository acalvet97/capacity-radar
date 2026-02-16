import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { getTeamBufferAndCapacity } from "@/lib/db/getTeamSettings";
import { BufferForm } from "./BufferForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsPage() {
  const { bufferHoursPerWeek, weeklyCapacity } = await getTeamBufferAndCapacity(MVP_TEAM_ID);

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-10">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      </header>

      <section>
        <BufferForm initialBuffer={bufferHoursPerWeek} weeklyCapacity={weeklyCapacity} />
      </section>
    </main>
  );
}
