import { CheckCircle2, XCircle, Circle } from 'lucide-react';

export const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: 'At least 8 characters',  test: (v) => v.length >= 8 },
  { label: 'One uppercase letter',    test: (v) => /[A-Z]/.test(v) },
  { label: 'One lowercase letter',    test: (v) => /[a-z]/.test(v) },
  { label: 'One number',              test: (v) => /[0-9]/.test(v) },
  { label: 'One special character',   test: (v) => /[^A-Za-z0-9]/.test(v) },
];

type Props = {
  password: string;
  passwordBlurred: boolean;
};

export function PasswordRulesChecklist({ password, passwordBlurred }: Props) {
  const rulesStatus = PASSWORD_RULES.map((r) => ({ ...r, passed: r.test(password) }));

  return (
    <ul className="space-y-1 pt-1">
      {rulesStatus.map((rule) => {
        const showRed = !rule.passed && passwordBlurred;
        return (
          <li key={rule.label} className="flex items-center gap-1.5">
            {rule.passed ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            ) : showRed ? (
              <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            )}
            <span
              className={`text-xs ${
                rule.passed
                  ? 'text-emerald-600'
                  : showRed
                  ? 'text-rose-500'
                  : 'text-muted-foreground'
              }`}
            >
              {rule.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
