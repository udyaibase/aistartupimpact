import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { foundingEligible, isBillingCycle, isPaidPlan, planPrice, PLANS } from '@/lib/employer/plans';

export const dynamic = 'force-dynamic';

/**
 * Create a Razorpay order for a paid plan: 30 days (monthly) or 365 days (annual, at the founding price for the
 * first 50 workspaces). The plan starts only after payment is verified.
 */
export async function POST(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'account.manage')) return forbidden();

  const { success } = await checkRateLimit(apiRateLimit, `billing-checkout:${session.id}`);
  if (!success) return NextResponse.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const plan = String(body.plan ?? '');
  if (!isPaidPlan(plan)) return NextResponse.json({ error: 'Choose a paid plan.' }, { status: 400 });
  const cycle = body.cycle === undefined ? 'MONTHLY' : body.cycle;
  if (!isBillingCycle(cycle)) return NextResponse.json({ error: 'Choose monthly or annual billing.' }, { status: 400 });

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return NextResponse.json({ error: 'Payments aren’t set up yet. Please contact us.' }, { status: 503 });

  const employer = await prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { companyName: true, email: true, emailVerified: true, foundingMemberAt: true, foundingLostAt: true } });
  if (!employer?.emailVerified) return NextResponse.json({ error: 'Verify your email before upgrading.' }, { status: 403 });

  const founding = cycle === 'ANNUAL'
    && foundingEligible(employer, employer.foundingMemberAt ? 0 : await prisma.jobBoardEmployer.count({ where: { foundingMemberAt: { not: null } } }));
  const price = planPrice(plan, cycle, { founding });
  try {
    const Razorpay = (await import('razorpay')).default;
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await rzp.orders.create({
      amount: price.total,
      currency: 'INR',
      receipt: `emp_${session.id.slice(-12)}_${Date.now()}`,
      notes: { purpose: 'EMPLOYER_PLAN', employerId: session.id, plan, cycle, founding: founding ? 'yes' : 'no' },
    });
    await prisma.jobBoardPayment.create({
      data: {
        employerId: session.id, plan, cycle, foundingPrice: founding, amountPaise: price.amount, gstPaise: price.gst, totalPaise: price.total,
        razorpayOrderId: order.id, paidByEmail: session.email,
      },
    });
    return NextResponse.json({
      keyId, orderId: order.id, amount: price.total, currency: 'INR',
      name: 'Udyaibase', description: `${PLANS[plan].name} plan · ${cycle === 'ANNUAL' ? `1 year${founding ? ' · founding price' : ''}` : '30 days'}`,
      prefill: { email: session.email, name: session.memberName ?? employer.companyName },
    });
  } catch (err) {
    console.error('[billing checkout]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Couldn’t start the payment. Try again.' }, { status: 502 });
  }
}
