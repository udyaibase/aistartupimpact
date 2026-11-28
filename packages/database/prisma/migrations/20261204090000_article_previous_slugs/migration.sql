-- Old links of an article keep working after its URL is changed: the previous slugs are remembered and redirected.
-- Additive only: one new column with an empty default.

ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "previousSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[];
