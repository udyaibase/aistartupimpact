import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, apiRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { submitAssessment } from '@/lib/employer/assessments';

export const dynamic = 'force-dynamic';

/** The candidate hands in their work: multipart with link (repeatable), answer (repeatable, in question order), note and an optional file. */
export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { success } = await checkRateLimit(apiRateLimit, `assessment:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const { token } = await props.params;
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Couldn’t read the form.' }, { status: 400 });
  const f = form.get('file');
  const file = f && typeof f !== 'string' && f.size > 0 ? new Uint8Array(await f.arrayBuffer()) : null;
  const r = await submitAssessment(token, { links: form.getAll('link'), url: form.get('url'), answers: form.getAll('answer'), note: form.get('note'), file });
  return r.ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
