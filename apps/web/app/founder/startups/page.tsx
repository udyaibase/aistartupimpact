import { requireFounderAuth } from '@/lib/founder-auth';
import { rolesByOwner, workspaceOwnerIds } from '@/lib/founder/access';
import { pendingEditCounts } from '@/lib/founder/listing-access';
import { prisma } from '@udyaibase/database';
import Link from 'next/link';
import { Plus, Rocket } from 'lucide-react';
import ListingsList from '@/components/founder/ListingsList';
import { EmptyGuide } from '@/components/founder/Guidance';

// Revalidate every 10 seconds to show fresh data
export const revalidate = 10;

export default async function StartupsPage() {
  const session = await requireFounderAuth();
  const [ownerIds, roles] = await Promise.all([workspaceOwnerIds(session), rolesByOwner(session)]);

  // Fetch all startups owned by this founder using raw query
  const startups = await prisma.$queryRaw<any[]>`
    SELECT 
      id, name, slug, tagline, "logoUrl", "claimStatus", "ownerId", "isVerified", "isApproved"
    FROM "Startup"
    WHERE "ownerId" = ANY(${ownerIds})
      AND "deletedAt" IS NULL
    ORDER BY "createdAt" DESC
  `;

  const pendingCounts = await pendingEditCounts('startup', startups.map((l) => l.id));
  const rows = startups.map((l) => ({ ...l, role: roles.get(l.ownerId) ?? 'VIEWER', pendingEdits: pendingCounts.get(l.id) ?? 0 }));
  const ownsOne = startups.some((l) => l.ownerId === session.userId);

  // Group by status
  const pending = startups.filter(s => s.claimStatus === 'PENDING');
  const live = startups.filter(s => s.claimStatus === 'CLAIMED' || s.claimStatus === 'VERIFIED');
  const rejected = startups.filter(s => s.claimStatus === 'REJECTED');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <h1 className="portal-title">
            Your startup
          </h1>
          <p className="portal-subtitle">
            Keep your startup’s listing up to date
          </p>
        </div>
        {!ownsOne && (
<Link
          href="/founder/startups/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Submit Startup
        </Link>
        )}
      </div>

      {/* Stats */}
      {startups.length > 1 && (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Total</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{startups.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Live</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{live.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Pending</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{pending.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Rejected</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{rejected.length}</p>
        </div>
      </div>
      )}

      {/* Listings */}
      {startups.length === 0 ? (
        <EmptyGuide
          icon={Rocket}
          title="You haven’t listed a startup yet"
          action={<Link href="/founder/startups/new" className="btn-brand gap-2"><Plus className="w-4 h-4" aria-hidden /> List your startup</Link>}
        >
          List your startup so people can find it on Udyaibase. We review every submission and email you once it’s live. After that you can verify ownership, post jobs and share updates.
        </EmptyGuide>
      ) : (
        <ListingsList items={rows} type="startup" />
      )}
    </div>
  );
}
