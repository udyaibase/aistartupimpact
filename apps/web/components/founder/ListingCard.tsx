import Image from 'next/image';
import Link from 'next/link';
import { Clock, CheckCircle, XCircle, Edit, Shield, AlertCircle, BarChart } from 'lucide-react';
import { VerifiedBadge } from '@/components/VerifiedBadge';

interface ListingCardProps {
  id: string;
  slug: string; // Added slug
  name: string;
  tagline: string;
  logoUrl: string | null;
  status: string;
  type: 'startup' | 'tool';
  isVerified?: boolean;
  /** Already public on the site (a live listing whose latest edits are in review). */
  isPublic?: boolean;
  /** This person's role, when it's a teammate's listing. */
  role?: string;
  /** Fields waiting for our team. */
  pendingEdits?: number;
}

const statusConfig: Record<string, { color: string; icon: typeof Clock; label: string }> = {
  UNCLAIMED: {
    color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    icon: Clock,
    label: 'Unclaimed',
  },
  PENDING: {
    color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    icon: Clock,
    label: 'In review',
  },
  CLAIMED: {
    color: 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/30',
    icon: CheckCircle,
    label: 'Live',
  },
  VERIFIED: {
    color: 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/30',
    icon: CheckCircle,
    label: 'Verified',
  },
  REJECTED: {
    color: 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50',
    icon: XCircle,
    label: 'Not approved',
  },
};

/** What this status means for the founder and what to do next. Nothing when there's nothing to do. */
function nextStep(status: string, type: 'startup' | 'tool', isVerified: boolean, isPublic: boolean): string | null {
  if (status === 'PENDING') {
    return isPublic
      ? 'We’re reviewing your latest edits. Your listing stays public in the meantime.'
      : 'We’re reviewing this listing. It isn’t public yet, and we’ll email you once it’s live.';
  }
  if (status === 'REJECTED') {
    return 'We emailed you the reason. Edit and save this listing to send it for another review.';
  }
  if (status === 'CLAIMED' && type === 'startup' && !isVerified) {
    return 'Your listing is live. Verify ownership to get the Verified badge and post jobs.';
  }
  return null;
}

export default function ListingCard({ id, slug, name, tagline, logoUrl, status, type, isVerified = false, isPublic = false, role = 'OWNER', pendingEdits = 0 }: ListingCardProps) {
  const isOwner = role === 'OWNER';
  const canEdit = role !== 'VIEWER';
  const hint = nextStep(status, type, isVerified, isPublic);
  const config = statusConfig[status] || statusConfig.UNCLAIMED;
  const StatusIcon = config.icon;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
      <div className="flex items-start gap-3 p-3">
        {/* Logo */}
        <div className="relative w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
          {logoUrl ? (
            <Image src={logoUrl} alt={name} width={40} height={40} sizes="40px" className="w-full h-full object-cover rounded-lg" />
          ) : (
            <span className="text-base font-bold text-gray-400 dark:text-gray-600">
              {name.charAt(0)}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {name}
              </h3>
              {isVerified && <VerifiedBadge size="sm" />}
            </div>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color} shrink-0`}>
              <StatusIcon className="w-3 h-3" />
              {config.label}
            </span>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mb-2">
            {tagline}
          </p>
          {hint && <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">{hint}</p>}
          {pendingEdits > 0 && <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">{pendingEdits === 1 ? '1 change is' : `${pendingEdits} changes are`} waiting for our team. Your listing shows the current version until then.</p>}
          {!isOwner && <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Shared with you as {role.charAt(0) + role.slice(1).toLowerCase()}</p>}
          
          {/* Actions */}
          <div className="flex items-center gap-2">
            {canEdit && (
              <Link
                href={`/founder/${type === 'startup' ? 'startups' : 'tools'}/${slug}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              >
                <Edit className="w-3 h-3" />
                Edit
              </Link>
            )}
            {type === 'tool' && (
              <Link
                href={`/founder/tools/${slug}/analytics`}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              >
                <BarChart className="w-3 h-3" />
                Analytics
              </Link>
            )}
            {isOwner && !isVerified && type === 'startup' && status !== 'REJECTED' && (
              <Link
                href={`/founder/claim/${id}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              >
                <Shield className="w-3 h-3" />
                Verify
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
