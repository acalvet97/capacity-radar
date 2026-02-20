import { MVP_TEAM_ID } from "@/lib/mvpTeam";
import { getTeamBufferAndCapacity } from "@/lib/db/getTeamSettings";
import { getTeamMembers } from "@/lib/db/getTeamMembers";
import { TeamCapacitySection } from "./TeamCapacitySection";
import { ReservedCapacitySection } from "./ReservedCapacitySection";
import { PlanningModelSection } from "./PlanningModelSection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsPage() {
  const [members, { bufferHoursPerWeek, weeklyCapacity }] = await Promise.all([
    getTeamMembers(MVP_TEAM_ID),
    getTeamBufferAndCapacity(MVP_TEAM_ID),
  ]);

  const reservedEnabled = bufferHoursPerWeek > 0;
  const reservedHours = bufferHoursPerWeek;

  return (
    <main className="mx-auto max-w-6xl w-full py-[52px] px-4 space-y-10">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-normal">Settings</h1>
      </header>

      <section className="space-y-8">
        <TeamCapacitySection initialMembers={members} />
        <ReservedCapacitySection
          initialEnabled={reservedEnabled}
          initialHoursPerWeek={reservedHours}
          weeklyCapacity={weeklyCapacity}
        />
        <PlanningModelSection />
      </section>
    </main>
  );
}
