import { NextRequest, NextResponse } from 'next/server';
import { getEmployerSession } from '@/lib/employer-auth';
import { addUserMessage } from '@/lib/support-tickets';
import { supportMessageSchema, validateInput, sanitizeText } from '@/lib/validation';
import { writeLimited } from '@/lib/employer/write-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'support/[id]/messages');
  if (limited) return limited;
  const params = await props.params;
  try {
    const session = await getEmployerSession();
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

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
