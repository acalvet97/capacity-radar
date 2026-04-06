import type { Metadata } from "next";
export const metadata: Metadata = { title: "Settings" };

import { getTeamBufferAndCapacity } from "@/lib/db/getTeamSettings";
import { getTeamMembers } from "@/lib/db/getTeamMembers";
import { getTeamIdForUser } from "@/lib/db/getTeamIdForUser";
import { TeamCapacitySection } from "./TeamCapacitySection";
import { ReservedCapacitySection } from "./ReservedCapacitySection";
import { PlanningModelSection } from "./PlanningModelSection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsPage() {
  const teamId = await getTeamIdForUser();

  const [members, { bufferHoursPerWeek, weeklyCapacity }] = await Promise.all([
    getTeamMembers(teamId),
    getTeamBufferAndCapacity(teamId),
  ]);

  const reservedEnabled = bufferHoursPerWeek > 0;
  const reservedHours = bufferHoursPerWeek;

  return (
    <div className="mx-auto max-w-6xl w-full py-[52px] px-4 space-y-10">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-normal">Settings</h1>
      </header>

      <section className="space-y-8">
        <TeamCapacitySection teamId={teamId} initialMembers={members} />
        <ReservedCapacitySection
          teamId={teamId}
          initialEnabled={reservedEnabled}
          initialHoursPerWeek={reservedHours}
          weeklyCapacity={weeklyCapacity}
        />
        <PlanningModelSection />
      </section>
    </div>
  );
}
