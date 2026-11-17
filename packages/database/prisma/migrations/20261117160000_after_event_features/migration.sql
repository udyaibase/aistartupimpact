-- After-event features (series, sponsors, call for speakers, feedback, certificates, meeting apps).
-- These were added to the schema and created on the dev database directly, without a migration, so production
-- never got them. Every statement is guarded (IF NOT EXISTS / constraint check), so it is a no-op where the objects
-- already exist (the dev database) and creates them where they don't (production).

-- Columns
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "agendaTracks" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "certificateSettings" JSONB;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "certificatesPaidAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "cfpSettings" JSONB;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "feedbackSettings" JSONB;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "followUpAutoSentAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "followUpSettings" JSONB;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "meetingExternalId" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "meetingProvider" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "recapLinks" JSONB;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "recapSummary" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "seriesAnnouncedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "seriesId" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "summarySentAt" TIMESTAMP(3);

ALTER TABLE "EventAgendaItem" ADD COLUMN IF NOT EXISTS "recordingUrl" TEXT;
ALTER TABLE "EventAgendaItem" ADD COLUMN IF NOT EXISTS "slidesUrl" TEXT;
ALTER TABLE "EventAgendaItem" ADD COLUMN IF NOT EXISTS "track" TEXT;

ALTER TABLE "EventEmailCampaign" ADD COLUMN IF NOT EXISTS "kind" TEXT;

ALTER TABLE "EventRegistration" ADD COLUMN IF NOT EXISTS "hostEmailsOptOutAt" TIMESTAMP(3);

ALTER TABLE "EventSpeaker" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "EventSpeaker" ADD COLUMN IF NOT EXISTS "slidesUrl" TEXT;
ALTER TABLE "EventSpeaker" ADD COLUMN IF NOT EXISTS "submissionId" TEXT;

-- Tables
CREATE TABLE IF NOT EXISTS "EventCertificate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "EventCertificate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventFeedback" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "recommend" INTEGER,
    "answers" JSONB,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventTalkSubmission" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "jobTitle" TEXT,
    "bio" TEXT,
    "headshotUrl" TEXT,
    "linkedinUrl" TEXT,
    "title" TEXT NOT NULL,
    "abstract" TEXT NOT NULL,
    "format" TEXT,
    "track" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "rating" INTEGER,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "speakerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventTalkSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventSponsor" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'PARTNER',
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "startupId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventSponsor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventSeries" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "recurrence" JSONB,
    "lastGeneratedFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventSeriesFollower" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventSeriesFollower_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrganizerIntegration" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountEmail" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "needsReconnectAt" TIMESTAMP(3),
    "connectedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizerIntegration_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "EventCertificate_code_key" ON "EventCertificate"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "EventCertificate_registrationId_key" ON "EventCertificate"("registrationId");
CREATE INDEX IF NOT EXISTS "EventCertificate_eventId_idx" ON "EventCertificate"("eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "EventFeedback_registrationId_key" ON "EventFeedback"("registrationId");
CREATE INDEX IF NOT EXISTS "EventFeedback_eventId_idx" ON "EventFeedback"("eventId");
CREATE INDEX IF NOT EXISTS "EventTalkSubmission_eventId_status_idx" ON "EventTalkSubmission"("eventId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "EventTalkSubmission_eventId_email_title_key" ON "EventTalkSubmission"("eventId", "email", "title");
CREATE INDEX IF NOT EXISTS "EventSponsor_eventId_idx" ON "EventSponsor"("eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "EventSeries_slug_key" ON "EventSeries"("slug");
CREATE INDEX IF NOT EXISTS "EventSeries_organizerId_idx" ON "EventSeries"("organizerId");
CREATE INDEX IF NOT EXISTS "EventSeriesFollower_seriesId_idx" ON "EventSeriesFollower"("seriesId");
CREATE UNIQUE INDEX IF NOT EXISTS "EventSeriesFollower_seriesId_email_key" ON "EventSeriesFollower"("seriesId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizerIntegration_organizerId_provider_key" ON "OrganizerIntegration"("organizerId", "provider");

-- Foreign keys (added only when missing)
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN SELECT * FROM (VALUES
    ('Event_seriesId_fkey', 'ALTER TABLE "Event" ADD CONSTRAINT "Event_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE'),
    ('EventCertificate_eventId_fkey', 'ALTER TABLE "EventCertificate" ADD CONSTRAINT "EventCertificate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('EventCertificate_registrationId_fkey', 'ALTER TABLE "EventCertificate" ADD CONSTRAINT "EventCertificate_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('EventFeedback_eventId_fkey', 'ALTER TABLE "EventFeedback" ADD CONSTRAINT "EventFeedback_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('EventFeedback_registrationId_fkey', 'ALTER TABLE "EventFeedback" ADD CONSTRAINT "EventFeedback_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('EventTalkSubmission_eventId_fkey', 'ALTER TABLE "EventTalkSubmission" ADD CONSTRAINT "EventTalkSubmission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('EventSponsor_eventId_fkey', 'ALTER TABLE "EventSponsor" ADD CONSTRAINT "EventSponsor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('EventSeries_organizerId_fkey', 'ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "EventOrganizer"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('EventSeriesFollower_seriesId_fkey', 'ALTER TABLE "EventSeriesFollower" ADD CONSTRAINT "EventSeriesFollower_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('OrganizerIntegration_organizerId_fkey', 'ALTER TABLE "OrganizerIntegration" ADD CONSTRAINT "OrganizerIntegration_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "EventOrganizer"("id") ON DELETE CASCADE ON UPDATE CASCADE')
  ) AS v(name, ddl) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.name) THEN
      EXECUTE fk.ddl;
    END IF;
  END LOOP;
END $$;
