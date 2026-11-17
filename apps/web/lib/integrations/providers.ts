/**
 * Zoom and Google Meet: OAuth settings and the meeting calls. Client ids and secrets come only from env:
 *   ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
 *   GOOGLE_MEET_CLIENT_ID, GOOGLE_MEET_CLIENT_SECRET (kept separate from sign-in: Meet needs its own redirect URI
 *   and Google's review of the calendar permission, so it stays hidden until set on purpose)
 * Redirect URI to register with each: {site}/api/organizer/integrations/{zoom|google}/callback
 */

export const PROVIDERS = ['zoom', 'google'] as const;
export type Provider = (typeof PROVIDERS)[number];
export const isProvider = (v: unknown): v is Provider => v === 'zoom' || v === 'google';
export const PROVIDER_LABEL: Record<Provider, string> = { zoom: 'Zoom', google: 'Google Meet' };

export type TokenSet = { accessToken: string; refreshToken: string | null; expiresAt: Date | null; scope: string | null };
export type MeetingInput = { title: string; description?: string; startAt: Date; endAt: Date; timezone: string };
export type Meeting = { joinUrl: string; externalId: string };

/** Thrown when the provider no longer accepts our tokens (revoked, expired refresh token). */
export class ReconnectNeeded extends Error {}

const TIMEOUT = 10_000;

export function credentials(p: Provider): { id: string; secret: string } | null {
  const id = p === 'zoom' ? process.env.ZOOM_CLIENT_ID : process.env.GOOGLE_MEET_CLIENT_ID;
  const secret = p === 'zoom' ? process.env.ZOOM_CLIENT_SECRET : process.env.GOOGLE_MEET_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
}
export const redirectUri = (p: Provider) => `${siteOrigin()}/api/organizer/integrations/${p}/callback`;

export function authorizeUrl(p: Provider, state: string): string | null {
  const c = credentials(p);
  if (!c) return null;
  if (p === 'zoom') {
    const u = new URL('https://zoom.us/oauth/authorize');
    u.search = new URLSearchParams({ response_type: 'code', client_id: c.id, redirect_uri: redirectUri(p), state }).toString();
    return u.toString();
  }
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({
    response_type: 'code', client_id: c.id, redirect_uri: redirectUri(p), state,
    // Only what's needed: create and edit the calendar events that carry the Meet link.
    scope: 'openid email https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
  }).toString();
  return u.toString();
}

async function tokenRequest(p: Provider, params: Record<string, string>): Promise<TokenSet> {
  const c = credentials(p);
  if (!c) throw new Error('Not configured');
  const url = p === 'zoom' ? 'https://zoom.us/oauth/token' : 'https://oauth2.googleapis.com/token';
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const body = new URLSearchParams(params);
  if (p === 'zoom') headers.Authorization = `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString('base64')}`;
  else { body.set('client_id', c.id); body.set('client_secret', c.secret); }
  const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT) });
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof d.access_token !== 'string') {
    if (d.error === 'invalid_grant' || res.status === 400 || res.status === 401) throw new ReconnectNeeded(String(d.error ?? res.status));
    throw new Error(`Token request failed (${res.status})`);
  }
  return {
    accessToken: d.access_token,
    refreshToken: typeof d.refresh_token === 'string' ? d.refresh_token : null,
    expiresAt: typeof d.expires_in === 'number' ? new Date(Date.now() + d.expires_in * 1000) : null,
    scope: typeof d.scope === 'string' ? d.scope : null,
  };
}

export const exchangeCode = (p: Provider, code: string) =>
  tokenRequest(p, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(p) });
export const refreshTokens = (p: Provider, refreshToken: string) =>
  tokenRequest(p, { grant_type: 'refresh_token', refresh_token: refreshToken });

async function api(p: Provider, token: string, method: string, url: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (res.status === 401) throw new ReconnectNeeded(`${p} 401`);
  if (res.status === 204) return {};
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${p} ${method} failed (${res.status})${typeof d.message === 'string' ? `: ${d.message.slice(0, 120)}` : ''}`);
  return d;
}

export async function accountEmail(p: Provider, token: string): Promise<string | null> {
  const d = await api(p, token, 'GET', p === 'zoom' ? 'https://api.zoom.us/v2/users/me' : 'https://openidconnect.googleapis.com/v1/userinfo').catch(() => ({}) as Record<string, unknown>);
  return typeof d.email === 'string' ? d.email : null;
}

const minutes = (m: MeetingInput) => Math.max(15, Math.min(24 * 60, Math.round((m.endAt.getTime() - m.startAt.getTime()) / 60_000)));
const zoomBody = (m: MeetingInput) => ({
  topic: m.title.slice(0, 200), type: 2, start_time: m.startAt.toISOString(), duration: minutes(m), timezone: m.timezone,
  agenda: (m.description ?? '').slice(0, 1900),
  settings: { join_before_host: false, waiting_room: true, mute_upon_entry: true },
});
const googleBody = (m: MeetingInput) => ({
  summary: m.title.slice(0, 200),
  description: m.description?.slice(0, 4000),
  start: { dateTime: m.startAt.toISOString(), timeZone: m.timezone },
  end: { dateTime: m.endAt.toISOString(), timeZone: m.timezone },
});

export async function createMeeting(p: Provider, token: string, m: MeetingInput): Promise<Meeting> {
  if (p === 'zoom') {
    const d = await api(p, token, 'POST', 'https://api.zoom.us/v2/users/me/meetings', zoomBody(m));
    if (typeof d.join_url !== 'string' || d.id === undefined) throw new Error('Zoom did not return a link');
    return { joinUrl: d.join_url, externalId: String(d.id) };
  }
  const d = await api(p, token, 'POST', 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none', {
    ...googleBody(m),
    conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
  });
  if (typeof d.hangoutLink !== 'string' || typeof d.id !== 'string') throw new Error('Google did not return a Meet link');
  return { joinUrl: d.hangoutLink, externalId: d.id };
}

/** Keep the meeting's time and title in step with the event. */
export async function updateMeeting(p: Provider, token: string, externalId: string, m: MeetingInput): Promise<void> {
  const id = encodeURIComponent(externalId);
  if (p === 'zoom') await api(p, token, 'PATCH', `https://api.zoom.us/v2/meetings/${id}`, zoomBody(m));
  else await api(p, token, 'PATCH', `https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}?sendUpdates=none`, googleBody(m));
}

/** Best effort: tell the provider to forget our access when the host disconnects. */
export async function revoke(p: Provider, token: string): Promise<void> {
  const c = credentials(p);
  if (!c) return;
  try {
    if (p === 'zoom') {
      await fetch('https://zoom.us/oauth/revoke', {
        method: 'POST', signal: AbortSignal.timeout(TIMEOUT),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString('base64')}` },
        body: new URLSearchParams({ token }),
      });
    } else {
      await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', signal: AbortSignal.timeout(TIMEOUT), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) });
    }
  } catch { /* the local record is removed either way */ }
}
