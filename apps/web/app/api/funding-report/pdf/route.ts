import { NextRequest, NextResponse } from 'next/server';
import { buildFundingReportPdf, verifyReportToken } from '@/lib/funding/report';

export const dynamic = 'force-dynamic';

// The report changes only when funding data does; rebuild at most hourly per server instance.
let cache: { at: number; pdf: Uint8Array } | null = null;
const TTL = 60 * 60 * 1000;

/** GET ?t=<signed link from the email gate> → the funding report PDF. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t') ?? '';
  if (!verifyReportToken(token)) {
    return NextResponse.redirect(new URL('/funding?report=expired', request.url));
  }
  try {
    if (!cache || Date.now() - cache.at > TTL) cache = { at: Date.now(), pdf: await buildFundingReportPdf() };
    return new NextResponse(Buffer.from(cache.pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="udyaibase-ai-funding-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (err) {
    console.error('[funding-report/pdf]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not build the report. Try again shortly.' }, { status: 500 });
  }
}
