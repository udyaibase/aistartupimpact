-- Badge design per event (template, accent colour, logo; Pro customisation). Optional: null means the default design.
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "badgeSettings" JSONB;
