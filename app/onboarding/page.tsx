export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import { getTeamIdForUser } from "@/lib/db/getTeamIdForUser";
import { getTeamMembers } from "@/lib/db/getTeamMembers";
import { getTeamBufferAndCapacity } from "@/lib/db/getTeamSettings";
import { OnboardingWizard } from "./OnboardingWizard";

export default async function OnboardingPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, onboarding_completed")
    .eq("owner_user_id", user.id)
    .single();

  if (!team) redirect("/login");
  if (team.onboarding_completed) redirect("/dashboard");

  const teamId = team.id as string;
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
