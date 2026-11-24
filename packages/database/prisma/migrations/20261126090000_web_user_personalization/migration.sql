-- What website users tell us in onboarding (lib/personalization/topics.ts). All optional.
ALTER TABLE "WebUser" ADD COLUMN IF NOT EXISTS "intents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WebUser" ADD COLUMN IF NOT EXISTS "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WebUser" ADD COLUMN IF NOT EXISTS "jobPrefs" JSONB;
ALTER TABLE "WebUser" ADD COLUMN IF NOT EXISTS "referralSource" TEXT;
ALTER TABLE "WebUser" ADD COLUMN IF NOT EXISTS "referralDetail" VARCHAR(120);

-- Existing answers carry over: the single "primary intent" becomes the first of the list.
UPDATE "WebUser" SET "intents" = ARRAY["primaryIntent"] WHERE "primaryIntent" IS NOT NULL AND cardinality("intents") = 0;

-- "How did you hear about us" report.
CREATE INDEX IF NOT EXISTS "WebUser_referralSource_idx" ON "WebUser" ("referralSource");
