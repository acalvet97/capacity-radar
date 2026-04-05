'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PASSWORD_RULES, PasswordRulesChecklist } from '@/components/auth/PasswordRulesChecklist';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordBlurred, setPasswordBlurred] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sessionReady, setSessionReady] = React.useState(false);

  const allRulesMet = PASSWORD_RULES.every((r) => r.test(password));
  const passwordTouched = password.length > 0;
  const confirmTouched = confirmPassword.length > 0;
  const passwordsMatch = password === confirmPassword;

  // Wait for Supabase to exchange the recovery token from the URL hash
  React.useEffect(() => {
    const supabase = supabaseBrowser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!allRulesMet) {
      setPasswordBlurred(true);
      setError('Please meet all password requirements.');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setIsPending(true);
    const supabase = supabaseBrowser();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push('/login');
  }

  if (!sessionReady) {
    return (
      <Card className="rounded-md">
        <CardContent className="pt-6">
          <p className="py-6 text-center text-sm text-muted-foreground">
            Validating your reset link…
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-md">
      <CardHeader className="pb-4">
        <h2 className="text-lg font-semibold">Set a new password</h2>
        <p className="text-sm text-muted-foreground">
          Choose a strong password for your account.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* New password */}
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                required
                disabled={isPending}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => { if (passwordTouched) setPasswordBlurred(true); }}
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

            {/* Requirements checklist */}
            {passwordTouched && (
              <PasswordRulesChecklist password={password} passwordBlurred={passwordBlurred} />
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Re-enter your password"
                required
                disabled={isPending}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={
                  confirmTouched
                    ? passwordsMatch
                      ? 'border-emerald-500 pr-16 focus-visible:ring-emerald-500/30'
                      : 'border-rose-500 pr-16 focus-visible:ring-rose-500/30'
                    : 'pr-16'
                }
              />
              {confirmTouched && (
                <span className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2">
                  {passwordsMatch ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-500" />
                  )}
                </span>
              )}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmTouched && !passwordsMatch && (
              <p className="text-xs text-rose-500">Passwords do not match.</p>
            )}
            {confirmTouched && passwordsMatch && (
              <p className="text-xs text-emerald-600">Passwords match.</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full rounded-md"
            disabled={isPending || (confirmTouched && !passwordsMatch)}
          >
            {isPending ? 'Saving…' : 'Set new password'}
          </Button>

          {error && (
            <p className="text-sm text-rose-600 text-center">{error}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
