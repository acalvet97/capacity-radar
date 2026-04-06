export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
export const metadata: Metadata = { title: "Get Started" };

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import { ensurePersonalTeamForUser } from "@/lib/db/ensurePersonalTeamForUser";
import { getTeamMembers } from "@/lib/db/getTeamMembers";
import { getTeamBufferAndCapacity } from "@/lib/db/getTeamSettings";
import { OnboardingWizard } from "./OnboardingWizard";

export default async function OnboardingPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const team = await ensurePersonalTeamForUser(user);

  if (!team) {
    throw new Error(
      "Could not create your workspace. Check server logs or try again later."
    );
  }
  if (team.onboarding_completed) redirect("/dashboard");

  const teamId = team.id;
  const [members, { bufferHoursPerWeek, weeklyCapacity }] = await Promise.all([
    getTeamMembers(teamId),
    getTeamBufferAndCapacity(teamId),
  ]);

  return (
    <OnboardingWizard
      teamId={teamId}
      initialTeamName={team.name ?? ""}
      initialMembers={members}
      initialBufferHoursPerWeek={bufferHoursPerWeek}
      initialWeeklyCapacity={weeklyCapacity}
    />
  );
}
