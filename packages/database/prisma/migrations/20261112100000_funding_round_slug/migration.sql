-- Funding rounds get a URL slug, so each round has its own page: /funding/qure-ai-series-d-2026.
-- Safe to run more than once (IF NOT EXISTS / OR REPLACE everywhere).

ALTER TABLE "FundingRound" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Fills the slug whenever a round is saved without one, from every insert path (admin, founder portal,
-- listing edits, scripts): <startup>-<round type>-<year>, with -2, -3… on the rare clash. An existing slug is
-- never changed, so published URLs stay stable when a round is edited.
CREATE OR REPLACE FUNCTION funding_round_set_slug() RETURNS trigger AS $$
DECLARE
  startup_name TEXT;
  base TEXT;
  candidate TEXT;
  n INT := 1;
BEGIN
  IF NEW."slug" IS NOT NULL AND NEW."slug" <> '' THEN
    RETURN NEW;
  END IF;
  SELECT "name" INTO startup_name FROM "Startup" WHERE "id" = NEW."startupId";
  base := lower(
    coalesce(startup_name, 'startup') || '-' ||
    coalesce(NEW."roundType", 'funding') || '-' ||
    to_char(coalesce(NEW."announcedAt", now()), 'YYYY')
  );
  base := trim(BOTH '-' FROM regexp_replace(base, '[^a-z0-9]+', '-', 'g'));
  base := left(base, 80);
  IF base = '' THEN base := 'funding-round'; END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM "FundingRound" WHERE "slug" = candidate AND "id" <> NEW."id") LOOP
    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;
  NEW."slug" := candidate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "FundingRound_set_slug" ON "FundingRound";
CREATE TRIGGER "FundingRound_set_slug"
  BEFORE INSERT OR UPDATE ON "FundingRound"
  FOR EACH ROW EXECUTE FUNCTION funding_round_set_slug();

-- Backfill existing rounds one at a time (oldest first), so each sees the slugs already taken.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT "id" FROM "FundingRound" WHERE "slug" IS NULL ORDER BY "announcedAt" ASC, "id" ASC LOOP
    UPDATE "FundingRound" SET "slug" = NULL WHERE "id" = r."id";
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "FundingRound_slug_key" ON "FundingRound"("slug");
