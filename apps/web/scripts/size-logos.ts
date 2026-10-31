/**
 * Backfill: ready-made 64/128/256px WebP copies for every logo on media.udyaibase.com (see lib/media/logo-sizes.ts).
 * New logos are handled by the daily data-retention cron. Safe to re-run; already-sized logos are skipped.
 * Run from apps/web: npx dotenv-cli -e ../../.env -- npx tsx --tsconfig tsconfig.json scripts/size-logos.ts [batches]
 */
import { prisma } from '@udyaibase/database';
import { sizePendingLogos } from '../lib/media/logo-sizes';

(async () => {
  const maxBatches = Number(process.argv[2] ?? 100);
  let total = { sized: 0, skipped: 0, rowsUpdated: 0 };
  for (let i = 0; i < maxBatches; i++) {
    const r = await sizePendingLogos(50);
    total = { sized: total.sized + r.sized, skipped: total.skipped + r.skipped, rowsUpdated: total.rowsUpdated + r.rowsUpdated };
    console.log(`batch ${i + 1}: sized ${r.sized}, skipped ${r.skipped}, rows ${r.rowsUpdated}`);
    if (r.sized === 0) break; // only unsizable logos left
  }
  console.log('total', total);
  await prisma.$disconnect();
})();
