/**
 * One-off: move every stored image URL onto media.udyaibase.com (Cloudflare in front of the R2 bucket).
 *
 *  1. Main bucket's r2.dev URL -> media.udyaibase.com (same bucket, nothing to copy).
 *  2. Second bucket (pub-13cc…): files already identical in the main bucket are only re-pointed;
 *     the ones missing there are copied first. Files missing everywhere are left (already broken).
 *  3. Hot-linked logos and event covers (Google favicons, company sites, Devfolio) are copied into R2.
 *     Google sign-in avatars and Unsplash covers stay as they are.
 *  4. Image URLs that already 404 are cleared so the placeholder shows.
 *
 * Dry run by default. `--apply` writes, after saving every old value to .data/backups/ (gitignored).
 * Run: npx dotenv-cli -e .env -- npx tsx scripts/migrate-media-urls.ts [--apply]
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@udyaibase/database';

const APPLY = process.argv.includes('--apply');
const MEDIA = 'https://media.udyaibase.com';
const MAIN_DEV = 'https://pub-5a271e4327a5417daf0699e16055d515.r2.dev';
const SECOND_DEV = 'https://pub-13cc9cc075664a129c48949c52d1908f.r2.dev';
const CACHE = 'public, max-age=31536000, immutable';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
});
const BUCKET = process.env.R2_BUCKET_NAME!;

const log = (...a: unknown[]) => console.log(...a);
const head = async (url: string) => (await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) }).catch(() => null))?.status ?? 0;

/** Plain-URL image columns (table, column) that can hold any of the hosts we migrate. */
const TEXT_COLS: [string, string][] = [
  ['Startup', 'logoUrl'], ['AiTool', 'logoUrl'], ['Article', 'coverImage'], ['Article', 'thumbnailImage'], ['Article', 'ogImage'],
  ['JobBoardEmployer', 'logoUrl'], ['Event', 'coverImageUrl'],
  ['FounderUser', 'avatar'], ['UnifiedUser', 'avatar'], ['WebUser', 'avatar'], ['EventOrganizer', 'avatar'],
];
/** JSON columns holding second-bucket URLs (founder photos, screenshot metadata, newsletter blocks). */
const JSON_COLS: [string, string][] = [['Startup', 'foundersData'], ['AiTool', 'screenshotMeta'], ['NewsletterCampaign', 'contentJson']];

const IMPORT_HOSTS = /^(t3\.gstatic\.com|assets\.devfolio\.co|formulateai\.in|cognivantalabs\.com)$/;

async function copyToR2(key: string, body: Buffer, contentType: string) {
  await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: CACHE }));
  const status = await head(`${MEDIA}/${key}`);
  if (status !== 200) throw new Error(`copied ${key} but ${MEDIA} returns ${status}`);
}

async function download(url: string): Promise<{ body: Buffer; type: string } | null> {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!res?.ok) return null;
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!type.startsWith('image/')) return null;
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length === 0 || body.length > 5 * 1024 * 1024) return null;
  return { body, type };
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' };

async function main() {
  log(APPLY ? '=== APPLY ===' : '=== DRY RUN (add --apply to write) ===');

  // ── Backup every value this script may touch ───────────────────────────────
  const backup: Record<string, unknown[]> = {};
  for (const [t, c] of TEXT_COLS) {
    backup[`${t}.${c}`] = await prisma.$queryRawUnsafe(`SELECT id, "${c}" v FROM "${t}" WHERE "${c}" LIKE 'http%' AND "${c}" NOT LIKE '${MEDIA}%'`);
  }
  for (const [t, c] of JSON_COLS) {
    backup[`${t}.${c}`] = await prisma.$queryRawUnsafe(`SELECT id, "${c}" v FROM "${t}" WHERE "${c}"::text LIKE '%r2.dev%'`);
  }
  backup['AiTool.screenshotUrls'] = await prisma.$queryRawUnsafe(`SELECT id, "screenshotUrls" v FROM "AiTool" WHERE array_to_string("screenshotUrls", ' ') LIKE '%r2.dev%'`);
  if (APPLY) {
    const dir = path.resolve(__dirname, '../.data/backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `media-urls-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(backup, null, 1));
    log('backup:', file);
  }

  // ── 2. Second bucket: copy what the main bucket lacks ──────────────────────
  const secondUrls = new Set<string>();
  const collect = (s: string) => (s.match(/https:\/\/pub-13cc9cc075664a129c48949c52d1908f\.r2\.dev\/[^"\s,\\)]+/g) ?? []).forEach((u) => secondUrls.add(u));
  for (const rows of Object.values(backup)) for (const r of rows as { v: unknown }[]) collect(JSON.stringify(r.v));
  let identical = 0, copied = 0;
  const gone: string[] = [];
  for (const u of secondUrls) {
    const key = u.slice(SECOND_DEV.length + 1);
    if ((await head(`${MEDIA}/${key}`)) === 200) { identical++; continue; }
    const file = await download(u);
    if (!file) { gone.push(u); continue; }
    if (APPLY) await copyToR2(key, file.body, file.type);
    copied++;
  }
  log(`second bucket: ${secondUrls.size} files, ${identical} already in main, ${copied} ${APPLY ? 'copied' : 'to copy'}, ${gone.length} missing everywhere`);

  // ── 3/4. Hot-linked images: import, or clear when already broken ──────────
  const imported = new Map<string, string>();
  const broken: { table: string; col: string; id: string; url: string }[] = [];
  for (const [t, c] of TEXT_COLS) {
    for (const r of backup[`${t}.${c}`] as { id: string; v: string }[]) {
      const url = r.v;
      if (url.startsWith(MAIN_DEV) || url.startsWith(SECOND_DEV)) continue;
      let host: string;
      try { host = new URL(url).hostname; } catch { continue; }
      if (host === 'localhost' || host === '127.0.0.1') continue;
      const importable = IMPORT_HOSTS.test(host);
      if (!importable && !url.startsWith('https://images.unsplash.com')) continue; // sign-in avatars stay
      if (imported.has(url)) continue;
      const file = await download(url);
      if (!file) { broken.push({ table: t, col: c, id: r.id, url }); continue; }
      if (!importable) continue; // Unsplash: reachable, keep hot-linking
      const key = `imported/${crypto.createHash('sha256').update(url).digest('hex').slice(0, 24)}.${EXT[file.type] ?? 'img'}`;
      if (APPLY) await copyToR2(key, file.body, file.type);
      imported.set(url, `${MEDIA}/${key}`);
    }
  }
  log(`external: ${imported.size} ${APPLY ? 'imported' : 'to import'}, ${broken.length} already broken (to clear)`);
  for (const b of broken) log(`  broken ${b.table}.${b.col} ${b.id}: ${b.url.slice(0, 90)}`);

  if (!APPLY) {
    const mainRows = Object.entries(backup).reduce((n, [k, rows]) => n + (rows as { v: unknown }[]).filter((r) => JSON.stringify(r.v).includes(MAIN_DEV)).length, 0);
    log(`main bucket rows to re-point: ${mainRows}`);
    await prisma.$disconnect();
    return;
  }

  // ── Database updates ───────────────────────────────────────────────────────
  // Gone second-bucket files stay on their old URL: rewriting them changes nothing (404 either way).
  const goneKeys = gone.map((u) => u.slice(SECOND_DEV.length));
  let changed = 0;
  await prisma.$transaction(async (tx) => {
    for (const [t, c] of TEXT_COLS) {
      changed += await tx.$executeRawUnsafe(`UPDATE "${t}" SET "${c}" = replace("${c}", $1, $2) WHERE "${c}" LIKE $1 || '%'`, MAIN_DEV, MEDIA);
      changed += await tx.$executeRawUnsafe(`UPDATE "${t}" SET "${c}" = replace("${c}", $1, $2) WHERE "${c}" LIKE $1 || '%' AND NOT ("${c}" = ANY($3::text[]))`, SECOND_DEV, MEDIA, gone);
    }
    for (const [t, c] of JSON_COLS) {
      changed += await tx.$executeRawUnsafe(`UPDATE "${t}" SET "${c}" = replace(replace("${c}"::text, $1, $3), $2, $3)::jsonb WHERE "${c}"::text LIKE '%r2.dev%'`, MAIN_DEV, SECOND_DEV, MEDIA);
    }
    changed += await tx.$executeRawUnsafe(`
      UPDATE "AiTool" SET "screenshotUrls" = ARRAY(
        SELECT replace(replace(x, $1, $3), $2, $3) FROM unnest("screenshotUrls") WITH ORDINALITY AS u(x, n) ORDER BY n)
      WHERE array_to_string("screenshotUrls", ' ') LIKE '%r2.dev%'`, MAIN_DEV, SECOND_DEV, MEDIA);
    for (const [from, to] of imported) {
      for (const [t, c] of TEXT_COLS) changed += await tx.$executeRawUnsafe(`UPDATE "${t}" SET "${c}" = $2 WHERE "${c}" = $1`, from, to);
    }
    for (const b of broken) changed += await tx.$executeRawUnsafe(`UPDATE "${b.table}" SET "${b.col}" = NULL WHERE id = $1 AND "${b.col}" = $2`, b.id, b.url);
    // A gone second-bucket file used as an article's share image: clear it so the cover is used instead.
    for (const k of goneKeys) changed += await tx.$executeRawUnsafe(`UPDATE "Article" SET "ogImage" = NULL WHERE "ogImage" = $1`, SECOND_DEV + k);
  }, { timeout: 120_000 });
  log(`rows updated: ${changed}`);

  // ── Verify ─────────────────────────────────────────────────────────────────
  const left: string[] = [];
  for (const [t, c] of [...TEXT_COLS, ...JSON_COLS]) {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::int n FROM "${t}" WHERE "${c}"::text LIKE '%r2.dev%'`);
    if (r[0].n) left.push(`${t}.${c}: ${r[0].n}`);
  }
  const s: { n: number }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::int n FROM "AiTool" WHERE array_to_string("screenshotUrls", ' ') LIKE '%r2.dev%'`);
  if (s[0].n) left.push(`AiTool.screenshotUrls: ${s[0].n}`);
  log('r2.dev references left:', left.length ? left : 'none');
  log('gone (left on old URL, already broken):', gone);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
