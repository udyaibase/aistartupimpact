'use client';

/** Opens Razorpay Checkout for an order created by our API, then posts the result to `verifyUrl`. */

declare global {
  interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: any) => void) => void } }
}

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export interface CheckoutOrder {
  keyId: string; orderId: string; amount: number; currency: string; name: string; description: string;
  prefill?: Record<string, string>;
}

export type CheckoutOutcome = { ok: true } | { ok: false; cancelled?: boolean; error: string };

export async function payWithRazorpay(order: CheckoutOrder, verifyUrl: string): Promise<CheckoutOutcome> {
  if (!(await loadCheckout()) || !window.Razorpay) return { ok: false, error: 'Couldn’t load the payment window. Check your connection or ad blocker.' };
  return new Promise((resolve) => {
    const rzp = new window.Razorpay!({
      key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency,
      name: order.name, description: order.description, prefill: order.prefill, theme: { color: '#A50F15' },
      modal: { ondismiss: () => resolve({ ok: false, cancelled: true, error: '' }) },
      handler: async (r: Record<string, string>) => {
        try {
          const v = await fetch(verifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) });
          const d = await v.json().catch(() => ({}));
          resolve(v.ok ? { ok: true } : { ok: false, error: d.error || 'We couldn’t confirm the payment yet. It will activate within a few minutes.' });
        } catch {
          resolve({ ok: false, error: 'Payment taken, but we couldn’t confirm it from this device. It will activate within a few minutes.' });
        }
      },
    });
    rzp.on('payment.failed', (r: any) => resolve({ ok: false, error: r?.error?.description || 'Payment failed. No money was taken.' }));
    rzp.open();
  });
}
