-- Automatic first look at a startup submission: does the product look like it is built on AI?
-- A hint for the reviewer only; it never approves or rejects. Additive: four new columns on "Startup".

ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "aiCheckLabel" TEXT;
ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "aiCheckReason" TEXT;
ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "aiCheckedAt" TIMESTAMP(3);
ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "aiCheckModel" TEXT;
