/**
 * Password rules for new passwords, shared by the form (live checklist) and the server (final say), so the
 * checklist never shows a tick the server would reject, or a cross it would accept.
 *
 * Policies:
 * - mixed (default): 8+ characters, upper and lower case, a number. What sign-up, reset and change-password already
 *   required across founders, employers, organizers and users, so it's the platform standard.
 * - strict: mixed plus a symbol (founder team invites, lib/password-validation).
 * - standard: 8+ characters, a letter and a number (kept for any lighter flow; not used by default).
 * Every policy also rejects the most common passwords and ones containing the email's name part (or the name).
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export type PasswordPolicy = 'standard' | 'mixed' | 'strict';

const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop',
  'iloveyou', 'admin123', 'welcome1', 'welcome123', 'abc12345', 'letmein1', 'india123', 'passw0rd', '11111111',
  'p@ssw0rd', 'p@ssword', 'password@123', 'Password@123'.toLowerCase(), 'abcd1234', 'test1234', 'pass1234', 'changeme',
]);

export type PasswordCheck = { id: string; label: string; ok: boolean };

export function passwordChecks(password: string, email?: string | null, policy: PasswordPolicy = 'mixed', name?: string | null): PasswordCheck[] {
  // Requests can carry anything; only strings count.
  const lower = String(password ?? '').toLowerCase();
  const local = (typeof email === 'string' ? email : '').split('@')[0]?.toLowerCase() ?? '';
  const nm = (typeof name === 'string' ? name : '').trim().toLowerCase();
  const personal = !!password && !COMMON.has(lower) && !(local.length >= 3 && lower.includes(local)) && !(nm.length >= 3 && lower.includes(nm));
  const length = { id: 'length', label: `At least ${PASSWORD_MIN} characters`, ok: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX };
  const personalCheck = { id: 'personal', label: name ? 'Not your name, email or a common password' : 'Not your email or a common password', ok: personal };
  if (policy === 'standard') {
    return [length, { id: 'mix', label: 'A letter and a number', ok: /[a-z]/i.test(password) && /\d/.test(password) }, personalCheck];
  }
  const checks = [
    length,
    { id: 'case', label: 'Upper and lower case letters', ok: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { id: 'number', label: 'A number', ok: /\d/.test(password) },
  ];
  if (policy === 'strict') checks.push({ id: 'symbol', label: 'A symbol (!@#$…)', ok: /[^A-Za-z0-9]/.test(password) });
  return [...checks, personalCheck];
}

/** Kept for the strict founder-team form. */
export function strictPasswordChecks(password: string, email?: string | null, name?: string | null): PasswordCheck[] {
  return passwordChecks(password, email, 'strict', name);
}

/** 0–4, for the strength bar: rules not yet met keep it low; length and variety push it up. */
export function passwordScore(password: string, email?: string | null, policy: PasswordPolicy = 'mixed', name?: string | null): number {
  if (!password) return 0;
  const checks = passwordChecks(password, email, policy, name);
  if (!checks.every((c) => c.ok)) return 1;
  let score = 2;
  if (password.length >= 12) score++;
  if (/[^a-z0-9]/i.test(password) && /[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  return Math.min(score, 4);
}

const PROBLEM: Record<string, string> = {
  length: `Use at least ${PASSWORD_MIN} characters.`,
  mix: 'Include at least one letter and one number.',
  case: 'Include both upper and lower case letters.',
  number: 'Include at least one number.',
  symbol: 'Include at least one symbol, like ! @ # or $.',
  personal: 'Choose a password that isn’t your name, your email or a common password.',
};

/** The first rule the password breaks, as a sentence, or null when it's fine. */
export function passwordProblem(password: string, email?: string | null, policy: PasswordPolicy = 'mixed', name?: string | null): string | null {
  if (typeof password !== 'string' || !password) return 'Enter a password.';
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  const failed = passwordChecks(password, email, policy, name).find((c) => !c.ok);
  return failed ? PROBLEM[failed.id] : null;
}
