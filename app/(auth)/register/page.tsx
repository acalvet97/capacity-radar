'use client';

import * as React from 'react';
import Link from 'next/link';
import { register } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

function normaliseRegisterError(msg: string): string {
  const lower = msg.toLowerCase();
  if (
    lower.includes('already registered') ||
    lower.includes('already exists') ||
    lower.includes('already been registered') ||
    lower.includes('email address is already')
  ) {
    return 'An account with this email already exists.';
  }
  return msg;
}

export default function RegisterPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    startTransition(async () => {
      try {
        await register(formData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong.';
        setError(normaliseRegisterError(msg));
      }
    });
  }

  return (
    <Card className="rounded-md">
      <CardHeader className="pb-4">
        <h2 className="text-lg font-semibold">Create your account</h2>
        <p className="text-sm text-muted-foreground">
          Set up your team and start planning capacity.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teamName">Team name</Label>
            <Input
              id="teamName"
              name="teamName"
              type="text"
              placeholder="e.g. Engineering"
              required
              disabled={isPending}
            />
          </div>
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
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Min. 8 characters"
              required
              disabled={isPending}
            />
          </div>
          <Button type="submit" className="w-full rounded-md" disabled={isPending}>
            {isPending ? 'Creating account…' : 'Create account'}
          </Button>
          {error && (
            <p className="text-sm text-rose-600 text-center">{error}</p>
          )}
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
