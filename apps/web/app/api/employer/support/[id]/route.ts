import { NextRequest, NextResponse } from 'next/server';
import { getTicketDetail } from '@/lib/support-tickets';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const guard = await employerApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    const ticket = await getTicketDetail(params.id, 'EMPLOYER', session.id);
    if (!ticket) return NextResponse.json({ success: false, error: 'Ticket not found' }, { status: 404 });
    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch ticket' }, { status: 500 });
  }
}
