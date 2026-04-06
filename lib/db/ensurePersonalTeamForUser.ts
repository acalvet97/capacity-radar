import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type OwnerTeamRow = {
  id: string;
  name: string | null;
  onboarding_completed: boolean;
};

/**
 * Read one owning team row bypassing RLS (server-only, after auth).
 * Uses a stable ordering + limit because duplicate rows for the same owner
 * can exist (retries / races); `.maybeSingle()` errors when multiple match.
 */
export async function getTeamRowForOwnerAdmin(
  userId: string
): Promise<OwnerTeamRow | null> {
  const admin = supabaseAdmin();
  const { data: rows, error } = await admin
    .from("teams")
    .select("id, name, onboarding_completed")
    .eq("owner_user_id", userId)
    .order("id", { ascending: true })
    .limit(1);

  if (error) {
    console.error("[getTeamRowForOwnerAdmin] select failed:", error.message);
    return null;
  }
  const row = rows?.[0];
  return row ? (row as OwnerTeamRow) : null;
}

/**
 * Ensures the user has a personal company + team row (owner). Idempotent.
 * Returns the team row using the service role so this works even when RLS
 * blocks direct `teams` reads for the authenticated user.
 */
export async function ensurePersonalTeamForUser(
  user: User
): Promise<OwnerTeamRow | null> {
  const existing = await getTeamRowForOwnerAdmin(user.id);
  if (existing) return existing;

  const teamName =
    (user.user_metadata?.team_name as string | undefined) ||
    (user.email ? user.email.split("@")[0] : "My Team");

  const today = new Date();
  const cycleEnd = new Date(today);
  cycleEnd.setDate(today.getDate() + 28);

  const admin = supabaseAdmin();

  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert({ name: teamName, owner_user_id: user.id, is_personal: true })
    .select("id")
    .single();

  if (companyError || !company) {
    console.error(
      "[ensurePersonalTeamForUser] company insert failed:",
      companyError?.message,
      companyError?.details,
      companyError?.hint
    );
    return (await getTeamRowForOwnerAdmin(user.id)) ?? null;
  }

  const { error: teamError } = await admin.from("teams").insert({
    name: teamName,
    owner_user_id: user.id,
    company_id: company.id,
    cycle_start_date: today.toISOString().split("T")[0],
    cycle_end_date: cycleEnd.toISOString().split("T")[0],
    buffer_hours_per_week: 0,
  });

  if (teamError) {
    console.error(
      "[ensurePersonalTeamForUser] team insert failed:",
      teamError.message,
      teamError.details,
      teamError.hint
    );
  }

  return (await getTeamRowForOwnerAdmin(user.id)) ?? null;
}
