import { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { neon } from '@neondatabase/serverless';
import FeaturedFoundersTable, { type FeaturedFounderRow } from './FeaturedFoundersTable';

const sql = neon(process.env.DATABASE_URL!);

export const metadata: Metadata = {
  title: 'Featured Founders | Admin',
};

export default async function FeaturedFoundersPage() {
  const found = await sql`
    SELECT id, name, "startupName", achievement, category, "fundingRaised", "photoUrl", "linkedinUrl", "storyUrl",
           "isActive", "displayOrder"
    FROM "FeaturedFounder"
    ORDER BY "displayOrder" ASC, "createdAt" DESC
  `;
  const rows: FeaturedFounderRow[] = found.map((r) => ({
    id: r.id, name: r.name, startupName: r.startupName, achievement: r.achievement, category: r.category, fundingRaised: r.fundingRaised,
    photoUrl: r.photoUrl, linkedinUrl: r.linkedinUrl, storyUrl: r.storyUrl, isActive: !!r.isActive, displayOrder: Number(r.displayOrder),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="portal-title">Featured founders</h1>
          <p className="portal-subtitle">The founder spotlight on the India AI pages: {rows.length.toLocaleString('en-IN')} founders.</p>
        </div>
        <Link href="/india-ai/founders/new" className="btn-brand text-sm inline-flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" aria-hidden /> Add founder
        </Link>
      </div>
      <FeaturedFoundersTable rows={rows} />
    </div>
  );
}
