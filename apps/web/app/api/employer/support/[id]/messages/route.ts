import { NextRequest, NextResponse } from 'next/server';
import { addUserMessage } from '@/lib/support-tickets';
import { supportMessageSchema, validateInput, sanitizeText } from '@/lib/validation';
import { writeLimited } from '@/lib/employer/write-limit';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'support/[id]/messages');
  if (limited) return limited;
  const params = await props.params;
  try {
    const guard = await employerApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    const reqBody = await request.json();
    const validation = validateInput(supportMessageSchema, { content: reqBody.body });
    if (!validation.success) return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    const body = sanitizeText(validation.data.content);

    const message = await addUserMessage(params.id, 'EMPLOYER', session.id, session.companyName, body);
    if (!message) return NextResponse.json({ success: false, error: 'Ticket not found' }, { status: 404 });
    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json({ success: false, error: 'Failed to send message' }, { status: 500 });
  }
}
