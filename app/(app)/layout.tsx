import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { supabaseServer } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";
import { AskKlyraProvider } from "@/context/AskKlyraContext";
import { getDashboardSnapshotFromDb } from "@/lib/dashboardEngine";
import { getTeamIdForUser } from "@/lib/db/getTeamIdForUser";
import { DEFAULT_TZ, todayYmdInTz } from "@/lib/dates";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: team } = await supabase
      .from("teams")
      .select("onboarding_completed")
      .eq("owner_user_id", user.id)
      .single();

    if (team && !team.onboarding_completed) {
      redirect("/onboarding");
    }
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
  try {
    const teamId = await getTeamIdForUser();
    snapshot = await getDashboardSnapshotFromDb(teamId, {
      startYmd: todayYmd,
      weeks: 26,
      maxWeeks: 26,
      locale: "en-GB",
      tz: DEFAULT_TZ,
    });
  } catch {
    // If snapshot fetch fails (e.g. during onboarding), render layout without modal
    snapshot = null;
  }

  return (
    <SidebarProvider>
      <AppSidebar
        user={{
          name: displayName,
          email,
          avatar,
        }}
      />
      <SidebarInset className="ml-[16rem] flex flex-col">
        <TopBar />
        <main className="min-h-0 flex-1">
          <AskKlyraProvider
            snapshot={snapshot}
            todayYmd={todayYmd}
            displayName={displayName}
          >
            {children}
          </AskKlyraProvider>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
