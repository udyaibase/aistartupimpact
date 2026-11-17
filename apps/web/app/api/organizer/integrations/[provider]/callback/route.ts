import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/organizer-auth/require-permission';
import { isProvider } from '@/lib/integrations/providers';
import { readState, saveConnection } from '@/lib/integrations/meetings';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { maskEmail } from '@/lib/mask';
import { PROVIDER_LABEL } from '@/lib/integrations/providers';

export const dynamic = 'force-dynamic';

/** Zoom / Google send the host back here after they allow access. */
export async function GET(request: NextRequest, props: { params: Promise<{ provider: string }> }) {
  const { provider } = await props.params;
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/organizer/settings?${q}`, request.url));
    res.cookies.set('udy_int_state', '', { path: '/api/organizer/integrations', maxAge: 0 });
    return res;
  };
  if (!isProvider(provider)) return back('integration_error=unknown');
  const q = request.nextUrl.searchParams;
  if (q.get('error')) return back('integration_error=denied');
  const session = await requirePermission('settings');
  if (session instanceof NextResponse) return back('integration_error=permission');
  const st = readState(request.cookies.get('udy_int_state')?.value, q.get('state'), provider);
  // Same person and workspace that started it, or nothing is saved.
  if (!st || st.organizerId !== session.organizerId || st.personId !== session.id) return back('integration_error=expired');
  const code = q.get('code');
  if (!code || code.length > 2000) return back('integration_error=failed');
  let account: string | null = null;
  try {
    account = await saveConnection(session.organizerId, provider, code, session.id);
  } catch (e) {
    console.warn('[integrations] connect failed', provider, e instanceof Error ? e.message : e);
    return back('integration_error=failed');
  }
  await logOrganizerActivity(session.organizerId, 'integration_connected', {
    actor: organizerActor(session), request,
    metadata: { provider: PROVIDER_LABEL[provider], ...(account && { account: maskEmail(account) }) },
  });
  return back(`connected=${provider}`);
}
