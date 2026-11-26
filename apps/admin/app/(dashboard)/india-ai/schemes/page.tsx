import { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { neon } from '@neondatabase/serverless';
import SchemesTable, { type SchemeRow } from './SchemesTable';

const sql = neon(process.env.DATABASE_URL!);

export const metadata: Metadata = {
  title: 'Government Schemes | Admin',
};

export default async function SchemesPage() {
  const found = await sql`
    SELECT id, name, "shortName", category, state, "fundingAmount", status, "applicationDeadline", "applyLink",
           "displayOrder", "isActive"
    FROM "GovernmentScheme"
    ORDER BY "displayOrder" ASC, "createdAt" DESC
  `;
  const rows: SchemeRow[] = found.map((r) => ({
    id: r.id, name: r.name, shortName: r.shortName, category: r.category, state: r.state, fundingAmount: r.fundingAmount,
    status: r.status, applicationDeadline: r.applicationDeadline, applyLink: r.applyLink, displayOrder: Number(r.displayOrder), isActive: !!r.isActive,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="portal-title">Government schemes</h1>
          <p className="portal-subtitle">AI funding schemes and programmes on the India AI pages: {rows.length.toLocaleString('en-IN')} in all, {rows.filter((s) => s.status === 'Open').length} open for applications.</p>
        </div>
        <Link href="/india-ai/schemes/new" className="btn-brand text-sm inline-flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" aria-hidden /> Add scheme
        </Link>
      </div>
      <SchemesTable rows={rows} />
    </div>
  );
}
