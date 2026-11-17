import { NextRequest, NextResponse } from 'next/server';
import { certificateByCode } from '@/lib/events/certificates';
import { renderCertificatePdf } from '@/lib/events/certificate-pdf';
import { apiRateLimit, checkRateLimit, getClientIdentifier, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** The certificate as a PDF. The code is the key: random and unguessable, it's only in the attendee's email. */
export async function GET(request: NextRequest, props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const { success, reset } = await checkRateLimit(apiRateLimit, `certificate-pdf:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });
  const c = await certificateByCode(code);
  if (!c || c.revoked) return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 });
  const pdf = await renderCertificatePdf(c.pdf);
  const file = `certificate-${c.recipientName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'udyaibase'}.pdf`;
  const download = request.nextUrl.searchParams.get('download') === '1';
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${file}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  });
}
