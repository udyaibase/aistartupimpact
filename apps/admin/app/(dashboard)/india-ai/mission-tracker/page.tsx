import { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { neon } from '@neondatabase/serverless';
import PillarsTable, { type PillarRow } from './PillarsTable';

const sql = neon(process.env.DATABASE_URL!);

export const metadata: Metadata = {
  title: 'IndiaAI Mission Tracker | Admin',
};

/** Stored budget units per crore rupees (the same divisor this page has always used). */
const toCr = (val: string | number | bigint | null) => Number(val ?? 0) / 10000000000;

export default async function MissionTrackerPage() {
  const pillars = await sql`
    SELECT id, component, "budgetAllocated", "budgetDisbursed", "displayOrder", "isActive"
    FROM "IndiaAIMissionTracker"
    ORDER BY "displayOrder" ASC, "updatedAt" DESC
  `;

  const totalCr = pillars.filter((p) => p.isActive).reduce((s, p) => s + toCr(p.budgetAllocated), 0);
  const rows: PillarRow[] = pillars.map((p) => ({
    id: p.id, component: p.component, allocatedCr: toCr(p.budgetAllocated), disbursedCr: toCr(p.budgetDisbursed),
    share: totalCr > 0 ? (toCr(p.budgetAllocated) / totalCr) * 100 : 0, displayOrder: Number(p.displayOrder), isActive: !!p.isActive,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="portal-title">IndiaAI Mission tracker</h1>
          <p className="portal-subtitle">
            Budget by mission pillar. Active pillars total ₹{totalCr.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr.
          </p>
        </div>
        <Link href="/india-ai/mission-tracker/new" className="btn-brand text-sm inline-flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" aria-hidden /> Add pillar
        </Link>
      </div>
      <PillarsTable rows={rows} />
    </div>
  );
}
