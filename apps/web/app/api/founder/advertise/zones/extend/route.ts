import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { founderApi, tooMany } from '@/lib/founder/api-session';
import { founderWriteRateLimit } from '@/lib/rate-limit';
import {
  calculateExtensionCost,
  ZONE_EXTENSION_RATES,
  getZoneTier,
  type AdvZoneSlot, selfServeAdsEnabled, SELF_SERVE_ADS_OFF,
} from '@/lib/advertise';

export const dynamic = 'force-dynamic';

// POST — extend a zone beyond 3 free days (creates Razorpay order)
export async function POST(request: NextRequest) {
  if (!selfServeAdsEnabled()) return NextResponse.json(SELF_SERVE_ADS_OFF, { status: 503 });
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;
    const limited = await tooMany(founderWriteRateLimit, `ads:${session.userId}`);
    if (limited) return limited;

    const body = await request.json();
    const { activationId, extraDays } = body;

    if (!activationId || typeof activationId !== 'string') {
      return NextResponse.json({ success: false, error: 'activationId is required' }, { status: 400 });
    }
    if (!extraDays || typeof extraDays !== 'number' || extraDays < 1 || extraDays > 365) {
      return NextResponse.json({ success: false, error: 'extraDays must be between 1 and 365' }, { status: 400 });
    }

    const activation = await prisma.advZoneActivation.findUnique({
      where: { id: activationId },
      include: { package: { select: { founderId: true, status: true, expiresAt: true } } },
    });

    if (!activation) {
      return NextResponse.json({ success: false, error: 'Activation not found' }, { status: 404 });
    }

    if (activation.package.founderId !== session.userId) {
      return NextResponse.json({ success: false, error: 'Not authorized' }, { status: 403 });
    }

    if (activation.package.status !== 'ACTIVE' || activation.package.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: 'Package is expired or inactive' }, { status: 403 });
    }

    if (activation.status === 'CANCELLED') {
      return NextResponse.json({ success: false, error: 'This activation was cancelled' }, { status: 400 });
    }

    const zone = activation.zone as AdvZoneSlot;
    const pricing = calculateExtensionCost(zone, extraDays);

    const Razorpay = (await import('razorpay')).default;
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ success: false, error: 'Payment service not configured' }, { status: 503 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const zoneTier = getZoneTier(zone);

    const order = await razorpay.orders.create({
      amount: pricing.total,
      currency: 'INR',
      receipt: `adv_ext_${activationId}_${Date.now()}`,
      notes: {
        founderId: session.userId,
        activationId,
        zone,
        extraDays: String(extraDays),
        purpose: 'ZONE_EXTENSION',
      },
    });

    await prisma.advPayment.create({
      data: {
        founderId: session.userId,
        packageId: activation.packageId,
        zoneActivationId: activationId,
        purpose: 'ZONE_EXTENSION',
        amountPaise: pricing.amount,
        gstPaise: pricing.gst,
        totalPaise: pricing.total,
        razorpayOrderId: order.id,
        status: 'PENDING',
        metadata: { zone, extraDays, ratePerDay: ZONE_EXTENSION_RATES[zoneTier] },
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount: pricing.total,
      currency: 'INR',
      keyId,
      breakdown: {
        zone,
        extraDays,
        ratePerDay: ZONE_EXTENSION_RATES[zoneTier],
        subtotal: pricing.amount,
        gst: pricing.gst,
        total: pricing.total,
      },
    });
  } catch (err) {
    console.error('[zones/extend POST]', err);
    return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 });
  }
}
