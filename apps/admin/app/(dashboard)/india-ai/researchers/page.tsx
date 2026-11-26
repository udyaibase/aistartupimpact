import { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { neon } from '@neondatabase/serverless';
import ResearchersTable, { type ResearcherRow } from './ResearchersTable';

const sql = neon(process.env.DATABASE_URL!);

export const metadata: Metadata = {
  title: 'AI Researchers | Admin',
};

export default async function ResearchersPage() {
  const found = await sql`
    SELECT id, name, university, position, "photoUrl", "researchAreas", "linkedinUrl", "googleScholarUrl",
           citations, "hIndex", "displayOrder", "isActive"
    FROM "AIResearcher"
    ORDER BY "displayOrder" ASC, citations DESC
  `;
  const rows: ResearcherRow[] = found.map((r) => ({
    id: r.id, name: r.name, university: r.university, position: r.position, photoUrl: r.photoUrl, researchAreas: r.researchAreas ?? [],
    linkedinUrl: r.linkedinUrl, googleScholarUrl: r.googleScholarUrl, citations: Number(r.citations), hIndex: Number(r.hIndex),
    displayOrder: Number(r.displayOrder), isActive: !!r.isActive,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="portal-title">AI researchers</h1>
          <p className="portal-subtitle">The researcher directory on the India AI pages: {rows.length.toLocaleString('en-IN')} researchers, {rows.filter((r) => r.isActive).length} shown on the site.</p>
        </div>
        <Link href="/india-ai/researchers/new" className="btn-brand text-sm inline-flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" aria-hidden /> Add researcher
        </Link>
      </div>
      <ResearchersTable rows={rows} />
    </div>
  );
}
