const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: require('path').join(__dirname, '..', 'apps', 'admin', '.env.local') });

const sql = neon(process.env.DATABASE_URL);

(async () => {
  try {
    await sql`ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "screenshotMeta" JSONB`;
    console.log('✓ Column "screenshotMeta" added');

    const result = await sql`
      UPDATE "AiTool"
      SET "screenshotMeta" = (
        SELECT jsonb_object_agg(url, jsonb_build_object('source', 'manual', 'createdAt', "createdAt"::text))
        FROM unnest("screenshotUrls") AS url
      )
      WHERE array_length("screenshotUrls", 1) > 0 AND "screenshotMeta" IS NULL
    `;
    console.log('✓ Backfilled existing screenshots as manual');
    console.log('Done!');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  }
})();
