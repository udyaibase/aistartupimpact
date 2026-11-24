/**
 * Read-only: how readable are the resumes we hold? Counts scanned (image-only) resumes, two-column layouts and
 * resumes longer than the old 3-page limit, to decide whether OCR is worth building (resume engine step 1).
 * Prints totals only: no names, emails or resume text.
 * Run from apps/web: npx dotenv-cli -e ../../.env -- npx tsx --tsconfig tsconfig.json scripts/resume-scan-stats.ts [limit]
 */
import { prisma } from '@udyaibase/database';
import { readResume } from '../lib/jobs/resume-storage';
import { sniffResume } from '../lib/jobs/resume-text';
import { extractResume, MAX_PAGES } from '../lib/jobs/resume-extract';

(async () => {
  const limit = Number(process.argv[2] ?? 1000);
  const rows = await prisma.jobBoardApplication.findMany({
    where: { resumeKey: { not: null } }, orderBy: { appliedAt: 'desc' }, take: limit, select: { resumeKey: true },
  });
  const t = { files: rows.length, unreadableFile: 0, pdf: 0, docx: 0, noText: 0, someScannedPages: 0, twoColumn: 0, over3Pages: 0, overMaxPages: 0 };
  const charsList: number[] = [];
  for (const r of rows) {
    try {
      const bytes = await readResume(r.resumeKey!);
      const kind = sniffResume(bytes);
      if (!kind) { t.unreadableFile++; continue; }
      t[kind.ext]++;
      const x = await extractResume(bytes, kind);
      charsList.push(x.chars);
      if (x.chars < 50) t.noText++;
      else if (x.lowTextPages.length) t.someScannedPages++;
      if (x.twoColumnPages.length) t.twoColumn++;
      if (x.pageCount > 3) t.over3Pages++;
      if (x.pageCount > MAX_PAGES) t.overMaxPages++;
    } catch {
      t.unreadableFile++;
    }
  }
  const pct = (n: number) => (t.files ? `${((n / t.files) * 100).toFixed(1)}%` : '-');
  charsList.sort((a, b) => a - b);
  console.log(`Resumes checked: ${t.files} (PDF ${t.pdf}, Word ${t.docx}, couldn't open ${t.unreadableFile})`);
  console.log(`No text at all (fully scanned): ${t.noText} (${pct(t.noText)})`);
  console.log(`Some pages scanned: ${t.someScannedPages} (${pct(t.someScannedPages)})`);
  console.log(`Needs OCR in total: ${t.noText + t.someScannedPages} (${pct(t.noText + t.someScannedPages)})`);
  console.log(`Two-column layout: ${t.twoColumn} (${pct(t.twoColumn)})`);
  console.log(`Longer than 3 pages (text the old reader missed): ${t.over3Pages} (${pct(t.over3Pages)}); over ${MAX_PAGES}: ${t.overMaxPages}`);
  if (charsList.length) console.log(`Characters per resume: median ${charsList[Math.floor(charsList.length / 2)]}, 90th percentile ${charsList[Math.floor(charsList.length * 0.9)]}`);
  await prisma.$disconnect();
})();
