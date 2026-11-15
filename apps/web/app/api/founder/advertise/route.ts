import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getFounderSession } from '@/lib/founder-auth';
import {
  getEntitlements,
  PACKAGE_PRICES,
  calculateTotal,
  type PackageTier, selfServeAdsEnabled, SELF_SERVE_ADS_OFF,
} from '@/lib/advertise';

export const dynamic = 'force-dynamic';

// GET — return current entitlements + package info
export async function GET() {
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false }, { status: 401 });

    const entitlements = await getEntitlements(session.userId);

    return NextResponse.json({ success: true, entitlements });
  } catch (err) {
    console.error('[advertise GET]', err);
    return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 });
  }
}

// POST — purchase a new package (creates Razorpay order for paid tiers, or activates Free immediately)
export async function POST(request: NextRequest) {
  if (!selfServeAdsEnabled()) return NextResponse.json(SELF_SERVE_ADS_OFF, { status: 503 });
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const tier = body.tier as PackageTier;

    if (!tier || !['FREE', 'STARTER', 'GROWTH', 'PREMIUM'].includes(tier)) {
      return NextResponse.json({ success: false, error: 'Invalid package tier' }, { status: 400 });
    }

    // Check for existing active package
    const existing = await prisma.advPackage.findFirst({
      where: { founderId: session.userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
    });

    if (existing) {
      return NextResponse.json({
        success: false,
        error: 'You already have an active package. Use the upgrade endpoint instead.',
      }, { status: 409 });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 365);

    // Free tier — activate immediately, no payment
    if (tier === 'FREE') {
      const pkg = await prisma.advPackage.create({
        data: {
          founderId: session.userId,
          tier: 'FREE',
          status: 'ACTIVE',
          expiresAt,
        },
      });
      return NextResponse.json({ success: true, package: pkg, paymentRequired: false });
    }

    // Paid tier — create Razorpay order
    const Razorpay = (await import('razorpay')).default;
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ success: false, error: 'Payment service not configured' }, { status: 503 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const pricing = calculateTotal(PACKAGE_PRICES[tier]);

    const order = await razorpay.orders.create({
      amount: pricing.total,
      currency: 'INR',
      receipt: `adv_pkg_${session.userId}_${Date.now()}`,
      notes: {
        founderId: session.userId,
        tier,
        purpose: 'PACKAGE_PURCHASE',
      },
    });

    // Create package in PENDING state (not yet ACTIVE)
    const pkg = await prisma.advPackage.create({
      data: {
        founderId: session.userId,
        tier,
        status: 'CANCELLED',
        expiresAt,
      },
    });

    // Create payment record
    await prisma.advPayment.create({
      data: {
        founderId: session.userId,
        packageId: pkg.id,
        purpose: 'PACKAGE_PURCHASE',
        amountPaise: pricing.amount,
        gstPaise: pricing.gst,
        totalPaise: pricing.total,
        razorpayOrderId: order.id,
        status: 'PENDING',
        metadata: { tier },
      },
    });

    return NextResponse.json({
      success: true,
      paymentRequired: true,
      orderId: order.id,
      amount: pricing.total,
      currency: 'INR',
      packageId: pkg.id,
      keyId,
    });
  } catch (err) {
    console.error('[advertise POST]', err);
    return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 });
  }
}
