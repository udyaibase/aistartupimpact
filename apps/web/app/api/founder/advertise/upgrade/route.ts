import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { founderApi, tooMany } from '@/lib/founder/api-session';
import { founderWriteRateLimit } from '@/lib/rate-limit';
import {
  getEntitlements,
  isValidUpgrade,
  getUpgradePrice,
  calculateTotal,
  type PackageTier, selfServeAdsEnabled, SELF_SERVE_ADS_OFF,
} from '@/lib/advertise';

export const dynamic = 'force-dynamic';

// POST — upgrade current package to a higher tier
export async function POST(request: NextRequest) {
  if (!selfServeAdsEnabled()) return NextResponse.json(SELF_SERVE_ADS_OFF, { status: 503 });
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;
    const limited = await tooMany(founderWriteRateLimit, `ads:${session.userId}`);
    if (limited) return limited;

    const body = await request.json();
    const targetTier = body.tier as PackageTier;

    if (!targetTier || !['STARTER', 'GROWTH', 'PREMIUM'].includes(targetTier)) {
      return NextResponse.json({ success: false, error: 'Invalid target tier' }, { status: 400 });
    }

    const entitlements = await getEntitlements(session.userId);

    if (!entitlements.packageId) {
      return NextResponse.json({
        success: false,
        error: 'No active package to upgrade. Purchase a package first.',
      }, { status: 400 });
    }

    if (!isValidUpgrade(entitlements.tier, targetTier)) {
      return NextResponse.json({
        success: false,
        error: `Cannot upgrade from ${entitlements.tier} to ${targetTier}. You can only upgrade to a higher tier.`,
      }, { status: 400 });
    }

    const diffPaise = getUpgradePrice(entitlements.tier, targetTier);
    if (diffPaise <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid upgrade calculation' }, { status: 400 });
    }

    const pricing = calculateTotal(diffPaise);

    const Razorpay = (await import('razorpay')).default;
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ success: false, error: 'Payment service not configured' }, { status: 503 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const order = await razorpay.orders.create({
      amount: pricing.total,
      currency: 'INR',
      receipt: `adv_upg_${session.userId}_${Date.now()}`,
      notes: {
        founderId: session.userId,
        fromTier: entitlements.tier,
        toTier: targetTier,
        currentPackageId: entitlements.packageId,
        purpose: 'PACKAGE_UPGRADE',
      },
    });

    await prisma.advPayment.create({
      data: {
        founderId: session.userId,
        packageId: entitlements.packageId,
        purpose: 'PACKAGE_UPGRADE',
        amountPaise: pricing.amount,
        gstPaise: pricing.gst,
        totalPaise: pricing.total,
        razorpayOrderId: order.id,
        status: 'PENDING',
        metadata: {
          fromTier: entitlements.tier,
          toTier: targetTier,
          currentPackageId: entitlements.packageId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount: pricing.total,
      currency: 'INR',
      keyId,
      upgrade: {
        from: entitlements.tier,
        to: targetTier,
        priceDifference: pricing.amount,
        gst: pricing.gst,
        total: pricing.total,
      },
    });
  } catch (err) {
    console.error('[advertise/upgrade POST]', err);
    return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 });
  }
}
