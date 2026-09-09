import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { getTeamRowForOwnerAdmin } from "@/lib/db/ensurePersonalTeamForUser";
import { redirect } from "next/navigation";
import { AskKliraProvider } from "@/context/AskKliraContext";
import { getDefaultDashboardSnapshot } from "@/lib/dashboardEngine";
import { getTeamMembers, type TeamMemberRow } from "@/lib/db/getTeamMembers";
import { getWorkItemsForTeam, type WorkItemRow } from "@/lib/db/getWorkItemsForTeam";
import { DEFAULT_TZ, todayYmdInTz } from "@/lib/dates";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  let teamIdForSnapshot: string | null = null;
  if (user) {
    const team = await getTeamRowForOwnerAdmin(user.id);

    if (!team || !team.onboarding_completed) {
      redirect("/onboarding");
    }
    teamIdForSnapshot = team.id;
  }

  const displayName =
    user?.user_metadata?.display_name ||
    user?.email?.split("@")[0] ||
    "User";
  const email = user?.email ?? "";
  const avatarRaw = user?.user_metadata?.avatar_url;
  const avatar =
    typeof avatarRaw === "string" && avatarRaw.trim() ? avatarRaw.trim() : null;

  const todayYmd = todayYmdInTz(DEFAULT_TZ);
  let snapshot;
  let teamMembers: TeamMemberRow[] = [];
  let workItems: WorkItemRow[] = [];
  if (teamIdForSnapshot) {
    try {
      [snapshot, teamMembers, workItems] = await Promise.all([
        getDefaultDashboardSnapshot(teamIdForSnapshot, todayYmd),
        getTeamMembers(teamIdForSnapshot),
        getWorkItemsForTeam(teamIdForSnapshot),
      ]);
    } catch {
      // If snapshot fetch fails (e.g. during onboarding), render layout without modal
      snapshot = null;
    }
  } else {
    snapshot = null;
  }

  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      <AppSidebar
        user={{
          name: displayName,
          email,
          avatar,
        }}
      />
      <SidebarInset className="ml-[16rem] flex min-h-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <AskKliraProvider
            snapshot={snapshot}
            teamMembers={teamMembers}
            workItems={workItems}
            todayYmd={todayYmd}
            displayName={displayName}
          >
            {children}
          </AskKliraProvider>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
