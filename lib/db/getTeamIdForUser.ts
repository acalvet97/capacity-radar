import { cache } from 'react';
import { supabaseServer } from '@/lib/supabaseServer';
import { ensurePersonalTeamForUser } from '@/lib/db/ensurePersonalTeamForUser';

export const getTeamIdForUser = cache(async (): Promise<string> => {
  const supabase = await supabaseServer();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const team = await ensurePersonalTeamForUser(user);
  if (!team) throw new Error('No team found for user');
  return team.id;
});
