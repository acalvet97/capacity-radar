import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Request-scoped memo of the authenticated user. supabaseServer() builds a
 * fresh client per call and getUser() always round-trips to verify the JWT,
 * so the app layout, TopBar and getTeamIdForUser each paid their own trip in
 * one render.
 *
 * Returns null rather than throwing: call sites redirect, throw, return 401,
 * return an ActionResult, or fall back silently, and each keeps its own policy.
 *
 * Not for use where the session is mutated in the same request (login,
 * password change, account deletion) or from middleware -- those need to
 * observe their own writes on their own client.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
