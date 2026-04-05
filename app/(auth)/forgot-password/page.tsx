'use client';

import * as React from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { requestPasswordReset } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function ForgotPasswordPage() {
  const [isPending, startTransition] = React.useTransition();
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await requestPasswordReset(formData);
        setSubmitted(true);
      } catch {
        setError('Something went wrong. Please try again.');
      }
    });
  }

  if (submitted) {
    return (
      <Card className="rounded-md">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <MailCheck className="h-10 w-10 text-emerald-500" />
            <h2 className="text-lg font-semibold">Check your inbox</h2>
            <p className="text-sm text-muted-foreground">
              If an account exists for that email, we&apos;ve sent a password reset link.
              It may take a minute to arrive.
            </p>
            <Link
              href="/login"
              className="mt-2 text-sm text-foreground underline underline-offset-4"
            >
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-md">
      <CardHeader className="pb-4">
        <h2 className="text-lg font-semibold">Reset your password</h2>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com"
              required
              disabled={isPending}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Sending…' : 'Send reset link'}
          </Button>
          {error && (
            <p className="text-sm text-rose-600 text-center">{error}</p>
          )}
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
