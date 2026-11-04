/**
 * Builds the REVIEW LIST for the "claim your startup" invitation. It reads public web pages and writes a CSV. It
 * sends nothing, and writes nothing to the database.
 *
 * Only unclaimed, approved startups. Only addresses published on the company's own website, on its own domain, and
 * only shared role inboxes (hello@, info@...), never a person's address.
 *
 * Usage: npx dotenv-cli -e ../../.env -- tsx scripts/collect-claim-contacts.ts <output.csv>
 * The CSV contains email addresses: keep it out of git.
 */
import { writeFileSync } from 'fs';
import { neon } from '@neondatabase/serverless';
import { fetchPublicHtml } from '../lib/embed/safe-fetch';

const ROLE_INBOXES = ['founders', 'founder', 'hello', 'hi', 'contact', 'info', 'team', 'connect', 'enquiry', 'enquiries', 'inquiry', 'inquiries', 'business', 'partnerships', 'partners', 'sales', 'admin', 'support', 'help'];
const PAGES = ['', '/contact', '/contact-us', '/about', '/about-us'];
const CONCURRENCY = 6;

const hostOf = (url: string) => {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
};

/** The best role inbox on the company's own domain, or null. */
export function pickRoleInbox(html: string, domain: string): string | null {
  const found = new Set((html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase()));
  for (const local of ROLE_INBOXES) {
    for (const email of found) {
      const [l, d] = email.split('@');
      if (l === local && (d === domain || d.endsWith(`.${domain}`))) return email;
    }
  }
  return null;
}

async function contactFor(website: string): Promise<{ email: string; page: string } | null> {
  const domain = hostOf(website);
  if (!domain) return null;
  for (const path of PAGES) {
    const url = new URL(`https://${domain}${path}`);
    const res = await fetchPublicHtml(url, { maxBytes: 400_000, timeoutMs: 6000 }).catch(() => null);
    if (!res || !res.ok) continue;
    const email = pickRoleInbox(res.html, domain);
    if (email) return { email, page: url.toString() };
  }
  return null;
}

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error('Pass the output CSV path.');
  const sql = neon(process.env.DATABASE_URL!);
  const startups = await sql`
    SELECT s.id, s.name, s.slug, s."websiteUrl",
      (SELECT COALESCE(SUM(a.views), 0)::int FROM "AnalyticsDaily" a
        WHERE a."entityType" = 'STARTUP' AND a."entityId" = s.id AND a.date >= CURRENT_DATE - 30) AS views
    FROM "Startup" s
    WHERE s."deletedAt" IS NULL AND s."isApproved" = true AND s."ownerId" IS NULL AND s."claimedBy" IS NULL
      AND s."websiteUrl" IS NOT NULL AND s."websiteUrl" <> ''
    ORDER BY s.name
  ` as { id: string; name: string; slug: string; websiteUrl: string; views: number }[];

  const rows: string[][] = [];
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < startups.length) {
      const s = startups[next++];
      const hit = await contactFor(s.websiteUrl).catch(() => null);
      if (hit) rows.push([s.id, s.name, s.slug, s.websiteUrl, hit.email, hit.page, String(s.views)]);
      if (++done % 50 === 0) console.log(`${done}/${startups.length} checked, ${rows.length} with an address`);
    }
  }));

  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ['startupId', 'name', 'slug', 'website', 'email', 'foundOn', 'views30d'];
  writeFileSync(out, [header, ...rows.sort((a, b) => a[1].localeCompare(b[1]))].map((r) => r.map(cell).join(',')).join('\n') + '\n');
  console.log(`Done: ${startups.length} checked, ${rows.length} with a public role address.`);
}

if (process.argv[1]?.includes('collect-claim-contacts')) {
  main().catch((e) => { console.error(String(e?.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, '[db]')); process.exit(1); });
}
