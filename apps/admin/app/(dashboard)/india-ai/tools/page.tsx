import { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { neon } from '@neondatabase/serverless';
import IndianToolsTable, { type IndianToolRow } from './IndianToolsTable';

const sql = neon(process.env.DATABASE_URL!);

export const metadata: Metadata = {
  title: 'Indian AI Tools | Admin',
};

export default async function IndianAIToolsPage() {
  const found = await sql`
    SELECT id, name, tagline, category, "logoUrl", "websiteUrl", headquarters, "fundingStatus", "isFeatured",
           "isActive", "displayOrder"
    FROM "IndianAITool"
    ORDER BY "isFeatured" DESC, "displayOrder" ASC
  `;
  const rows: IndianToolRow[] = found.map((r) => ({
    id: r.id, name: r.name, tagline: r.tagline, category: r.category, logoUrl: r.logoUrl, websiteUrl: r.websiteUrl, headquarters: r.headquarters,
    fundingStatus: r.fundingStatus, isFeatured: !!r.isFeatured, isActive: !!r.isActive, displayOrder: Number(r.displayOrder),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="portal-title">Indian AI tools</h1>
          <p className="portal-subtitle">Made in India AI products on the India AI pages: {rows.length.toLocaleString('en-IN')} tools, {rows.filter((t) => t.isFeatured).length} featured.</p>
        </div>
        <Link href="/india-ai/tools/new" className="btn-brand text-sm inline-flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" aria-hidden /> Add tool
        </Link>
      </div>
      <IndianToolsTable rows={rows} />
    </div>
  );
}
