import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/register`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Middleware handles session refresh in Server Components
          }
        },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error('[auth/callback] exchangeCodeForSession error:', exchangeError.message);
    return NextResponse.redirect(`${origin}/register?error=verification_failed`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // Idempotent account setup — mirrors setupAccountAfterVerification
  const teamName =
    (user.user_metadata?.team_name as string | undefined) ||
    (user.email ? user.email.split('@')[0] : 'My Team');

  const admin = supabaseAdmin();

  const { data: existingTeam } = await admin
    .from('teams')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (!existingTeam) {
    const today = new Date();
    const cycleEnd = new Date(today);
    cycleEnd.setDate(today.getDate() + 28);

    const { data: company, error: companyError } = await admin
      .from('companies')
      .insert({ name: teamName, owner_user_id: user.id, is_personal: true })
      .select('id')
      .single();

    if (!companyError && company) {
      await admin.from('teams').insert({
        name: teamName,
        owner_user_id: user.id,
        company_id: company.id,
        cycle_start_date: today.toISOString().split('T')[0],
        cycle_end_date: cycleEnd.toISOString().split('T')[0],
        buffer_hours_per_week: 0,
      });
    }
  }

  return NextResponse.redirect(`${origin}/onboarding`);
}
