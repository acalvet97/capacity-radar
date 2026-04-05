'use server';

import { supabaseServer } from '@/lib/supabaseServer';
import { redirect } from 'next/navigation';

export async function register(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    throw new Error('All fields are required.');
  }
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const supabase = await supabaseServer();

  const { error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (authError) throw new Error(authError.message);

  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes('email not confirmed')) {
      redirect(`/verify-email?email=${encodeURIComponent(email)}`);
    }
    throw new Error(error.message);
  }

  redirect('/evaluate');
}

export async function logout() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestPasswordReset(formData: FormData) {
  const email = formData.get('email') as string;
  if (!email) throw new Error('Email is required.');
  const supabase = await supabaseServer();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });
  // No error thrown regardless of result — prevents email enumeration
}
