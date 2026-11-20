-- Hiring team sessions that can be ended: per-person "sign out everywhere" cut-off and the ids of signed-out sessions.
ALTER TABLE "JobBoardTeamMember" ADD COLUMN "sessionsValidAfter" TIMESTAMP(3);
ALTER TABLE "JobBoardTeamMember" ADD COLUMN "revokedSessionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
