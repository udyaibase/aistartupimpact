'use client';

import { notify } from '@/components/Toast';
import RejectToolDialog from '@/components/RejectToolDialog';
import FounderActivityPanel from '@/components/FounderActivityPanel';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, Ban, CheckSquare } from 'lucide-react';
import { getFounderByIdAction, deleteFounderAction, updateFounderStatusAction } from './actions';
import { useSession } from 'next-auth/react';
import { ConfirmModal } from '@/components/ConfirmModal';
import type { ConfirmRequest, FounderDetail } from './types';
import StartupReviewModal from './StartupReviewModal';
import FounderSubmissions from './FounderSubmissions';
import FounderOverview from './FounderOverview';

export default function FounderDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const { data: session } = useSession();
  const [founder, setFounder] = useState<FounderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Viewing details modal state
  const [viewingStartup, setViewingStartup] = useState<any | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingTool, setRejectingTool] = useState<{ id: string; name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmRequest | null>(null);

  const isSuperAdmin = (session as any)?.user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    loadFounder();
  }, [params.id]);

  const loadFounder = async () => {
    setLoading(true);
    setError(null);
    const result = await getFounderByIdAction(params.id);
    if (result.success) {
      setFounder(result.data as FounderDetail);
    } else {
      setError(result.error || 'Failed to load founder details');
    }
    setLoading(false);
  };

  const handleDelete = () => {
    setConfirmAction({
      title: `Delete ${founder?.name}`,
      message: `This erases the founder's account:
- Their sign-in and personal details
- Listings they submitted, and their stories and updates
- Their photos

Directory listings they only claimed stay public, without an owner. Paid invoices are kept, without personal details. This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete',
      requireTyping: true,
      onConfirm: async () => {
        const result = await deleteFounderAction(params.id);
        if (result.success) {
          notify('Founder deleted successfully');
          router.push('/founders');
        } else {
          notify(`Failed to delete: ${result.error}`);
        }
        setConfirmAction(null);
      },
    });
  };

  const handleStatusChange = (newStatus: string) => {
    const statusNames: Record<string, string> = {
      'ACTIVE': 'activate',
      'SUSPENDED': 'suspend',
      'PENDING_VERIFICATION': 'set to pending verification'
    };

    setConfirmAction({
      title: `${statusNames[newStatus]?.replace(/^\w/, (c) => c.toUpperCase())} Founder`,
      message: `Are you sure you want to ${statusNames[newStatus]} ${founder?.name}?`,
      variant: 'warning',
      confirmLabel: statusNames[newStatus]?.replace(/^\w/, (c) => c.toUpperCase()) || 'Confirm',
      requireTyping: false,
      onConfirm: async () => {
        const result = await updateFounderStatusAction(params.id, newStatus);
        if (result.success) {
          notify('Status updated successfully');
          loadFounder();
        } else {
          notify(`Failed to update status: ${result.error}`);
        }
        setConfirmAction(null);
      },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </div>
    );
  }

  if (error || !founder) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <p className="text-red-900 dark:text-red-200">{error || 'Founder not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {rejectingTool && (
        <RejectToolDialog
          toolName={rejectingTool.name}
          onCancel={() => setRejectingTool(null)}
          onReject={async (reason) => {
            const res = await fetch(`/api/admin/tools/${rejectingTool.id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).catch(() => null);
            if (!res?.ok) return 'Couldn’t reject this tool. Try again.';
            setRejectingTool(null);
            loadFounder();
          }}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white font-jakarta"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Founders
        </button>
        
        {/* Super Admin Actions */}
        {isSuperAdmin && founder && (
          <div className="flex items-center gap-2">
            {/* Status Actions */}
            {founder.status === 'ACTIVE' ? (
              <button
                onClick={() => handleStatusChange('SUSPENDED')}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Ban className="w-4 h-4" />
                Suspend
              </button>
            ) : founder.status === 'SUSPENDED' ? (
              <button
                onClick={() => handleStatusChange('ACTIVE')}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <CheckSquare className="w-4 h-4" />
                Activate
              </button>
            ) : null}
            
            {/* Delete Button */}
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Founder
            </button>
          </div>
        )}
      </div>

      <FounderOverview founder={founder} />

      <FounderSubmissions founder={founder} setViewingStartup={setViewingStartup} setIsRejecting={setIsRejecting} setRejectReason={setRejectReason} setConfirmAction={setConfirmAction} setRejectingTool={setRejectingTool} loadFounder={loadFounder} />

      {/* Confirm Modal */}
      <ConfirmModal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={confirmAction?.onConfirm ?? (() => {})}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        confirmLabel={confirmAction?.confirmLabel}
        variant={confirmAction?.variant}
        requireTyping={confirmAction?.requireTyping}
      />

      {/* Startup Details Modal */}
      <StartupReviewModal viewingStartup={viewingStartup} setViewingStartup={setViewingStartup} isRejecting={isRejecting} setIsRejecting={setIsRejecting} rejectReason={rejectReason} setRejectReason={setRejectReason} actionLoading={actionLoading} setActionLoading={setActionLoading} setConfirmAction={setConfirmAction} loadFounder={loadFounder} founder={founder} />
      {isSuperAdmin && founder && <FounderActivityPanel founderId={founder.id} />}
    </div>
  );
}
