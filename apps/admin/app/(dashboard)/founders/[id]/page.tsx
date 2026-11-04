'use client';

import RejectToolDialog from '@/components/RejectToolDialog';
import FounderActivityPanel from '@/components/FounderActivityPanel';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Mail, Building2, Phone, Calendar, CheckCircle, XCircle, 
  Clock, Globe, Linkedin, Twitter, User, Briefcase, Shield, Eye,
  TrendingUp, Package, Wrench, Trash2, Ban, CheckSquare, X, ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import { getFounderByIdAction, deleteFounderAction, updateFounderStatusAction } from './actions';
import { useSession } from 'next-auth/react';
import { ConfirmModal } from '@/components/ConfirmModal';

interface FounderDetail {
  id: string;
  name: string;
  email: string;
  company: string | null;
  companyDomain: string | null;
  role: string | null;
  phone: string | null;
  linkedin: string | null;
  twitter: string | null;
  website: string | null;
  authProvider: string;
  googleId: string | null;
  emailVerified: boolean;
  status: string;
  deactivatedAt: string | null;
  onboardingCompleted: boolean;
  onboardingStep: number;
  avatar: string | null;
  bio: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  updatedAt: string;
  startups: Array<{
    id: string;
    name: string;
    slug: string;
    tagline: string;
    status: string;
    createdAt: string;
  }>;
  tools: Array<{
    id: string;
    name: string;
    slug: string;
    tagline: string;
    status: string;
    createdAt: string;
  }>;
}

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
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    variant: 'danger' | 'warning';
    confirmLabel: string;
    requireTyping: boolean;
    onConfirm: () => void;
  } | null>(null);

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
          alert('Founder deleted successfully');
          router.push('/founders');
        } else {
          alert(`Failed to delete: ${result.error}`);
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
          alert('Status updated successfully');
          loadFounder();
        } else {
          alert(`Failed to update status: ${result.error}`);
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

      {/* Founder Profile Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="bg-gradient-to-r from-brand to-purple-600 h-24" />
        <div className="px-6 pb-6">
          <div className="flex items-start gap-6 -mt-12">
            {/* Avatar */}
            <div className="w-24 h-24 rounded-xl bg-white dark:bg-gray-800 border-4 border-white dark:border-gray-900 flex items-center justify-center shadow-lg">
              {founder.avatar ? (
                <img src={founder.avatar} alt={founder.name} className="w-full h-full rounded-xl object-cover" />
              ) : (
                <User className="w-12 h-12 text-gray-400" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 mt-4">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white">{founder.name}</h1>
                  {founder.role && (
                    <p className="text-gray-600 dark:text-gray-400 font-jakarta mt-1">{founder.role}</p>
                  )}
                  {founder.company && (
                    <div className="flex items-center gap-2 mt-2">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">{founder.company}</span>
                      {founder.companyDomain && (
                        <span className="text-xs text-gray-400">({founder.companyDomain})</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2">
                  {founder.deactivatedAt && (
                    <span className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-sm font-semibold px-3 py-1.5 rounded-full">
                      Deactivated
                    </span>
                  )}
                  {founder.status === 'ACTIVE' ? (
                    <span className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-semibold px-3 py-1.5 rounded-full">
                      <CheckCircle className="w-4 h-4" />
                      Active
                    </span>
                  ) : founder.status === 'PENDING_VERIFICATION' ? (
                    <span className="inline-flex items-center gap-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-sm font-semibold px-3 py-1.5 rounded-full">
                      <Clock className="w-4 h-4" />
                      Pending
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-semibold px-3 py-1.5 rounded-full">
                      <XCircle className="w-4 h-4" />
                      {founder.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">Startups</p>
              <p className="text-2xl font-bold text-brand mt-1">{founder.startups.length}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-brand" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">AI Tools</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{founder.tools.length}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Wrench className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">Onboarding</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {founder.onboardingCompleted ? '✓' : `${founder.onboardingStep}/3`}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">Auth Method</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1 capitalize">
                {founder.authProvider}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Shield className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Contact & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Information */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-4">Contact Information</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">Email</p>
                <p className="text-sm text-gray-900 dark:text-white font-medium">{founder.email}</p>
                {founder.emailVerified && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 mt-1">
                    <CheckCircle className="w-3 h-3" />
                    Verified
                  </span>
                )}
              </div>
            </div>

            {founder.phone && (
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">Phone</p>
                  <p className="text-sm text-gray-900 dark:text-white font-medium">{founder.phone}</p>
                </div>
              </div>
            )}

            {founder.website && (
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">Website</p>
                  <a 
                    href={founder.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-brand hover:underline font-medium"
                  >
                    {founder.website}
                  </a>
                </div>
              </div>
            )}

            {founder.linkedin && (
              <div className="flex items-center gap-3">
                <Linkedin className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">LinkedIn</p>
                  <a 
                    href={founder.linkedin} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-brand hover:underline font-medium"
                  >
                    View Profile
                  </a>
                </div>
              </div>
            )}

            {founder.twitter && (
              <div className="flex items-center gap-3">
                <Twitter className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">Twitter</p>
                  <a 
                    href={founder.twitter} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-brand hover:underline font-medium"
                  >
                    View Profile
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Account Details */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-4">Account Details</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">Joined</p>
                <p className="text-sm text-gray-900 dark:text-white font-medium">
                  {new Date(founder.createdAt).toLocaleDateString('en-IN', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                  })}
                </p>
              </div>
            </div>

            {founder.lastLoginAt && (
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">Last Login</p>
                  <p className="text-sm text-gray-900 dark:text-white font-medium">
                    {new Date(founder.lastLoginAt).toLocaleDateString('en-IN', { 
                      day: 'numeric', 
                      month: 'long', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">Authentication</p>
                <p className="text-sm text-gray-900 dark:text-white font-medium capitalize">
                  {founder.authProvider}
                  {founder.googleId && ' (Google OAuth)'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Briefcase className="w-5 h-5 text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">Onboarding Status</p>
                <p className="text-sm text-gray-900 dark:text-white font-medium">
                  {founder.onboardingCompleted ? 'Completed' : `Step ${founder.onboardingStep} of 3`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Submissions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Startups */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-6 py-4">
            <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Startups ({founder.startups.length})</h2>
          </div>
          <div className="p-6">
            {founder.startups.length > 0 ? (
              <div className="space-y-3">
                {founder.startups.map((startup) => (
                  <div key={startup.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-brand transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{startup.name}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{startup.tagline}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                            startup.status === 'CLAIMED' || startup.status === 'VERIFIED'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : startup.status === 'PENDING'
                              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                              : startup.status === 'REJECTED'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
                          }`}>
                            {startup.status}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(startup.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0 justify-center">
                        <button 
                          onClick={() => {
                            setViewingStartup(startup);
                            setIsRejecting(false);
                            setRejectReason('');
                          }}
                          className="text-brand hover:underline text-xs font-bold flex items-center gap-1 justify-center py-1.5 border border-brand/20 bg-brand/5 hover:bg-brand/10 px-3 rounded-lg transition-colors cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-8 font-jakarta text-sm">No startups submitted yet</p>
            )}
          </div>
        </div>

        {/* Tools */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-6 py-4">
            <h2 className="font-sora font-bold text-lg text-navy dark:text-white">AI Tools ({founder.tools.length})</h2>
          </div>
          <div className="p-6">
            {founder.tools.length > 0 ? (
              <div className="space-y-3">
                {founder.tools.map((tool) => (
                  <div key={tool.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-brand transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{tool.name}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{tool.tagline}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                            tool.status === 'APPROVED' 
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : tool.status === 'PENDING'
                              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                              : tool.status === 'ARCHIVED'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
                          }`}>
                            {tool.status}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(tool.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        {tool.status === 'PENDING' && (
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => {
                                setConfirmAction({
                                  title: 'Approve Tool',
                                  message: `Approve "${tool.name}"?`,
                                  variant: 'warning',
                                  confirmLabel: 'Approve',
                                  requireTyping: false,
                                  onConfirm: async () => {
                                    try {
                                      const res = await fetch(`/api/admin/tools/${tool.id}/approve`, { method: 'POST' });
                                      if (res.ok) {
                                        alert('Tool approved!');
                                        loadFounder();
                                      } else {
                                        alert('Failed to approve');
                                      }
                                    } catch (err) {
                                      alert('Error approving tool');
                                    }
                                    setConfirmAction(null);
                                  },
                                });
                              }}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => setRejectingTool({ id: tool.id, name: tool.name })}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                            >
                              ✗ Reject
                            </button>
                          </div>
                        )}
                        <Link 
                          href={`/tools-dir?search=${tool.slug}`}
                          className="text-brand hover:underline text-xs font-medium flex items-center gap-1 justify-center py-1"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-8 font-jakarta text-sm">No tools submitted yet</p>
            )}
          </div>
        </div>
      </div>

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
      {viewingStartup && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/30 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center overflow-hidden shrink-0 border border-brand/20">
                  {viewingStartup.logoUrl ? (
                    <img src={viewingStartup.logoUrl} alt={viewingStartup.name} className="w-full h-full object-contain p-1" />
                  ) : (
                    <Building2 className="w-6 h-6 text-brand" />
                  )}
                </div>
                <div>
                  <h3 className="font-sora font-bold text-lg text-gray-900 dark:text-white">
                    {viewingStartup.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-0.5">
                    Submitted: {new Date(viewingStartup.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setViewingStartup(null)} 
                className="p-1.5 hover:bg-gray-150 dark:hover:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 font-jakarta text-sm">
              {/* Tagline */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Tagline</p>
                <p className="text-base text-gray-900 dark:text-white font-medium">{viewingStartup.tagline}</p>
              </div>

              {/* Description */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Description</p>
                <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-150 dark:border-gray-800/60 text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {viewingStartup.description || 'No description provided.'}
                </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800/20 p-3 rounded-lg border border-gray-150 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Stage</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1 capitalize">
                    {viewingStartup.stage?.replace(/_/g, ' ') || 'N/A'}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/20 p-3 rounded-lg border border-gray-150 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Founded Year</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                    {viewingStartup.foundedYear || 'N/A'}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/20 p-3 rounded-lg border border-gray-150 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Employees</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                    {viewingStartup.employeeCount || 'N/A'}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/20 p-3 rounded-lg border border-gray-150 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Headquarters</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                    {viewingStartup.headquartersCity || 'N/A'}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/20 p-3 rounded-lg border border-gray-150 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Category</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                    {viewingStartup.category || 'N/A'}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/20 p-3 rounded-lg border border-gray-150 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Business Type</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                    {viewingStartup.businessType || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Links */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Links</p>
                <div className="flex flex-wrap gap-3">
                  {viewingStartup.websiteUrl && (
                    <a href={viewingStartup.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-850 hover:bg-brand/10 hover:text-brand text-gray-700 dark:text-gray-300 font-bold text-xs rounded-lg transition-colors border border-gray-200 dark:border-gray-800">
                      <Globe className="w-3.5 h-3.5" /> Website <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {viewingStartup.linkedinUrl && (
                    <a href={viewingStartup.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-850 hover:bg-brand/10 hover:text-brand text-gray-700 dark:text-gray-300 font-bold text-xs rounded-lg transition-colors border border-gray-200 dark:border-gray-800">
                      <Linkedin className="w-3.5 h-3.5" /> LinkedIn <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {viewingStartup.twitterUrl && (
                    <a href={viewingStartup.twitterUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-850 hover:bg-brand/10 hover:text-brand text-gray-700 dark:text-gray-300 font-bold text-xs rounded-lg transition-colors border border-gray-200 dark:border-gray-800">
                      <Twitter className="w-3.5 h-3.5" /> Twitter <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {!viewingStartup.websiteUrl && !viewingStartup.linkedinUrl && !viewingStartup.twitterUrl && (
                    <span className="text-gray-400 italic">No links provided.</span>
                  )}
                </div>
              </div>

              {/* Founders Data */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Founders & Team</p>
                {viewingStartup.foundersData && Array.isArray(JSON.parse(JSON.stringify(viewingStartup.foundersData))) && (JSON.parse(JSON.stringify(viewingStartup.foundersData)).length > 0) ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {JSON.parse(JSON.stringify(viewingStartup.foundersData)).map((f: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2.5 p-2 bg-gray-50 dark:bg-gray-850 rounded-lg border border-gray-150 dark:border-gray-850">
                        {f.avatar ? (
                          <img src={f.avatar} alt={f.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-xs shrink-0">
                            {f.name?.charAt(0) || 'F'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-xs text-gray-900 dark:text-white truncate">{f.name}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{f.role || 'Founder'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 italic">No detailed founders data provided.</p>
                )}
              </div>

              {/* Funding Rounds */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Funding Rounds</p>
                {viewingStartup.fundingRounds && viewingStartup.fundingRounds.length > 0 ? (
                  <div className="space-y-3">
                    {viewingStartup.fundingRounds.map((round: any, idx: number) => (
                      <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-850 rounded-xl border border-gray-150 dark:border-gray-800 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="badge-category text-[10px] font-bold px-2 py-0.5 capitalize bg-brand/5 text-brand border border-brand/10">
                            {round.roundType?.replace(/_/g, ' ') || 'Unknown Round'}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {round.announcedAt ? new Date(round.announcedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'Date N/A'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {round.amountInr && Number(round.amountInr) > 0 && (
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Amount (INR)</p>
                              <p className="font-semibold text-xs text-gray-900 dark:text-white mt-0.5">
                                ₹{(Number(round.amountInr) / 10000000).toFixed(2)} Cr
                              </p>
                            </div>
                          )}
                          {round.amountUsd && Number(round.amountUsd) > 0 && (
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Amount (USD)</p>
                              <p className="font-semibold text-xs text-gray-900 dark:text-white mt-0.5">
                                ${(Number(round.amountUsd) / 1000000).toFixed(2)} M
                              </p>
                            </div>
                          )}
                        </div>
                        {((round.leadInvestors && round.leadInvestors.length > 0) || (round.allInvestors && round.allInvestors.length > 0)) && (
                          <div className="text-xs space-y-1 pt-1 border-t border-gray-150/40 dark:border-gray-800/40">
                            {round.leadInvestors && round.leadInvestors.length > 0 && (
                              <p className="text-gray-750 dark:text-gray-300">
                                <span className="font-semibold text-gray-500">Lead Investors:</span> {round.leadInvestors.join(', ')}
                              </p>
                            )}
                            {round.allInvestors && round.allInvestors.length > 0 && (
                              <p className="text-gray-750 dark:text-gray-300">
                                <span className="font-semibold text-gray-500">All Investors:</span> {round.allInvestors.join(', ')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 italic">No funding rounds declared.</p>
                )}
              </div>

              {/* FAQs */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Frequently Asked Questions</p>
                {viewingStartup.faqs && viewingStartup.faqs.length > 0 ? (
                  <div className="space-y-3">
                    {viewingStartup.faqs.map((faq: any, idx: number) => (
                      <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-850/50 rounded-xl border border-gray-150 dark:border-gray-800/60">
                        <p className="font-semibold text-xs text-gray-900 dark:text-white mb-1.5 flex items-start gap-1">
                          <span className="text-brand shrink-0">Q.</span>
                          <span>{faq.question}</span>
                        </p>
                        <p className="text-gray-600 dark:text-gray-400 text-xs pl-4 leading-relaxed">
                          {faq.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 italic">No FAQs added.</p>
                )}
              </div>

              {/* Rejection Form Input */}
              {isRejecting && (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl space-y-3 animate-in slide-in-from-bottom-2">
                  <label className="block text-xs font-bold text-red-800 dark:text-red-300 uppercase tracking-wider">
                    Rejection Reason (Sent to Founder)
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Please add a valid website URL or update the description to reflect your core product details."
                    rows={3}
                    className="w-full px-3 py-2 border border-red-200 dark:border-red-800 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsRejecting(false)}
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!rejectReason.trim()) {
                          alert('Rejection reason is required');
                          return;
                        }
                        setActionLoading(true);
                        try {
                          const res = await fetch(`/api/founder/startups/${viewingStartup.id}/reject`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reason: rejectReason.trim() })
                          });
                          if (res.ok) {
                            alert('Startup rejected successfully');
                            setViewingStartup(null);
                            loadFounder();
                          } else {
                            const data = await res.json();
                            alert(`Failed to reject: ${data.error || 'Unknown error'}`);
                          }
                        } catch (err) {
                          alert('Error rejecting startup');
                        } finally {
                          setActionLoading(false);
                        }
                      }}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                    >
                      {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex items-center justify-between flex-shrink-0">
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Current Status:</span>
                <span className={`ml-1.5 text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                  viewingStartup.status === 'CLAIMED' || viewingStartup.status === 'VERIFIED'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : viewingStartup.status === 'PENDING'
                    ? 'bg-orange-150 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {viewingStartup.status}
                </span>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setViewingStartup(null)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Close
                </button>
                
                {!viewingStartup.isApproved && !isRejecting && (
                  <>
                    <button
                      onClick={() => setIsRejecting(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      ✗ Reject Claim
                    </button>
                    
                    <button
                      onClick={() => {
                        setConfirmAction({
                          title: 'Approve Startup Claim',
                          message: `Approve claim and listing for "${viewingStartup.name}"?`,
                          variant: 'warning',
                          confirmLabel: 'Approve',
                          requireTyping: false,
                          onConfirm: async () => {
                            setActionLoading(true);
                            try {
                              const res = await fetch(`/api/founder/startups/${viewingStartup.id}/approve`, { method: 'POST' });
                              if (res.ok) {
                                alert('Startup approved successfully!');
                                setViewingStartup(null);
                                loadFounder();
                              } else {
                                const data = await res.json();
                                alert(`Failed to approve: ${data.error || 'Unknown error'}`);
                              }
                            } catch (err) {
                              alert('Error approving startup');
                            } finally {
                              setActionLoading(false);
                            }
                            setConfirmAction(null);
                          },
                        });
                      }}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? 'Approving...' : '✓ Approve Claim'}
                    </button>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
      {isSuperAdmin && founder && <FounderActivityPanel founderId={founder.id} />}
    </div>
  );
}
