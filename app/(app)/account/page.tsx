import { supabaseServer } from '@/lib/supabaseServer';
import { getTeamIdForUser } from '@/lib/db/getTeamIdForUser';
import { AccountClient } from '@/components/account/AccountClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AccountPage() {
  const supabase = await supabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await getTeamIdForUser();
  const { data: team } = await supabase
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .single();

  const displayName = user.user_metadata?.display_name ?? '';
  const email = user.email ?? '';
  const teamName = team?.name ?? '';

  return (
    <AccountClient
      displayName={displayName}
      email={email}
      teamName={teamName}
      teamId={teamId}
    />
  );
}
