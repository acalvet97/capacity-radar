'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';

  const [isResending, setIsResending] = React.useState(false);
  const [resendMessage, setResendMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleResend() {
    setResendMessage(null);
    setError(null);
    setIsResending(true);

    const supabase = supabaseBrowser();
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setIsResending(false);

    if (resendError) {
      setError(
        resendError.message.toLowerCase().includes('rate')
          ? 'Too many requests — please wait a few minutes before trying again.'
          : resendError.message
      );
    } else {
      setResendMessage('New link sent — check your inbox.');
    }
  }

  return (
    <Card className="rounded-md">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <MailCheck className="h-10 w-10 text-emerald-500" />
          <h2 className="text-lg font-semibold">Check your inbox</h2>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to{' '}
            <span className="font-medium text-foreground">{email}</span>.
            Click the link in the email to verify your account.
          </p>
          <p className="text-xs text-muted-foreground">
            The link opens in a new tab — you can close this page once verified.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {resendMessage ? (
            <p className="text-center text-sm text-emerald-600">{resendMessage}</p>
          ) : (
            <Button
              variant="outline"
              className="w-full rounded-md"
              onClick={handleResend}
              disabled={isResending}
            >
              {isResending ? 'Sending…' : "Didn't receive it? Resend link"}
            </Button>
          )}

          {error && (
            <p className="text-center text-sm text-rose-600">{error}</p>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Wrong email?{' '}
            <Link href="/register" className="text-foreground underline underline-offset-4">
              Start over
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense
      fallback={
        <Card className="rounded-md">
          <CardContent className="flex min-h-[200px] items-center justify-center pt-6">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </CardContent>
        </Card>
      }
    >
      <VerifyEmailContent />
    </React.Suspense>
  );
}
