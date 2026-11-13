-- Activity log for employer and event-host workspaces (see WorkspaceActivityLog in schema.prisma).
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS "WorkspaceActivityLog" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "workspace" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkspaceActivityLog_workspace_workspaceId_createdAt_idx" ON "WorkspaceActivityLog"("workspace", "workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkspaceActivityLog_createdAt_idx" ON "WorkspaceActivityLog"("createdAt");
