import { NextRequest, NextResponse } from 'next/server';
import { founderApi } from '@/lib/founder/api-session';
import { getTicketDetail } from '@/lib/support-tickets';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;
    const ticket = await getTicketDetail(params.id, 'FOUNDER', session.userId);
    if (!ticket) return NextResponse.json({ success: false, error: 'Ticket not found' }, { status: 404 });
    return NextResponse.json({ success: true, ticket });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    console.error('Error fetching ticket:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch ticket' }, { status: 500 });
  }
}
