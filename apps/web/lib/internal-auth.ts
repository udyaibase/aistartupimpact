import crypto from 'crypto';

/**
 * Server-to-server calls from the admin app (page refresh, credit notes): Bearer INTERNAL_API_SECRET,
 * set to the same value on both Vercel projects. Fails closed when unset.
 */
export function internalAuthorized(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  const given = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  return !!secret && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}
