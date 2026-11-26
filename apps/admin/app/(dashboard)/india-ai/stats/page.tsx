import { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { neon } from '@neondatabase/serverless';
import StatsTable, { type StatRow } from './StatsTable';

export const metadata: Metadata = {
  title: 'India AI Stats | Admin',
  description: 'Manage India AI live statistics',
};

async function getStats(): Promise<StatRow[]> {
  const sql = neon(process.env.DATABASE_URL!);
  const stats = await sql`
    SELECT id, "displayOrder", "metricLabel", "metricKey", "metricValue", "metricChange", "metricIcon", "isActive",
           "lastUpdated"::text AS "lastUpdated"
    FROM "IndiaAIStats"
    ORDER BY "displayOrder" ASC, "createdAt" DESC
  `;
  return stats.map((s) => ({
    id: s.id, displayOrder: Number(s.displayOrder), metricLabel: s.metricLabel, metricKey: s.metricKey, metricValue: String(s.metricValue),
    metricChange: s.metricChange, metricIcon: s.metricIcon, isActive: !!s.isActive, lastUpdated: s.lastUpdated,
  }));
}

export default async function IndiaAIStatsPage() {
  const stats = await getStats();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="portal-title">India AI live statistics</h1>
          <p className="portal-subtitle">The live counters at the top of the India AI page.</p>
        </div>
        <Link href="/india-ai/stats/new" className="btn-brand text-sm inline-flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" aria-hidden /> Add statistic
        </Link>
      </div>
      <StatsTable rows={stats} />
    </div>
  );
}
