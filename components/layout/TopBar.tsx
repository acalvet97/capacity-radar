import { supabaseServer } from "@/lib/supabaseServer";
import { getTeamIdForUser } from "@/lib/db/getTeamIdForUser";
import { getTeamName } from "@/lib/db/getTeamName";
import { NotificationBell } from "./NotificationBell";
import { TopBarBreadcrumbs } from "./TopBarBreadcrumbs";

export async function TopBar() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  let initialNotifications: Parameters<typeof NotificationBell>[0]["initialNotifications"] = [];
  if (user) {
    const { data } = await supabase
      .from("notifications")
      .select("id, type, payload, created_at, read_at")
      .eq("user_id", user.id)
      .is("read_at", null)
      .order("created_at", { ascending: false });
    initialNotifications = (data ?? []) as typeof initialNotifications;
  }

  let teamName = "Team";
  try {
    const teamId = await getTeamIdForUser();
    teamName = await getTeamName(teamId);
  } catch {
    // fall back to default
  }

  return (
    <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-background px-8">
      <TopBarBreadcrumbs teamName={teamName} />
      <NotificationBell initialNotifications={initialNotifications} />
    </header>
  );
}
