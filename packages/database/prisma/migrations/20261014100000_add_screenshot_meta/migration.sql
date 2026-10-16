-- Add screenshotMeta column to track source (auto/manual) per screenshot
ALTER TABLE "AiTool" ADD COLUMN "screenshotMeta" JSONB;

-- Backfill: mark all existing screenshots as manual
UPDATE "AiTool"
SET "screenshotMeta" = (
  SELECT jsonb_object_agg(url, jsonb_build_object('source', 'manual', 'createdAt', "createdAt"::text))
  FROM unnest("screenshotUrls") AS url
)
WHERE array_length("screenshotUrls", 1) > 0;
