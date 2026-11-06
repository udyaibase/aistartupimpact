import { NextRequest, NextResponse } from 'next/server';
import { getEmployerSession } from '@/lib/employer-auth';
import { createTicket, getTicketsForUser } from '@/lib/support-tickets';
import { supportTicketSchema, validateInput, sanitizeText } from '@/lib/validation';
import { writeLimited } from '@/lib/employer/write-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getEmployerSession();
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

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
    const session = await getEmployerSession();
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

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
