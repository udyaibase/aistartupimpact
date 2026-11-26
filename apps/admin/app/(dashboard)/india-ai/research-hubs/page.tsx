import { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { neon } from '@neondatabase/serverless';
import InstitutionsTable, { type InstitutionRow } from './InstitutionsTable';

const sql = neon(process.env.DATABASE_URL!);

export const metadata: Metadata = {
  title: 'AI Research Institutions | Admin',
};

export default async function ResearchHubsPage() {
  const institutions = await sql`
    SELECT
      id, name, city, state, tag, category, "aiCentre",
      faculty, programs, "displayOrder", link, "isActive",
      "createdAt"::text as "createdAt"
    FROM "AIResearchInstitution"
    ORDER BY "displayOrder" ASC, "createdAt" DESC
  `;

  const rows: InstitutionRow[] = institutions.map((i) => ({
    id: i.id, name: i.name, city: i.city, state: i.state, tag: i.tag, category: i.category, aiCentre: i.aiCentre,
    displayOrder: Number(i.displayOrder), link: i.link, isActive: !!i.isActive,
  }));
  const count = (category: string) => rows.filter((i) => i.category === category).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="portal-title">AI research institutions</h1>
          <p className="portal-subtitle">
            Research hubs and talent centres on the India AI pages: {rows.length.toLocaleString('en-IN')} in all, {count('AI Centre')} AI centres and {count('Dedicated AI Dept')} dedicated AI departments.
          </p>
        </div>
        <Link href="/india-ai/research-hubs/new" className="btn-brand text-sm inline-flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" aria-hidden /> Add institution
        </Link>
      </div>
      <InstitutionsTable rows={rows} />
    </div>
  );
}
