import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { requireFounderAuth } from '@/lib/founder-auth';
import { addUserMessage } from '@/lib/support-tickets';
import { sql } from '@/lib/db';
import { supportMessageSchema, validateInput, sanitizeText } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { success: withinLimit } = await checkRateLimit(apiRateLimit, getClientIdentifier(request));
  if (!withinLimit) return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });

  const params = await props.params;
  try {
    const session = await requireFounderAuth();
    const reqBody = await request.json();
    const validation = validateInput(supportMessageSchema, { content: reqBody.body });
    if (!validation.success) return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    const body = sanitizeText(validation.data.content);

    const founders = await sql`SELECT name FROM "FounderUser" WHERE id = ${session.userId} LIMIT 1`;
    const name = founders.length > 0 ? (founders[0].name as string) : session.name;

    const message = await addUserMessage(params.id, 'FOUNDER', session.userId, name, body);
    if (!message) return NextResponse.json({ success: false, error: 'Ticket not found' }, { status: 404 });
    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    console.error('Error sending message:', error);
    return NextResponse.json({ success: false, error: 'Failed to send message' }, { status: 500 });
  }
}
