import { cache } from 'react';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { ensurePersonalTeamForUser } from '@/lib/db/ensurePersonalTeamForUser';

export const getTeamIdForUser = cache(async (): Promise<string> => {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const team = await ensurePersonalTeamForUser(user);
  if (!team) throw new Error('No team found for user');
  return team.id;
});
