import { supabaseServer } from '@/lib/supabaseServer';
import { ensurePersonalTeamForUser } from '@/lib/db/ensurePersonalTeamForUser';

export async function getTeamIdForUser(): Promise<string> {
  const supabase = await supabaseServer();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const team = await ensurePersonalTeamForUser(user);
  if (!team) throw new Error('No team found for user');
  return team.id;
}
