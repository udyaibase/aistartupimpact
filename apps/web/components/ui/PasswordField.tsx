'use client';

import { forwardRef, useId, useState } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { passwordChecks, passwordScore, type PasswordPolicy } from '@/lib/password-rules';

const STRENGTH = [
  { label: '', bar: 'bg-gray-200 dark:bg-gray-700', text: 'text-gray-500' },
  { label: 'Too weak', bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  { label: 'Fair', bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
  { label: 'Good', bar: 'bg-lime-500', text: 'text-lime-700 dark:text-lime-400' },
  { label: 'Strong', bar: 'bg-green-600', text: 'text-green-700 dark:text-green-400' },
];

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** New password: show the strength bar and rule checklist. */
  showRules?: boolean;
  /** Used to warn when the password contains the email. */
  email?: string | null;
  error?: string | null;
  hint?: React.ReactNode;
  /** Which rules the checklist shows; must match what the endpoint enforces. */
  policy?: PasswordPolicy;
  /** Used by the strict policy to warn when the password contains the person's name. */
  personName?: string | null;
  /** Keep the label for screen readers only (compact forms that show a placeholder instead). */
  hideLabel?: boolean;
};

/**
 * Password input with a show/hide toggle (keeps focus and cursor), optional strength bar and live rule checklist,
 * caps-lock warning, and labels wired for screen readers and password managers.
 */
const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField(
  { label, value, onChange, showRules = false, email, error, hint, policy = 'mixed', personName, hideLabel = false, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `pw-${autoId}`;
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const checks = showRules ? passwordChecks(value, email, policy, personName) : [];
  const score = showRules ? passwordScore(value, email, policy, personName) : 0;
  const describedBy = [error ? `${inputId}-error` : '', showRules ? `${inputId}-rules` : '', hint ? `${inputId}-hint` : ''].filter(Boolean).join(' ') || undefined;

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  return (
    <div className={className}>
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : 'block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5'}>{label}</label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onKeyUp={onKey}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className={`w-full h-11 pl-3.5 pr-11 rounded-md border bg-white dark:bg-gray-900 text-base sm:text-[15px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-shadow ${
            error ? 'border-red-400 focus:ring-red-500/20' : 'border-gray-300 dark:border-gray-700 focus:border-gray-900 dark:focus:border-gray-400 focus:ring-gray-900/10 dark:focus:ring-white/20'
          }`}
          {...rest}
          placeholder={rest.placeholder ?? (rest.autoComplete === 'new-password' ? 'At least 8 characters' : 'Enter your password')}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          onMouseDown={(e) => e.preventDefault() /* keep focus in the input */}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          aria-controls={inputId}
          className="absolute inset-y-0 right-0 w-11 inline-flex items-center justify-center rounded-r-md text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
        >
          {visible ? <EyeOff className="w-[18px] h-[18px]" aria-hidden /> : <Eye className="w-[18px] h-[18px]" aria-hidden />}
        </button>
      </div>

      {capsLock && <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">Caps Lock is on</p>}
      {hint && <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      {error && <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {showRules && (
        <div id={`${inputId}-rules`} className="mt-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 grid grid-cols-4 gap-1" aria-hidden>
              {[1, 2, 3, 4].map((n) => (
                <span key={n} className={`h-1.5 rounded-full transition-colors duration-300 ${value && score >= n ? STRENGTH[score].bar : 'bg-gray-200 dark:bg-gray-700'}`} />
              ))}
            </div>
            <span className={`text-xs font-semibold min-w-[4.5rem] text-right ${STRENGTH[value ? score : 0].text}`} aria-live="polite">
              {value ? STRENGTH[score].label : ''}
            </span>
          </div>
          <ul className="mt-2.5 space-y-1">
            {checks.map((c) => (
              <li key={c.id} className={`flex items-center gap-2 text-xs ${c.ok ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {c.ok ? <Check className="w-3.5 h-3.5" aria-hidden /> : <X className="w-3.5 h-3.5 opacity-60" aria-hidden />}
                <span>{c.label}<span className="sr-only">{c.ok ? ' (done)' : ' (not yet)'}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

export default PasswordField;
