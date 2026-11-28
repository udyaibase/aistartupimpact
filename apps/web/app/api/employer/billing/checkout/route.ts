import { ensureCatalog } from '@/lib/catalog/server';
import { holdDiscount, quoteDiscount, type Quote } from '@/lib/offers/discount';
import { withGst } from '@/lib/billing/razorpay';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { foundingEligible, isBillingCycle, isPaidPlan, planPrice, PLANS } from '@/lib/employer/plans';
import { BILLING_SELECT, profileComplete, profileFromRow } from '@/lib/billing/details';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/**
 * Create a Razorpay order for a paid plan: 30 days (monthly) or 365 days (annual, at the founding price for the
 * first 50 workspaces). The plan starts only after payment is verified.
 */
export async function POST(request: NextRequest) {
  const guard = await employerApi('account.manage');
  if (guard.error) return guard.error;
  const session = guard.session;

  const { success } = await checkRateLimit(apiRateLimit, `billing-checkout:${session.id}`);
  if (!success) return NextResponse.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });

  await ensureCatalog({ fresh: true }); // charge today's price, never a remembered one
  const body = await request.json().catch(() => ({}));
  const plan = String(body.plan ?? '');
  if (!isPaidPlan(plan)) return NextResponse.json({ error: 'Choose a paid plan.' }, { status: 400 });
  const cycle = body.cycle === undefined ? 'MONTHLY' : body.cycle;
  if (!isBillingCycle(cycle)) return NextResponse.json({ error: 'Choose monthly or annual billing.' }, { status: 400 });

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return NextResponse.json({ error: 'Payments aren’t set up yet. Please contact us.' }, { status: 503 });

  const employer = await prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { ...BILLING_SELECT, companyName: true, email: true, emailVerified: true, foundingMemberAt: true, foundingLostAt: true } });
  if (!employer?.emailVerified) return NextResponse.json({ error: 'Verify your email before upgrading.' }, { status: 403 });
  // GST invoices need the buyer's name, address and (for businesses) GSTIN: collected once, before the first payment.
  if (!profileComplete(profileFromRow(employer, employer.email))) {
    return NextResponse.json({ error: 'Add your invoice details to continue.', code: 'BILLING_REQUIRED' }, { status: 409 });
  }

  const founding = cycle === 'ANNUAL'
    && foundingEligible(employer, employer.foundingMemberAt ? 0 : await prisma.jobBoardEmployer.count({ where: { foundingMemberAt: { not: null } } }));
  let price = planPrice(plan, cycle, { founding });
  // A discount code (Admin → Billing → Offers) comes off the price before GST, after the founding price.
  const purchase = { plan, cycle, amountPaise: price.amount };
  let quote: Extract<Quote, { ok: true }> | null = null;
  if (typeof body.code === 'string' && body.code.trim()) {
    const q = await quoteDiscount('EMPLOYER', session.id, body.code, purchase);
    if (!q.ok) return NextResponse.json({ error: q.error, code: 'CODE_REJECTED' }, { status: 400 });
    quote = q;
    price = withGst(q.finalPaise);
  }
  try {
    const Razorpay = (await import('razorpay')).default;
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await rzp.orders.create({
      amount: price.total,
      currency: 'INR',
      receipt: `emp_${session.id.slice(-12)}_${Date.now()}`,
      notes: { purpose: 'EMPLOYER_PLAN', employerId: session.id, plan, cycle, founding: founding ? 'yes' : 'no', ...(quote ? { code: quote.code } : {}) },
    });
    if (quote) {
      // Hold one of the code's places for this order; nothing is recorded if there is none left.
      const held = await holdDiscount(quote, purchase, order.id);
      if (!held.ok) return NextResponse.json({ error: held.error, code: 'CODE_REJECTED' }, { status: 409 });
    }
    await prisma.jobBoardPayment.create({
      data: {
        employerId: session.id, plan, cycle, foundingPrice: founding, amountPaise: price.amount, gstPaise: price.gst, totalPaise: price.total,
        razorpayOrderId: order.id, paidByEmail: session.email,
      },
    });
    return NextResponse.json({
      keyId, orderId: order.id, amount: price.total, currency: 'INR',
      name: 'Udyaibase', description: `${PLANS[plan].name} plan · ${cycle === 'ANNUAL' ? `1 year${founding ? ' · founding price' : ''}` : '30 days'}${quote ? ` · code ${quote.code}` : ''}`,
      ...(quote ? { discount: { code: quote.code, label: quote.label, discountPaise: quote.discountPaise } } : {}),
      prefill: { email: session.email, name: session.memberName ?? employer.companyName },
    });
  } catch (err) {
    console.error('[billing checkout]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Couldn’t start the payment. Try again.' }, { status: 502 });
  }
}
