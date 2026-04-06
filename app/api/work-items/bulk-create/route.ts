import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamRowForOwnerAdmin } from "@/lib/db/ensurePersonalTeamForUser";
import { NextResponse } from "next/server";

type WorkItemInput = {
  name: string;
  estimated_hours: number | null;
  start_date: string | null;
  deadline: string | null;
};

type RequestBody = {
  items: WorkItemInput[];
  import_source: "ai" | "csv" | "manual";
};

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { items, import_source } = body;
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const team = await getTeamRowForOwnerAdmin(user.id);
  if (!team) {
    return NextResponse.json({ error: "No team found" }, { status: 400 });
  }

  const teamId = team.id;

  // Bulk insert work items
  if (items.length > 0) {
    const rows = items.map((item) => ({
      team_id: teamId,
      name: String(item.name ?? "Untitled").trim() || "Untitled",
      estimated_hours: item.estimated_hours ?? 0,
      start_date: item.start_date ?? null,
      deadline: item.deadline ?? null,
      import_source: import_source ?? "manual",
      allocation_mode: "even" as const,
    }));

    const { error: insertError } = await admin.from("work_items").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  // Mark onboarding as complete
  const { error: onboardingError } = await admin
    .from("teams")
    .update({ onboarding_completed: true })
    .eq("id", teamId);

  if (onboardingError) {
    return NextResponse.json({ error: onboardingError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: items.length });
}
