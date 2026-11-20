/**
 * Settings the hiring product needs in production, and what quietly goes wrong without each one.
 *
 * None of these stop the server from starting, and several fail silently: without TURNSTILE_SECRET_KEY the "are you
 * human" check passes for everyone; without the Upstash pair every rate-limited request is refused, sign-in included.
 * So they are checked once at server start (instrumentation.ts) and reported loudly. Names only, never values.
 * No Node imports: safe to load anywhere.
 */
export const HIRING_SETTINGS: { keys: string[]; without: string }[] = [
  { keys: ['TURNSTILE_SECRET_KEY', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'], without: 'the human check on sign-in codes, signup and applying passes for everyone' },
  { keys: ['OTP_HASH_SECRET'], without: 'sign-in and confirmation codes cannot be sent or checked' },
  { keys: ['EMPLOYER_JWT_SECRET'], without: 'hiring sessions fall back to a key derived from USER_JWT_SECRET' },
  { keys: ['APPLY_SESSION_SECRET'], without: 'candidates cannot upload a resume or apply' },
  { keys: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'], without: 'every rate-limited request is refused, including sign-in and applying' },
  { keys: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_RESUMES_BUCKET'], without: 'resume uploads are refused' },
  { keys: ['RESEND_API_KEY'], without: 'no email is sent: sign-in codes, application receipts, stage emails' },
  { keys: ['INTERNAL_API_SECRET'], without: 'the admin app cannot pass or fail a company check' },
  { keys: ['NEXT_PUBLIC_SITE_URL'], without: 'links in emails and the widget snippet point at the default address' },
];

/** One line per group with something missing: which names, and the consequence. Empty when all are set. */
export function hiringSettingProblems(env: Record<string, string | undefined> = process.env): string[] {
  return HIRING_SETTINGS
    .map((g) => ({ missing: g.keys.filter((k) => !env[k]?.trim()), without: g.without }))
    .filter((g) => g.missing.length)
    .map((g) => `${g.missing.join(', ')} not set: ${g.without}`);
}
