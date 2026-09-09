import type { Metadata } from "next";
export const metadata: Metadata = { title: "Account" };

import { getCurrentUser } from '@/lib/auth/currentUser';
import { ensurePersonalTeamForUser } from '@/lib/db/ensurePersonalTeamForUser';
import { AccountClient } from '@/components/account/AccountClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const team = await ensurePersonalTeamForUser(user);

  if (!team) {
    throw new Error('No team found for user');
  }

  const displayName = user.user_metadata?.display_name ?? '';
  const email = user.email ?? '';
  const teamName = team.name ?? '';
  const teamId = team.id;

  return (
    <AccountClient
      displayName={displayName}
      email={email}
      teamName={teamName}
      teamId={teamId}
    />
  );
}
