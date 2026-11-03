import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { checkRateLimit, strictRateLimit } from '@/lib/rate-limit';
import { verifyPurchaseToken } from '@/lib/funding/access';
import { loadDataset, selectStartups } from '@/lib/funding/dataset';
import { buildFundingWorkbook } from '@/lib/funding/workbook';
import { isPackKey, PACKS, parseFilters } from '@/lib/funding/packs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const back = (request: NextRequest, reason: string) => NextResponse.redirect(new URL(`/funding?data=${reason}`, request.url));

/**
 * GET ?t=<signed purchase link> → the Excel file, built from the latest data with the buyer's saved choices.
 * Works only while the purchase is paid, not refunded and inside its access window, up to the pack's download count.
 */
export async function GET(request: NextRequest) {
  const id = verifyPurchaseToken(request.nextUrl.searchParams.get('t'));
  if (!id) return back(request, 'invalid');
  const p = await prisma.fundingDataPurchase.findUnique({ where: { id } });
  if (!p || p.status !== 'SUCCESS' || !isPackKey(p.pack)) return back(request, 'invalid');
  if (p.refundedAt) return back(request, 'refunded');
  if (!p.accessExpiresAt || p.accessExpiresAt < new Date()) return back(request, 'expired');

  const pack = PACKS[p.pack];
  const { success } = await checkRateLimit(strictRateLimit, `funding-download:${p.id}`);
  if (!success) return NextResponse.json({ error: 'You’ve downloaded this a few times in the last hour. Try again later.' }, { status: 429 });
  // Count first (atomically, so parallel clicks can't exceed the limit); handed back if the build fails.
  const counted = await prisma.fundingDataPurchase.updateMany({
    where: { id: p.id, downloadCount: { lt: pack.downloads } },
    data: { downloadCount: { increment: 1 }, lastDownloadAt: new Date() },
  });
  if (!counted.count) return back(request, 'limit');

  try {
    const filters = parseFilters(p.filters);
    const { matched, startups } = selectStartups(await loadDataset(), filters, p.startupLimit, { ignoreFilters: p.pack === 'FULL' });
    const file = await buildFundingWorkbook({ startups, matched, filters, pack: p.pack, email: p.email, orderId: p.id });
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="udyaibase-funding-${pack.key.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (err) {
    await prisma.fundingDataPurchase.update({ where: { id: p.id }, data: { downloadCount: { decrement: 1 } } }).catch(() => {});
    console.error('[funding-data/download]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not build the file. Try again shortly.' }, { status: 500 });
  }
}
