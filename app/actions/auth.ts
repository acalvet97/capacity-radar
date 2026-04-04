'use server';

import { supabaseServer } from '@/lib/supabaseServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { redirect } from 'next/navigation';

export async function register(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const teamName = formData.get('teamName') as string;

  if (!email || !password || !teamName) {
    throw new Error('All fields are required.');
  }
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const supabase = await supabaseServer();

  // 1. Create auth user — uses cookie client so the session is set automatically
  const { data: authData, error: authError } =
    await supabase.auth.signUp({ email, password });
  if (authError) throw new Error(authError.message);
  const userId = authData.user?.id;
  if (!userId) throw new Error('User creation failed.');

  // 2. Use admin client for DB inserts — bypasses RLS safely
  //    since this is trusted server-side code
  const admin = supabaseAdmin();

  // 3. Create personal company
  const { data: company, error: companyError } = await admin
    .from('companies')
    .insert({ name: teamName, owner_user_id: userId, is_personal: true })
    .select('id')
    .single();
  if (companyError) throw new Error(companyError.message);

  // 4. Create team
  const today = new Date();
  const cycleEnd = new Date(today);
  cycleEnd.setDate(today.getDate() + 28);

  const { error: teamError } = await admin
    .from('teams')
    .insert({
      name: teamName,
      owner_user_id: userId,
      company_id: company.id,
      cycle_start_date: today.toISOString().split('T')[0],
      cycle_end_date: cycleEnd.toISOString().split('T')[0],
      buffer_hours_per_week: 0,
    });
  if (teamError) throw new Error(teamError.message);

  redirect('/onboarding');
}

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  redirect('/evaluate');
}

export async function logout() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}
