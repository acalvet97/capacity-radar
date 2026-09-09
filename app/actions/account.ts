'use server';

import { supabaseServer } from '@/lib/supabaseServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function updateDisplayName(displayName: string) {
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error('Display name cannot be empty.');
  if (trimmed.length > 50) throw new Error('Display name must be 50 characters or fewer.');

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({
    data: { display_name: trimmed },
  });
  if (error) throw new Error(error.message);
  revalidatePath('/account');
}

export async function updatePassword(currentPassword: string, newPassword: string) {
  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters.');
  }
  if (currentPassword === newPassword) {
    throw new Error('New password must be different from current password.');
  }

  const supabase = await supabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error('Not authenticated.');

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) throw new Error('Current password is incorrect.');

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function updateTeamName(teamId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Team name cannot be empty.');
  if (trimmed.length > 80) throw new Error('Team name must be 80 characters or fewer.');

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from('teams')
    .update({ name: trimmed })
    .eq('id', teamId);
  if (error) throw new Error(error.message);
  revalidatePath('/account');
  revalidatePath('/settings');
}

export async function deleteAccount() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  const admin = supabaseAdmin();

  const { data: teams } = await admin
    .from('teams')
    .select('id, company_id')
    .eq('owner_user_id', user.id);

  const teamIds = (teams ?? []).map((team) => team.id);
  const companyIds = [
    ...new Set(
      (teams ?? [])
        .map((team) => team.company_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  if (teamIds.length > 0) {
    // Children first, since they reference the team. They don't reference each
    // other, so they go out together instead of one table per team at a time.
    await Promise.all([
      admin.from('work_items').delete().in('team_id', teamIds),
      admin.from('team_members').delete().in('team_id', teamIds),
      admin.from('team_work_type_settings').delete().in('team_id', teamIds),
    ]);
    await admin.from('teams').delete().in('id', teamIds);
  }
  if (companyIds.length > 0) {
    await admin.from('companies').delete().in('id', companyIds);
  }

  await admin.auth.admin.deleteUser(user.id);

  redirect('/register');
}
