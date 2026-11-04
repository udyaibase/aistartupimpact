import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[razorpay-advertise] RAZORPAY_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get('x-razorpay-signature') || '';

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expected = Buffer.from(expectedSignature);
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const body = JSON.parse(rawBody);
    const { event, payload } = body;

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payment.entity;
      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;

      // Idempotency: skip if already processed
      const existingPayment = await prisma.advPayment.findFirst({
        where: { razorpayPaymentId: paymentId },
      });
      if (existingPayment) {
        return NextResponse.json({ status: 'already_processed' }, { status: 200 });
      }

      // Find the pending payment record
      const payment = await prisma.advPayment.findFirst({
        where: { razorpayOrderId: orderId, status: 'PENDING' },
      });
      if (!payment) {
        console.warn('[razorpay-advertise] No pending payment for order:', String(orderId).replace(/[\n\r]/g, ''));
        return NextResponse.json({ status: 'no_matching_payment' }, { status: 200 });
      }

      // Mark payment as successful
      await prisma.advPayment.update({
        where: { id: payment.id },
        data: {
          razorpayPaymentId: paymentId,
          status: 'SUCCESS',
          paidAt: new Date(),
        },
      });

      // Handle based on purpose
      switch (payment.purpose) {
        case 'PACKAGE_PURCHASE':
          await handlePackagePurchase(payment);
          break;
        case 'PACKAGE_UPGRADE':
          await handlePackageUpgrade(payment);
          break;
        case 'ZONE_EXTENSION':
          await handleZoneExtension(payment);
          break;
        case 'SOCIAL_POST':
          await handleSocialPost(payment);
          break;
      }

      console.log(`[razorpay-advertise] Processed ${payment.purpose} for founder ${payment.founderId}`);
    }

    if (event === 'payment.failed') {
      const paymentEntity = payload.payment.entity;
      const orderId = paymentEntity.order_id;

      await prisma.advPayment.updateMany({
        where: { razorpayOrderId: orderId, status: 'PENDING' },
        data: { status: 'FAILED', failedAt: new Date() },
      });
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (err) {
    console.error('[razorpay-advertise]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

interface PaymentRecord {
  id: string;
  founderId: string;
  packageId: string | null;
  zoneActivationId: string | null;
  socialPostOrderId: string | null;
  purpose: string;
  metadata: unknown;
}

async function handlePackagePurchase(payment: PaymentRecord) {
  if (!payment.packageId) return;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 365);

  await prisma.advPackage.update({
    where: { id: payment.packageId },
    data: { status: 'ACTIVE', expiresAt },
  });
}

async function handlePackageUpgrade(payment: PaymentRecord) {
  const meta = payment.metadata as Record<string, string> | null;
  if (!meta?.currentPackageId || !meta?.toTier) return;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 365);

  // Create new package at higher tier
  const newPkg = await prisma.advPackage.create({
    data: {
      founderId: payment.founderId,
      tier: meta.toTier as 'STARTER' | 'GROWTH' | 'PREMIUM',
      status: 'ACTIVE',
      expiresAt,
      upgradedFromId: meta.currentPackageId,
    },
  });

  // Mark old package as upgraded
  await prisma.advPackage.update({
    where: { id: meta.currentPackageId },
    data: { status: 'UPGRADED', upgradedToId: newPkg.id },
  });

  // Migrate existing zone activations to the new package
  await prisma.advZoneActivation.updateMany({
    where: { packageId: meta.currentPackageId, status: { in: ['ACTIVE', 'SCHEDULED'] } },
    data: { packageId: newPkg.id },
  });
}

async function handleZoneExtension(payment: PaymentRecord) {
  if (!payment.zoneActivationId) return;
  const meta = payment.metadata as Record<string, unknown> | null;
  const extraDays = Number(meta?.extraDays) || 0;
  if (extraDays <= 0) return;

  const activation = await prisma.advZoneActivation.findUnique({
    where: { id: payment.zoneActivationId },
  });
  if (!activation) return;

  const currentEnd = new Date(activation.endsAt);
  const newEnd = new Date(Math.max(currentEnd.getTime(), Date.now()));
  newEnd.setDate(newEnd.getDate() + extraDays);

  const ratePerDay = Number(meta?.ratePerDay) || 0;

  await prisma.advZoneActivation.update({
    where: { id: payment.zoneActivationId },
    data: {
      endsAt: newEnd,
      extensionDays: activation.extensionDays + extraDays,
      extensionRate: ratePerDay,
      extensionTotal: activation.extensionTotal + (ratePerDay * extraDays),
      status: 'ACTIVE',
    },
  });
}

async function handleSocialPost(payment: PaymentRecord) {
  if (!payment.socialPostOrderId) return;

  await prisma.advSocialPostOrder.update({
    where: { id: payment.socialPostOrderId },
    data: { status: 'PAID' },
  });
}
