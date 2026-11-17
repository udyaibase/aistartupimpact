import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { decryptToken, encryptToken } from './crypto';
import {
  accountEmail, createMeeting, credentials, exchangeCode, PROVIDERS, ReconnectNeeded, refreshTokens, updateMeeting,
  type Meeting, type MeetingInput, type Provider, type TokenSet,
} from './providers';

/** Status of each provider for a workspace (never includes tokens). */
export async function integrationStatus(organizerId: string) {
  const rows = await prisma.organizerIntegration.findMany({ where: { organizerId }, select: { provider: true, accountEmail: true, needsReconnectAt: true, createdAt: true } });
  return PROVIDERS.map((p) => {
    const r = rows.find((x) => x.provider === p);
    return { provider: p, configured: !!credentials(p), connected: !!r && !r.needsReconnectAt, needsReconnect: !!r?.needsReconnectAt, accountEmail: r?.accountEmail ?? null, connectedAt: r?.createdAt ?? null };
  });
}

export async function saveConnection(organizerId: string, p: Provider, code: string, connectedBy: string) {
  const t = await exchangeCode(p, code);
  const email = await accountEmail(p, t.accessToken);
  const data = {
    accountEmail: email, accessTokenEnc: encryptToken(t.accessToken), refreshTokenEnc: t.refreshToken ? encryptToken(t.refreshToken) : null,
    expiresAt: t.expiresAt, scope: t.scope, needsReconnectAt: null, connectedBy,
  };
  await prisma.organizerIntegration.upsert({ where: { organizerId_provider: { organizerId, provider: p } }, create: { organizerId, provider: p, ...data }, update: data });
  return email;
}

/** A working access token, refreshed when it's about to expire. Marks the connection for reconnecting if refused. */
export async function accessToken(organizerId: string, p: Provider): Promise<string | null> {
  const row = await prisma.organizerIntegration.findUnique({ where: { organizerId_provider: { organizerId, provider: p } } });
  if (!row || row.needsReconnectAt) return null;
  if (!row.expiresAt || row.expiresAt.getTime() > Date.now() + 60_000) return decryptToken(row.accessTokenEnc);
  if (!row.refreshTokenEnc) { await markReconnect(organizerId, p); return null; }
  try {
    const t: TokenSet = await refreshTokens(p, decryptToken(row.refreshTokenEnc));
    await prisma.organizerIntegration.update({
      where: { id: row.id },
      // Zoom rotates refresh tokens; Google usually doesn't send a new one.
      data: { accessTokenEnc: encryptToken(t.accessToken), expiresAt: t.expiresAt, ...(t.refreshToken && { refreshTokenEnc: encryptToken(t.refreshToken) }) },
    });
    return t.accessToken;
  } catch (e) {
    if (e instanceof ReconnectNeeded) await markReconnect(organizerId, p);
    throw e;
  }
}

async function markReconnect(organizerId: string, p: Provider) {
  await prisma.organizerIntegration.updateMany({ where: { organizerId, provider: p }, data: { needsReconnectAt: new Date() } });
}

async function withToken<T>(organizerId: string, p: Provider, fn: (token: string) => Promise<T>): Promise<T> {
  const token = await accessToken(organizerId, p);
  if (!token) throw new ReconnectNeeded('not connected');
  try {
    return await fn(token);
  } catch (e) {
    if (e instanceof ReconnectNeeded) await markReconnect(organizerId, p);
    throw e;
  }
}

export const makeMeeting = (organizerId: string, p: Provider, m: MeetingInput): Promise<Meeting> =>
  withToken(organizerId, p, (t) => createMeeting(p, t, m));

/** After an event's time or title changes: move its meeting too. Never throws (the event save already succeeded). */
export async function syncEventMeeting(eventId: string): Promise<void> {
  try {
    const e = await prisma.event.findUnique({ where: { id: eventId }, select: { organizerId: true, title: true, startAt: true, endAt: true, timezone: true, meetingProvider: true, meetingExternalId: true, deletedAt: true } });
    if (!e || e.deletedAt || !e.meetingExternalId || (e.meetingProvider !== 'zoom' && e.meetingProvider !== 'google')) return;
    const p = e.meetingProvider;
    await withToken(e.organizerId, p, (t) => updateMeeting(p, t, e.meetingExternalId!, { title: e.title, startAt: e.startAt, endAt: e.endAt, timezone: e.timezone }));
  } catch (err) {
    console.warn('[meetings] sync failed', err instanceof Error ? err.message : err);
  }
}

// ── OAuth state: ties the callback to the person and workspace that started it ──
function stateSecret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('NEXTAUTH_SECRET is not set');
  return s;
}
export function makeState(p: Provider, organizerId: string, personId: string): { state: string; cookie: string } {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const payload = `${p}.${organizerId}.${personId}.${Date.now()}.${nonce}`;
  const sig = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return { state: nonce, cookie: `${payload}.${sig}` };
}
/** The cookie must be ours, under 15 minutes old, for this provider, and match the state Zoom/Google sent back. */
export function readState(cookie: string | undefined, state: string | null, p: Provider): { organizerId: string; personId: string } | null {
  if (!cookie || !state) return null;
  const parts = cookie.split('.');
  if (parts.length !== 6) return null;
  const [prov, organizerId, personId, at, nonce, sig] = parts;
  const expected = crypto.createHmac('sha256', stateSecret()).update(parts.slice(0, 5).join('.')).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (prov !== p || nonce.length !== state.length || !crypto.timingSafeEqual(Buffer.from(nonce), Buffer.from(state))) return null;
  if (Date.now() - Number(at) > 15 * 60_000) return null;
  return { organizerId, personId };
}
