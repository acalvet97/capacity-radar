import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { supabaseServer } from "@/lib/supabaseServer";
import { getTeamRowForOwnerAdmin } from "@/lib/db/ensurePersonalTeamForUser";
import { redirect } from "next/navigation";
import { AskKliraProvider } from "@/context/AskKliraContext";
import { getDefaultDashboardSnapshot } from "@/lib/dashboardEngine";
import { DEFAULT_TZ, todayYmdInTz } from "@/lib/dates";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  if (teamIdForSnapshot) {
    try {
      snapshot = await getDefaultDashboardSnapshot(teamIdForSnapshot, todayYmd);
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
