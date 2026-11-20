import { NextRequest, NextResponse } from 'next/server';
import { createTicket, getTicketsForUser } from '@/lib/support-tickets';
import { openEmployerTicket } from '@/lib/support/employer-tickets';
import { supportTicketSchema, validateInput, sanitizeText } from '@/lib/validation';
import { writeLimited } from '@/lib/employer/write-limit';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const guard = await employerApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') || undefined;

    const result = await getTicketsForUser('EMPLOYER', session.id, page, limit, status);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch tickets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const limited = await writeLimited(request, 'support');
  if (limited) return limited;
  try {
    const guard = await employerApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    const body = await request.json();
    const validation = validateInput(supportTicketSchema, body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }
    const validated = validation.data;
    // "Report a problem" from the Help page: a kind, plus where they were; gets the plan's reply-time promise.
    if (typeof body.kind === 'string') {
      const r = await openEmployerTicket({
        employerId: session.id, email: session.email, name: session.memberName || session.companyName, kind: body.kind,
        subject: sanitizeText(validated.subject), description: sanitizeText(validated.description), context: body.context, userAgent: request.headers.get('user-agent'),
      });
      return NextResponse.json({ success: true, ticket: r.ticket, promise: r.promise.text, dueAt: r.promise.guaranteed ? r.due.toISOString() : null });
    }
    const ticket = await createTicket({
      subject: sanitizeText(validated.subject),
      description: sanitizeText(validated.description),
      category: validated.category,
      priority: validated.priority,
      portal: 'EMPLOYER',
      submitterType: 'EMPLOYER',
      submitterId: session.id,
      submitterEmail: session.email,
      submitterName: session.companyName,
    });

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    console.error('Error creating support ticket:', error);
    return NextResponse.json({ success: false, error: 'Failed to create ticket' }, { status: 500 });
  }
}
