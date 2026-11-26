-- What Razorpay kept on each captured payment (fee and the GST on it), for Billing → Reconciliation.
-- A new table only: no existing table or row is changed, and nothing reads it until the admin syncs fees.
CREATE TABLE IF NOT EXISTS "RazorpayFee" (
    "paymentId" TEXT NOT NULL,
    "feePaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL,
    "method" TEXT,
    "capturedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RazorpayFee_pkey" PRIMARY KEY ("paymentId")
);
