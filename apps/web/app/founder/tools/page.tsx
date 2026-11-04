import { requireFounderAuth } from '@/lib/founder-auth';
import { rolesByOwner, workspaceOwnerIds } from '@/lib/founder/access';
import { pendingEditCounts } from '@/lib/founder/listing-access';
import { prisma } from '@udyaibase/database';
import Link from 'next/link';
import { Plus, Wrench } from 'lucide-react';
import ListingsList from '@/components/founder/ListingsList';
import { EmptyGuide } from '@/components/founder/Guidance';

// Revalidate every 10 seconds to show fresh data
export const revalidate = 10;

export default async function ToolsPage() {
  const session = await requireFounderAuth();
  const [ownerIds, roles] = await Promise.all([workspaceOwnerIds(session), rolesByOwner(session)]);

  // Fetch all tools owned by this founder using raw query
  const tools = await prisma.$queryRaw<any[]>`
    SELECT 
      id, name, slug, tagline, "logoUrl", "claimStatus", "ownerId"
    FROM "AiTool"
    WHERE "ownerId" = ANY(${ownerIds})
      AND "deletedAt" IS NULL
    ORDER BY "createdAt" DESC
  `;

  const pendingCounts = await pendingEditCounts('tool', tools.map((l) => l.id));
  const rows = tools.map((l) => ({ ...l, role: roles.get(l.ownerId) ?? 'VIEWER', pendingEdits: pendingCounts.get(l.id) ?? 0 }));
  const ownsOne = tools.some((l) => l.ownerId === session.userId);

  // Group by status
  const pending = tools.filter(t => t.claimStatus === 'PENDING');
  const live = tools.filter(t => t.claimStatus === 'CLAIMED' || t.claimStatus === 'VERIFIED');
  const rejected = tools.filter(t => t.claimStatus === 'REJECTED');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <h1 className="portal-title">
            Your AI tool
          </h1>
          <p className="portal-subtitle">
            Keep your AI tool’s listing up to date
          </p>
        </div>
        {!ownsOne && (
<Link
          href="/founder/tools/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Submit Tool
        </Link>
        )}
      </div>

      {/* Stats */}
      {tools.length > 1 && (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Total</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{tools.length}</p>
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
      {tools.length === 0 ? (
        <EmptyGuide
          icon={Wrench}
          title="You haven’t listed a tool yet"
          action={<Link href="/founder/tools/new" className="btn-brand gap-2"><Plus className="w-4 h-4" aria-hidden /> List your tool</Link>}
        >
          Built an AI product? List it so people can discover it in the tools directory. We review every submission and email you once it’s live.
        </EmptyGuide>
      ) : (
        <ListingsList items={rows} type="tool" />
      )}
    </div>
  );
}
