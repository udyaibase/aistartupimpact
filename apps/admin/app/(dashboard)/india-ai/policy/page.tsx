import { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { neon } from '@neondatabase/serverless';
import PolicyTable, { type PolicyRow } from './PolicyTable';

const sql = neon(process.env.DATABASE_URL!);

export const metadata: Metadata = {
  title: 'Policy Updates | Admin',
};

export default async function PolicyUpdatesPage() {
  const found = await sql`
    SELECT id, title, source, category, impact, link, "displayOrder", "isActive", date::text AS date
    FROM "PolicyUpdate"
    ORDER BY "displayOrder" ASC, date DESC
  `;
  const rows: PolicyRow[] = found.map((r) => ({
    id: r.id, title: r.title, source: r.source, category: r.category, impact: r.impact, link: r.link,
    displayOrder: Number(r.displayOrder), date: r.date, isActive: !!r.isActive,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="portal-title">Policy updates</h1>
          <p className="portal-subtitle">AI policy news and announcements on the India AI pages: {rows.length.toLocaleString('en-IN')} in all, {rows.filter((u) => u.impact === 'High').length} marked high impact.</p>
        </div>
        <Link href="/india-ai/policy/new" className="btn-brand text-sm inline-flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" aria-hidden /> Add update
        </Link>
      </div>
      <PolicyTable rows={rows} />
    </div>
  );
}
