import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Checks for stale work items (deadline within 7 days, never updated since creation).
 * If found and no notification created today, inserts a new 'deadline_this_week' notification.
 * Called on every dashboard load.
 */
export async function checkAndCreateStalenessNotification(teamId: string): Promise<void> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const admin = supabaseAdmin();
  const today = new Date();
  const todayYmd = today.toISOString().split("T")[0];

  // 7 days from today
  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(today.getDate() + 7);
  const sevenDaysLaterYmd = sevenDaysLater.toISOString().split("T")[0];

  // Find work items with imminent deadlines that have never been edited
  const { data: staleItems, error: itemsError } = await admin
    .from("work_items")
    .select("id, deadline, created_at, updated_at")
    .eq("team_id", teamId)
    .gte("deadline", todayYmd)
    .lte("deadline", sevenDaysLaterYmd);

  if (itemsError || !staleItems || staleItems.length === 0) return;

  // Filter to items that have never been edited (updated_at === created_at)
  const untouchedItems = staleItems.filter(
    (item) => item.updated_at && item.created_at && item.updated_at === item.created_at
  );

  if (untouchedItems.length === 0) return;

  // Check if a notification of this type was already created today for this user
  const { data: existingToday } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", "deadline_this_week")
    .is("read_at", null)
    .gte("created_at", todayYmd + "T00:00:00Z")
    .lte("created_at", todayYmd + "T23:59:59Z")
    .limit(1);

  if (existingToday && existingToday.length > 0) return;

  // Insert notification
  const workItemIds = untouchedItems.map((i) => i.id);
  await admin.from("notifications").insert({
    user_id: user.id,
    type: "deadline_this_week",
    payload: {
      work_item_ids: workItemIds,
      count: workItemIds.length,
    },
  });
}
