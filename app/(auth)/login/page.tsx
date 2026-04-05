'use client';

import * as React from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { login } from '@/app/actions/auth';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function LoginPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [showPassword, setShowPassword] = React.useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await login(formData);
      } catch (err) {
        if (isRedirectError(err)) throw err;
        setError('Invalid email or password.');
      }
    });
  }

  return (
    <Card className="rounded-md">
      <CardHeader className="pb-4">
        <h2 className="text-lg font-semibold">Sign in</h2>
        <p className="text-sm text-muted-foreground">
          Enter your credentials to access your team.
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Your password"
                required
                disabled={isPending}
                className="pr-9"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Signing in…' : 'Sign in'}
          </Button>
          {error && (
            <p className="text-sm text-rose-600 text-center">{error}</p>
          )}
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          No account yet?{' '}
          <Link href="/register" className="text-foreground underline underline-offset-4">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
