import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { requireFounderAuth } from '@/lib/founder-auth';
import { createTicket, getTicketsForUser } from '@/lib/support-tickets';
import { sql } from '@/lib/db';
import { supportTicketSchema, validateInput, sanitizeText } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await requireFounderAuth();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') || undefined;

    const result = await getTicketsForUser('FOUNDER', session.userId, page, limit, status);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    console.error('Error fetching support tickets:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch tickets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { success: withinLimit } = await checkRateLimit(apiRateLimit, getClientIdentifier(request));
  if (!withinLimit) return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });

  try {
    const session = await requireFounderAuth();
    const body = await request.json();
    const validation = validateInput(supportTicketSchema, body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }
    const validated = validation.data;

    const founders = await sql`SELECT id, email, name FROM "FounderUser" WHERE id = ${session.userId} LIMIT 1`;
    if (founders.length === 0) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    const founder = founders[0];

    const ticket = await createTicket({
      subject: sanitizeText(validated.subject),
      description: sanitizeText(validated.description),
      category: validated.category,
      priority: validated.priority,
      portal: 'FOUNDER',
      submitterType: 'FOUNDER',
      submitterId: session.userId,
      submitterEmail: founder.email as string,
      submitterName: founder.name as string,
    });

    return NextResponse.json({ success: true, ticket });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    console.error('Error creating support ticket:', error);
    return NextResponse.json({ success: false, error: 'Failed to create ticket' }, { status: 500 });
  }
}
