-- Skills dictionary additions approved in admin, the unknown-skills review queue, and a version for re-scoring.
CREATE TABLE IF NOT EXISTS "SkillDictionarySkill" (
    "id" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillDictionarySkill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SkillDictionarySkill_key_key" ON "SkillDictionarySkill"("key");

CREATE TABLE IF NOT EXISTS "SkillDictionaryAlias" (
    "id" TEXT NOT NULL, "aliasKey" TEXT NOT NULL, "alias" TEXT NOT NULL, "skillKey" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillDictionaryAlias_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SkillDictionaryAlias_aliasKey_key" ON "SkillDictionaryAlias"("aliasKey");
CREATE INDEX IF NOT EXISTS "SkillDictionaryAlias_skillKey_idx" ON "SkillDictionaryAlias"("skillKey");

CREATE TABLE IF NOT EXISTS "SkillDictionaryRule" (
    "id" TEXT NOT NULL, "kind" TEXT NOT NULL, "fromKey" TEXT NOT NULL, "toKey" TEXT NOT NULL DEFAULT '', "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillDictionaryRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SkillDictionaryRule_kind_fromKey_toKey_key" ON "SkillDictionaryRule"("kind", "fromKey", "toKey");

CREATE TABLE IF NOT EXISTS "SkillDictionaryUnknown" (
    "id" TEXT NOT NULL, "key" TEXT NOT NULL, "sample" TEXT NOT NULL, "source" TEXT NOT NULL,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING', "suggestion" JSONB, "suggestedAt" TIMESTAMP(3), "decidedBy" TEXT, "decidedAt" TIMESTAMP(3),
    CONSTRAINT "SkillDictionaryUnknown_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SkillDictionaryUnknown_key_key" ON "SkillDictionaryUnknown"("key");
CREATE INDEX IF NOT EXISTS "SkillDictionaryUnknown_status_seenCount_idx" ON "SkillDictionaryUnknown"("status", "seenCount");

CREATE TABLE IF NOT EXISTS "SkillDictionaryMeta" (
    "id" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 0, "rescoredVersion" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillDictionaryMeta_pkey" PRIMARY KEY ("id")
);
INSERT INTO "SkillDictionaryMeta" ("id", "version", "rescoredVersion", "updatedAt") VALUES ('main', 0, 0, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
