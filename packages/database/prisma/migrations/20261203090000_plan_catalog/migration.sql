-- Plan prices and limits editable from the admin, kept as dated versions.
-- Additive only: one new table. With no rows, the values built into the code apply.

CREATE TABLE IF NOT EXISTS "PlanCatalogVersion" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "note" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanCatalogVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlanCatalogVersion_effectiveFrom_idx" ON "PlanCatalogVersion"("effectiveFrom");
