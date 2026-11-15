/**
 * Key for signing and verifying our JWTs, from an environment variable.
 *
 * An unset variable used to become an empty key, which jose accepts: anyone could then forge a session.
 * Now a missing secret gets a random key for this server instance instead, so tokens can't be forged; sign-ins
 * that depend on it stop working until the variable is set, and the error below says which one.
 * No Node imports: this also runs in middleware (edge runtime).
 */
const fallbackKeys = new Map<string, Uint8Array>();

export function jwtSecret(value: string | undefined, name: string): Uint8Array {
  if (value) return new TextEncoder().encode(value);
  let key = fallbackKeys.get(name);
  if (!key) {
    key = crypto.getRandomValues(new Uint8Array(32));
    fallbackKeys.set(name, key);
    console.error(`[security] ${name} is not set. Sessions that rely on it will not work until it is configured.`);
  }
  return key;
}

/** Names of required signing secrets that are missing (checked once at server start; see instrumentation.ts). */
export function missingSecrets(env: Record<string, string | undefined> = process.env): string[] {
  return ['USER_JWT_SECRET', 'FOUNDER_JWT_SECRET', 'EMPLOYER_JWT_SECRET', 'NEXTAUTH_SECRET'].filter((k) => !env[k]);
}
