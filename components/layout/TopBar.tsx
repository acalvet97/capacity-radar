import { supabaseServer } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { getTeamIdForUser } from "@/lib/db/getTeamIdForUser";
import { getTeamName } from "@/lib/db/getTeamName";
import { NotificationBell } from "./NotificationBell";
import { TopBarBreadcrumbs } from "./TopBarBreadcrumbs";

type NotificationRows =
  Parameters<typeof NotificationBell>[0]["initialNotifications"];

async function loadUnreadNotifications(userId: string): Promise<NotificationRows> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, payload, created_at, read_at")
    .eq("user_id", userId)
    .is("read_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as NotificationRows;
}

async function loadTeamName(): Promise<string> {
  try {
    return await getTeamName(await getTeamIdForUser());
  } catch {
    return "Team";
  }
}

export async function TopBar() {
  const user = await getCurrentUser();

  const [initialNotifications, teamName] = await Promise.all([
    user ? loadUnreadNotifications(user.id) : ([] as NotificationRows),
    loadTeamName(),
  ]);

  return (
    <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-background px-8">
      <TopBarBreadcrumbs teamName={teamName} />
      <NotificationBell initialNotifications={initialNotifications} />
    </header>
  );
}
