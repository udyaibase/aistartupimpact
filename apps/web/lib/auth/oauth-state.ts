import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { safeReturnPath } from '@/lib/safe-return';

/**
 * The `state` value for "Continue with Google".
 *
 * When sign-in starts we put a random value in a short-lived cookie and send the same value to Google. Google hands
 * it back, and we only accept the answer when the two match. Without this, another site could finish a Google
 * sign-in in someone's browser and leave them signed in to an account they didn't choose.
 *
 * The state also carries the page to return to, as `<random>.<base64url(path)>`.
 */

const COOKIE = 'oauth_state';
const MAX_AGE_SECONDS = 10 * 60;

/**
 * Call when starting sign-in. Send `state` to Google, then call `attach` on the redirect response to set the cookie.
 */
export function startOAuthState(returnTo: string | null, fallback: string): { state: string; attach: <T extends NextResponse>(response: T) => T } {
  const nonce = crypto.randomBytes(24).toString('base64url');
  return {
    state: `${nonce}.${Buffer.from(safeReturnPath(returnTo, fallback)).toString('base64url')}`,
    attach: (response) => {
      response.cookies.set(COOKIE, nonce, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // sent on the top-level redirect back from Google
        maxAge: MAX_AGE_SECONDS,
        path: '/',
      });
      return response;
    },
  };
}

/**
 * Call in the callback. Returns the page to go back to when the state matches this browser's cookie, otherwise null
 * (the sign-in must be refused). Always clear the cookie afterwards with `clearOAuthState`.
 */
export function readOAuthState(request: NextRequest, fallback: string): string | null {
  const state = request.nextUrl.searchParams.get('state') ?? '';
  const expected = request.cookies.get(COOKIE)?.value ?? '';
  const dot = state.indexOf('.');
  if (!expected || dot <= 0) return null;
  const given = Buffer.from(state.slice(0, dot));
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;
  let path = fallback;
  try { path = Buffer.from(state.slice(dot + 1), 'base64url').toString(); } catch { /* keep the fallback */ }
  return safeReturnPath(path, fallback);
}

export function clearOAuthState<T extends NextResponse>(response: T): T {
  response.cookies.delete(COOKIE);
  return response;
}
