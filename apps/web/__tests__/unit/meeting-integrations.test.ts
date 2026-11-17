import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { prisma } = vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET ??= 'test-only-secret';
  process.env.ENCRYPTION_KEY ??= 'test-only-encryption-key-0123456789';
  const prisma = {
    organizerIntegration: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    event: { findUnique: vi.fn() },
  };
  return { prisma };
});
vi.mock('@udyaibase/database', () => ({ prisma }));

import { decryptToken, encryptToken } from '@/lib/integrations/crypto';
import { authorizeUrl, createMeeting, ReconnectNeeded, updateMeeting } from '@/lib/integrations/providers';
import { accessToken, makeState, readState, syncEventMeeting } from '@/lib/integrations/meetings';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  process.env.ZOOM_CLIENT_ID = 'zid';
  process.env.ZOOM_CLIENT_SECRET = 'zsecret';
  process.env.GOOGLE_MEET_CLIENT_ID = 'gid';
  process.env.GOOGLE_MEET_CLIENT_SECRET = 'gsecret';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://udyaibase.com';
});
afterEach(() => vi.unstubAllGlobals());
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const meeting = { title: 'AI Meetup', startAt: new Date('2026-12-01T13:30:00Z'), endAt: new Date('2026-12-01T15:00:00Z'), timezone: 'Asia/Kolkata' };

describe('token encryption', () => {
  it('round-trips, differs every time, and rejects tampering', () => {
    const a = encryptToken('secret-token');
    expect(a).not.toContain('secret-token');
    expect(encryptToken('secret-token')).not.toBe(a);
    expect(decryptToken(a)).toBe('secret-token');
    const parts = a.split('.');
    parts[3] = Buffer.from('other').toString('base64url');
    expect(() => decryptToken(parts.join('.'))).toThrow();
  });
});

describe('OAuth setup', () => {
  it('needs both client id and secret', () => {
    delete process.env.ZOOM_CLIENT_SECRET;
    expect(authorizeUrl('zoom', 's')).toBeNull();
  });
  it('Google asks only for calendar events, offline, to our callback', () => {
    const u = new URL(authorizeUrl('google', 'abc')!);
    expect(u.searchParams.get('scope')).toBe('openid email https://www.googleapis.com/auth/calendar.events');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('redirect_uri')).toBe('https://udyaibase.com/api/organizer/integrations/google/callback');
    expect(u.searchParams.get('state')).toBe('abc');
  });
  it('state is bound to the provider, workspace and person, and expires', () => {
    const { state, cookie } = makeState('zoom', 'org1', 'person1');
    expect(readState(cookie, state, 'zoom')).toEqual({ organizerId: 'org1', personId: 'person1' });
    expect(readState(cookie, state, 'google')).toBeNull();
    expect(readState(cookie, `${state.slice(0, -1)}x`, 'zoom')).toBeNull();
    expect(readState(cookie.replace('org1', 'org2'), state, 'zoom')).toBeNull();
    vi.useFakeTimers({ now: Date.now() + 16 * 60_000 });
    expect(readState(cookie, state, 'zoom')).toBeNull();
    vi.useRealTimers();
  });
});

describe('creating meetings', () => {
  it('Zoom: scheduled meeting with waiting room and the right length', async () => {
    fetchMock.mockResolvedValue(json(201, { id: 123, join_url: 'https://zoom.us/j/123' }));
    expect(await createMeeting('zoom', 'tok', meeting)).toEqual({ joinUrl: 'https://zoom.us/j/123', externalId: '123' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.zoom.us/v2/users/me/meetings');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ topic: 'AI Meetup', type: 2, duration: 90, timezone: 'Asia/Kolkata', settings: { waiting_room: true } });
    expect(init.headers.Authorization).toBe('Bearer tok');
  });
  it('Google: calendar event with a Meet conference, no invites sent', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'ev1', hangoutLink: 'https://meet.google.com/abc-defg-hij' }));
    expect(await createMeeting('google', 'tok', meeting)).toEqual({ joinUrl: 'https://meet.google.com/abc-defg-hij', externalId: 'ev1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('conferenceDataVersion=1');
    expect(url).toContain('sendUpdates=none');
    expect(JSON.parse(init.body).conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');
  });
  it('a 401 means the host must reconnect', async () => {
    fetchMock.mockResolvedValue(json(401, {}));
    await expect(updateMeeting('zoom', 'tok', '1', meeting)).rejects.toBeInstanceOf(ReconnectNeeded);
  });
});

describe('tokens', () => {
  it('uses a fresh token as is', async () => {
    prisma.organizerIntegration.findUnique.mockResolvedValue({ id: 'i1', accessTokenEnc: encryptToken('fresh'), refreshTokenEnc: null, expiresAt: new Date(Date.now() + 3600_000), needsReconnectAt: null });
    expect(await accessToken('org1', 'zoom')).toBe('fresh');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('refreshes an expiring token and keeps Zoom’s new refresh token', async () => {
    prisma.organizerIntegration.findUnique.mockResolvedValue({ id: 'i1', accessTokenEnc: encryptToken('old'), refreshTokenEnc: encryptToken('r1'), expiresAt: new Date(Date.now() + 10_000), needsReconnectAt: null });
    fetchMock.mockResolvedValue(json(200, { access_token: 'new', refresh_token: 'r2', expires_in: 3600 }));
    expect(await accessToken('org1', 'zoom')).toBe('new');
    const data = prisma.organizerIntegration.update.mock.calls[0][0].data;
    expect(decryptToken(data.accessTokenEnc)).toBe('new');
    expect(decryptToken(data.refreshTokenEnc)).toBe('r2');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toMatch(/^Basic /);
  });
  it('a refused refresh marks the connection for reconnecting', async () => {
    prisma.organizerIntegration.findUnique.mockResolvedValue({ id: 'i1', accessTokenEnc: encryptToken('old'), refreshTokenEnc: encryptToken('r1'), expiresAt: new Date(0), needsReconnectAt: null });
    fetchMock.mockResolvedValue(json(400, { error: 'invalid_grant' }));
    await expect(accessToken('org1', 'google')).rejects.toBeInstanceOf(ReconnectNeeded);
    expect(prisma.organizerIntegration.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { needsReconnectAt: expect.any(Date) } }));
  });
});

describe('keeping the meeting in step with the event', () => {
  it('moves the meeting to the event’s new time', async () => {
    prisma.event.findUnique.mockResolvedValue({ organizerId: 'org1', title: 'New title', startAt: meeting.startAt, endAt: meeting.endAt, timezone: 'Asia/Kolkata', meetingProvider: 'google', meetingExternalId: 'ev1', deletedAt: null });
    prisma.organizerIntegration.findUnique.mockResolvedValue({ id: 'i1', accessTokenEnc: encryptToken('tok'), refreshTokenEnc: null, expiresAt: null, needsReconnectAt: null });
    fetchMock.mockResolvedValue(json(200, {}));
    await syncEventMeeting('e1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events/ev1?sendUpdates=none');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body).summary).toBe('New title');
  });
  it('does nothing for a pasted link, and never throws', async () => {
    prisma.event.findUnique.mockResolvedValue({ organizerId: 'org1', meetingProvider: null, meetingExternalId: null, deletedAt: null });
    await expect(syncEventMeeting('e1')).resolves.toBeUndefined();
    prisma.event.findUnique.mockRejectedValue(new Error('db down'));
    await expect(syncEventMeeting('e1')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
