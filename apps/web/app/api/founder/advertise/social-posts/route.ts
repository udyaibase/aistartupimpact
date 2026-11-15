import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getFounderSession } from '@/lib/founder-auth';
import {
  getEntitlements,
  SOCIAL_POST_PRICES,
  calculateTotal,
  type SocialPostType, selfServeAdsEnabled, SELF_SERVE_ADS_OFF,
} from '@/lib/advertise';

export const dynamic = 'force-dynamic';

const VALID_TYPES: SocialPostType[] = ['LINKEDIN', 'INSTAGRAM', 'BUNDLE'];

// GET — list founder's social post orders
export async function GET() {
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false }, { status: 401 });

    const entitlements = await getEntitlements(session.userId);
    if (!entitlements.packageId) {
      return NextResponse.json({ success: true, orders: [] });
    }

    const orders = await prisma.advSocialPostOrder.findMany({
      where: { packageId: entitlements.packageId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, orders });
  } catch (err) {
    console.error('[social-posts GET]', err);
    return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 });
  }
}

// POST — order a social post (creates Razorpay order)
export async function POST(request: NextRequest) {
  if (!selfServeAdsEnabled()) return NextResponse.json(SELF_SERVE_ADS_OFF, { status: 503 });
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const postType = body.postType as SocialPostType;
    const contentBrief = body.contentBrief as string | undefined;

    if (!postType || !VALID_TYPES.includes(postType)) {
      return NextResponse.json({ success: false, error: 'Invalid post type. Must be LINKEDIN, INSTAGRAM, or BUNDLE.' }, { status: 400 });
    }

    const entitlements = await getEntitlements(session.userId);

    if (!entitlements.canPostSocial) {
      return NextResponse.json({
        success: false,
        error: 'Social posts are available only with Growth or Premium packages.',
      }, { status: 403 });
    }

    if (!entitlements.packageId) {
      return NextResponse.json({ success: false, error: 'No active package' }, { status: 403 });
    }

    const amountPaise = SOCIAL_POST_PRICES[postType];
    const pricing = calculateTotal(amountPaise);

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
      receipt: `adv_social_${session.userId}_${Date.now()}`,
      notes: {
        founderId: session.userId,
        postType,
        purpose: 'SOCIAL_POST',
      },
    });

    const socialOrder = await prisma.advSocialPostOrder.create({
      data: {
        packageId: entitlements.packageId,
        postType,
        status: 'PENDING_PAYMENT',
        contentBrief: contentBrief?.slice(0, 2000),
        amountPaise,
      },
    });

    await prisma.advPayment.create({
      data: {
        founderId: session.userId,
        packageId: entitlements.packageId,
        socialPostOrderId: socialOrder.id,
        purpose: 'SOCIAL_POST',
        amountPaise: pricing.amount,
        gstPaise: pricing.gst,
        totalPaise: pricing.total,
        razorpayOrderId: order.id,
        status: 'PENDING',
        metadata: { postType },
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount: pricing.total,
      currency: 'INR',
      keyId,
      socialOrderId: socialOrder.id,
    });
  } catch (err) {
    console.error('[social-posts POST]', err);
    return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 });
  }
}
