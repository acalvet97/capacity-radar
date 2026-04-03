import { supabaseServer } from '@/lib/supabaseServer';

export async function getTeamIdForUser(): Promise<string> {
  const supabase = await supabaseServer();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id')
    .eq('owner_user_id', user.id)
    .single();

  if (teamError || !team) throw new Error('No team found for user');
  return team.id;
}
