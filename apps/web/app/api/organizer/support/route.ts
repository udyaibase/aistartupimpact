import { NextRequest, NextResponse } from 'next/server';
import { getOrganizerSession } from '@/lib/organizer-auth';
import { createTicket, getTicketsForUser } from '@/lib/support-tickets';
import { supportTicketSchema, validateInput, sanitizeText } from '@/lib/validation';
import { apiRateLimit, checkRateLimit, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getOrganizerSession();
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
    const status = searchParams.get('status') || undefined;

    const result = await getTicketsForUser('ORGANIZER', session.id, page, limit, status);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch tickets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getOrganizerSession();
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { success: allowed, reset } = await checkRateLimit(apiRateLimit, `organizer-support:${session.id}`);
    if (!allowed) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });
    const body = await request.json();
    const validation = validateInput(supportTicketSchema, body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }
    const validated = validation.data;
    const ticket = await createTicket({
      subject: sanitizeText(validated.subject),
      description: sanitizeText(validated.description),
      category: validated.category,
      priority: validated.priority,
      portal: 'ORGANIZER',
      submitterType: 'ORGANIZER',
      submitterId: session.id,
      submitterEmail: session.email,
      submitterName: session.name,
    });

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    console.error('Error creating support ticket:', error);
    return NextResponse.json({ success: false, error: 'Failed to create ticket' }, { status: 500 });
  }
}
