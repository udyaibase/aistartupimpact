-- Openings per job ("Hiring 5"). Additive; existing jobs default to 1.
ALTER TABLE "JobBoardListing" ADD COLUMN IF NOT EXISTS "positions" INTEGER NOT NULL DEFAULT 1;
