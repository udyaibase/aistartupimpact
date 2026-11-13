-- USD/INR at the rate on each round's announcement date, instead of fixed rates in the code.
-- Safe to run more than once.

-- Daily USD→INR reference rates (European Central Bank via Frankfurter), filled by the app's daily job.
CREATE TABLE IF NOT EXISTS "ExchangeRate" (
    "day" DATE NOT NULL,
    "usdInr" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ECB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("day")
);

-- Which amount of a round was calculated ('INR' or 'USD'; null = both typed by a person) and the rate used.
ALTER TABLE "FundingRound" ADD COLUMN IF NOT EXISTS "fxDerived" TEXT;
ALTER TABLE "FundingRound" ADD COLUMN IF NOT EXISTS "fxUsdInr" DOUBLE PRECISION;
-- A round entered only in dollars arrives without rupees; the trigger below fills them in.
ALTER TABLE "FundingRound" ALTER COLUMN "amountInr" DROP NOT NULL;

-- USD→INR on a date (India time): that day's rate, or the last one before it (weekends, holidays); for a date
-- before the first published rate, the earliest one. Null only while no rates are loaded.
CREATE OR REPLACE FUNCTION usd_inr_on(at TIMESTAMP) RETURNS DOUBLE PRECISION AS $$
  SELECT COALESCE(
    (SELECT "usdInr" FROM "ExchangeRate"
      WHERE "day" <= (COALESCE(at, NOW()::timestamp) + INTERVAL '5 hours 30 minutes')::date
      ORDER BY "day" DESC LIMIT 1),
    (SELECT "usdInr" FROM "ExchangeRate" ORDER BY "day" ASC LIMIT 1))
$$ LANGUAGE sql STABLE;

-- Fill whichever amount a person didn't type, at the announcement-date rate. A typed amount always wins:
-- if someone edits the calculated side, it becomes typed and is never recalculated again.
CREATE OR REPLACE FUNCTION funding_round_fill_fx() RETURNS trigger AS $$
DECLARE
  rate DOUBLE PRECISION;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."fxDerived" = 'INR' AND NEW."amountInr" IS DISTINCT FROM OLD."amountInr" THEN NEW."fxDerived" := NULL; END IF;
    IF NEW."fxDerived" = 'USD' AND NEW."amountUsd" IS DISTINCT FROM OLD."amountUsd" THEN NEW."fxDerived" := NULL; END IF;
  END IF;

  rate := usd_inr_on(NEW."announcedAt");
  -- Before the daily job has loaded any rates: a placeholder the job corrects on its first run.
  IF rate IS NULL THEN rate := 94; END IF;

  IF COALESCE(NEW."amountUsd", 0) > 0 AND (COALESCE(NEW."amountInr", 0) = 0 OR NEW."fxDerived" = 'INR') THEN
    NEW."amountInr" := ROUND(NEW."amountUsd" * rate)::BIGINT;      -- cents × rate = paise
    NEW."fxDerived" := 'INR';
    NEW."fxUsdInr" := rate;
  ELSIF COALESCE(NEW."amountInr", 0) > 0 AND (COALESCE(NEW."amountUsd", 0) = 0 OR NEW."fxDerived" = 'USD') THEN
    NEW."amountUsd" := ROUND(NEW."amountInr" / rate)::BIGINT;      -- paise ÷ rate = cents
    NEW."fxDerived" := 'USD';
    NEW."fxUsdInr" := rate;
  ELSIF NEW."fxDerived" IS NULL THEN
    NEW."fxUsdInr" := NULL;
  END IF;
  IF NEW."amountInr" IS NULL THEN NEW."amountInr" := 0; END IF;     -- undisclosed round
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "FundingRound_fill_fx" ON "FundingRound";
CREATE TRIGGER "FundingRound_fill_fx"
  BEFORE INSERT OR UPDATE ON "FundingRound"
  FOR EACH ROW EXECUTE FUNCTION funding_round_fill_fx();
