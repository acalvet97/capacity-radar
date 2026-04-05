'use client';

import { useState, useTransition } from 'react';
import { Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PASSWORD_RULES, PasswordRulesChecklist } from '@/components/auth/PasswordRulesChecklist';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  updateDisplayName,
  updatePassword,
  updateTeamName,
  deleteAccount,
} from '@/app/actions/account';

interface AccountClientProps {
  displayName: string;
  email: string;
  teamName: string;
  teamId: string;
}

function SectionCard({
  title,
  description,
  children,
  danger,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-card p-6 space-y-4 ${
        danger ? 'border-destructive/40' : ''
      }`}
    >
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <Separator />
      {children}
    </div>
  );
}

function InlineFeedback({ error, success }: { error: string | null; success: boolean }) {
  return (
    <>
      {success && (
        <p className="text-sm text-green-600 dark:text-green-500">Saved</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );
}

function ProfileSection({ displayName, email }: { displayName: string; email: string }) {
  const [name, setName] = useState(displayName);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSave() {
    if (!name.trim()) {
      setError('Display name cannot be empty.');
      return;
    }
    if (name.trim().length > 50) {
      setError('Display name must be 50 characters or fewer.');
      return;
    }
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        await updateDisplayName(name);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  }

  return (
    <SectionCard
      title="Profile"
      description="Update your display name shown across the app."
    >
      <div className="space-y-4 max-w-sm">
        <div className="space-y-1.5">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            maxLength={50}
            placeholder="Your name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="flex items-center gap-1.5">
            Email
            <span className="text-xs text-muted-foreground font-normal">(Read only)</span>
          </Label>
          <Input
            id="email"
            value={email}
            readOnly
            disabled
            className="text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground">
            To change your email address, contact support.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending} >
          {isPending ? 'Saving…' : 'Save profile'}
        </Button>
        <InlineFeedback error={error} success={success} />
      </div>
    </SectionCard>
  );
}

function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [newPasswordBlurred, setNewPasswordBlurred] = useState(false);

  const allRulesMet = PASSWORD_RULES.every((r) => r.test(newPassword));
  const newPasswordTouched = newPassword.length > 0;
  const confirmTouched = confirmPassword.length > 0;
  const passwordsMatch = newPassword === confirmPassword;

  function handleSave() {
    if (!allRulesMet) {
      setNewPasswordBlurred(true);
      setError('Please meet all password requirements.');
      return;
    }
    if (!passwordsMatch) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('New password must be different from current password.');
      return;
    }
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        await updatePassword(currentPassword, newPassword);
        setSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setNewPasswordBlurred(false);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  }

  return (
    <SectionCard title="Security" description="Change your account password.">
      <div className="space-y-4 max-w-sm">
        {/* Current password */}
        <div className="space-y-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <div className="relative">
            <Input
              id="current-password"
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={isPending}
              autoComplete="current-password"
              className="pr-9"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showCurrent ? 'Hide password' : 'Show password'}
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onBlur={() => { if (newPasswordTouched) setNewPasswordBlurred(true); }}
              disabled={isPending}
              autoComplete="new-password"
              className="pr-9"
              placeholder="Min. 8 characters"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowNew((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showNew ? 'Hide password' : 'Show password'}
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {newPasswordTouched && (
            <PasswordRulesChecklist password={newPassword} passwordBlurred={newPasswordBlurred} />
          )}
        </div>

        {/* Confirm new password */}
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <div className="relative">
            <Input
              id="confirm-password"
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isPending}
              autoComplete="new-password"
              placeholder="Re-enter your new password"
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
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? 'Updating…' : 'Update password'}
        </Button>
        {success && (
          <p className="text-sm text-green-600 dark:text-green-500">Password updated</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </SectionCard>
  );
}

function TeamSection({ teamName, teamId }: { teamName: string; teamId: string }) {
  const [name, setName] = useState(teamName);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSave() {
    if (!name.trim()) {
      setError('Team name cannot be empty.');
      return;
    }
    if (name.trim().length > 80) {
      setError('Team name must be 80 characters or fewer.');
      return;
    }
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        await updateTeamName(teamId, name);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  }

  return (
    <SectionCard title="Team" description="Update your team's display name.">
      <div className="space-y-4 max-w-sm">
        <div className="space-y-1.5">
          <Label htmlFor="team-name">Team name</Label>
          <Input
            id="team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            maxLength={80}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending} >
          {isPending ? 'Saving…' : 'Save team name'}
        </Button>
        <InlineFeedback error={error} success={success} />
      </div>
    </SectionCard>
  );
}

function PlanSection() {
  return (
    <SectionCard title="Plan" description="Your current subscription plan.">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge variant="secondary">Free beta</Badge>
          <span className="text-sm text-muted-foreground">
            You are on the free beta plan.
          </span>
        </div>
        <div className="space-y-2">
          <ComingSoonRow label="Billing information" />
          <ComingSoonRow label="Upgrade plan" />
        </div>
      </div>
    </SectionCard>
  );
}

function ComingSoonRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-dashed px-4 py-2.5 opacity-60">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge
        variant="outline"
        className="text-xs text-muted-foreground border-muted-foreground/30 pointer-events-none"
      >
        Coming soon
      </Badge>
    </div>
  );
}

function DangerZoneSection({ email }: { email: string }) {
  const [confirmEmail, setConfirmEmail] = useState('');
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteAccount();
      } catch {
        // deleteAccount redirects on success; errors here are unexpected
      }
    });
  }

  return (
    <div className="rounded-lg border border-destructive/40 bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-destructive">Danger zone</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Irreversible actions — proceed with caution.
        </p>
      </div>
      <Separator className="bg-destructive/20" />
      <div className="flex items-start justify-between gap-6">
        <p className="text-sm text-muted-foreground max-w-md">
          Permanently delete your account and all associated data including your team,
          members, and work items. This action cannot be undone.
        </p>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive hover:text-white dark:hover:text-white">
              Delete account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your account, team, and all work data. This
                cannot be undone. Type your email address to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              placeholder={email}
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              autoComplete="off"
              className="mt-2"
            />
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmEmail('')}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmEmail !== email || isPending}
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isPending ? 'Deleting…' : 'Delete my account'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export function AccountClient({ displayName, email, teamName, teamId }: AccountClientProps) {
  return (
    <div className="mx-auto max-w-2xl w-full py-[52px] px-4 space-y-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-normal">Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your profile, security, and team settings.
        </p>
      </header>

      <ProfileSection displayName={displayName} email={email} />
      <SecuritySection />
      <TeamSection teamName={teamName} teamId={teamId} />
      <PlanSection />
      <DangerZoneSection email={email} />
    </div>
  );
}
