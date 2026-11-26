'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, RefreshCw, X } from 'lucide-react';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { notify } from '@/components/Toast';
import { getPaymentStatsAction, getAdvPaymentsAction, markRefundAction } from './actions';

const statusStyle: Record<string, string> = {
  SUCCESS: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  PENDING: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  REFUNDED: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
};

const purposeStyle: Record<string, string> = {
  PACKAGE_PURCHASE: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  PACKAGE_UPGRADE: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  ZONE_EXTENSION: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400',
  SOCIAL_POST: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
};

const purposeLabel: Record<string, string> = {
  PACKAGE_PURCHASE: 'Package',
  PACKAGE_UPGRADE: 'Upgrade',
  ZONE_EXTENSION: 'Zone extension',
  SOCIAL_POST: 'Social post',
};
const statusLabel: Record<string, string> = { SUCCESS: 'Paid', PENDING: 'Pending', FAILED: 'Failed', REFUNDED: 'Refunded' };
const optionsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

const fmt = (d: string) => d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtAmount = (paise: number) => paise ? `₹${(paise / 100).toLocaleString('en-IN')}` : '₹0';

interface Stats { total: number; success: number; pending: number; failed: number; revenue: number }
interface Payment {
  id: string; purpose: string; amountPaise: number; gstPaise: number; totalPaise: number;
  currency: string; razorpayOrderId: string | null; razorpayPaymentId: string | null;
  status: string; paidAt: string | null; failedAt: string | null;
  refundedAt: string | null; refundAmountPaise: number | null;
  createdAt: string; founderId: string; founderName: string; founderEmail: string;
  packageTier: string | null;
}

export default function AdvPaymentsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refundModal, setRefundModal] = useState<Payment | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string, ok: boolean) => notify(msg, ok ? 'success' : 'error');

  const load = useCallback(async () => {
    setLoading(true);
    const [statsRes, paymentsRes] = await Promise.all([getPaymentStatsAction(), getAdvPaymentsAction()]);
    if (statsRes.success) setStats(statsRes.data as Stats);
    if (paymentsRes.success) setPayments(paymentsRes.data as Payment[]);
    else notify((paymentsRes as { error?: string }).error || "Couldn't load payments. Refresh to try again.", 'error');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefund = async () => {
    if (!refundModal) return;
    const amount = Math.round(parseFloat(refundAmount) * 100);
    if (!amount || amount <= 0) { showToast('Enter a valid refund amount', false); return; }
    if (amount > refundModal.totalPaise) { showToast('Refund cannot exceed payment total', false); return; }

    setSaving(true);
    const res = await markRefundAction(refundModal.id, amount);
    setSaving(false);
    setRefundModal(null);
    setRefundAmount('');
    if (res.success) { showToast('Payment marked as refunded', true); load(); }
    else showToast(res.error || 'Failed', false);
  };

  const columns = useMemo<Column<Payment>[]>(() => [
    { key: 'date', header: 'Date', sortValue: (p) => new Date(p.createdAt), cell: (p) => <span className="whitespace-nowrap">{fmt(p.createdAt)}</span> },
    {
      key: 'founder', header: 'Founder', sortValue: (p) => p.founderName, searchValue: (p) => `${p.founderName ?? ''} ${p.founderEmail ?? ''}`,
      cell: (p) => <><span className="font-semibold text-gray-900 dark:text-white">{p.founderName || '–'}</span><span className="block text-xs text-gray-600 dark:text-gray-400">{p.founderEmail}</span></>,
    },
    {
      key: 'purpose', header: 'For', sortValue: (p) => p.purpose,
      cell: (p) => (
        <span className="whitespace-nowrap">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${purposeStyle[p.purpose] || ''}`}>{purposeLabel[p.purpose] || p.purpose}</span>
          {p.packageTier && <span className="text-xs text-gray-600 dark:text-gray-400 ml-1.5">{p.packageTier}</span>}
        </span>
      ),
    },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (p) => p.amountPaise, cell: (p) => <span className="tabular-nums whitespace-nowrap">{fmtAmount(p.amountPaise)}</span> },
    { key: 'gst', header: 'GST', align: 'right', sortValue: (p) => p.gstPaise, cell: (p) => <span className="tabular-nums whitespace-nowrap">{fmtAmount(p.gstPaise)}</span> },
    { key: 'total', header: 'Total', align: 'right', sortValue: (p) => p.totalPaise, cell: (p) => <span className="font-semibold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">{fmtAmount(p.totalPaise)}</span> },
    {
      key: 'razorpay', header: 'Razorpay ID', searchValue: (p) => `${p.razorpayPaymentId ?? ''} ${p.razorpayOrderId ?? ''}`,
      cell: (p) => { const id = p.razorpayPaymentId || p.razorpayOrderId; return id ? <span className="text-xs font-mono select-all" title={id}>{id}</span> : '–'; },
    },
    {
      key: 'status', header: 'Status', sortValue: (p) => p.status,
      cell: (p) => (
        <>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyle[p.status] || ''}`}>{statusLabel[p.status] ?? p.status}</span>
          {p.refundAmountPaise ? <span className="block text-xs text-gray-600 dark:text-gray-400 mt-0.5 whitespace-nowrap">{fmtAmount(p.refundAmountPaise)} refunded</span> : null}
        </>
      ),
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (p) => p.status === 'SUCCESS' ? (
        <button onClick={() => { setRefundModal(p); setRefundAmount(String(p.totalPaise / 100)); }} aria-label={`Mark the payment from ${p.founderName || p.founderEmail} as refunded`}
          className="text-xs text-purple-700 dark:text-purple-400 hover:underline font-semibold inline-flex items-center gap-1">
          <RefreshCw className="w-3 h-3" aria-hidden /> Refund
        </button>
      ) : null,
    },
  ], []);

  const filters = useMemo<TableFilter<Payment>[]>(() => [
    { key: 'status', label: 'Status', options: optionsOf(statusLabel), matches: (p, v) => p.status === v },
    { key: 'purpose', label: 'For', options: optionsOf(purposeLabel), matches: (p, v) => p.purpose === v },
  ], []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">Advertising payments</h1>
          <p className="portal-subtitle">Payments, refunds and revenue from founder advertising.</p>
        </div>
        <button onClick={load} aria-label="Refresh payments" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Refresh">
          <RefreshCw className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden />
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([['Payments', stats.total.toLocaleString('en-IN')], ['Paid', stats.success.toLocaleString('en-IN')], ['Pending', stats.pending.toLocaleString('en-IN')], ['Revenue', fmtAmount(stats.revenue)]] as const).map(([label, value]) => (
            <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">{label}</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1 tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}

      <DataTable
        tableId="advertise-payments"
        noun="payments"
        rows={payments}
        rowKey={(p) => p.id}
        columns={columns}
        filters={filters}
        loading={loading}
        pageSize={25}
        searchPlaceholder="Search founder, email or Razorpay ID"
        empty={{ title: 'No advertising payments yet', description: 'Payments founders make for packages, upgrades and social posts appear here.' }}
      />

      {/* Refund Modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Mark Refund</h2>
              <button onClick={() => setRefundModal(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <p className="text-sm text-gray-500 font-jakarta">
                  Payment: <strong>{purposeLabel[refundModal.purpose] || refundModal.purpose}</strong> by {refundModal.founderName}
                </p>
                <p className="text-sm text-gray-500 font-jakarta mt-1">
                  Original total: <strong>{fmtAmount(refundModal.totalPaise)}</strong>
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Refund Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="input-field text-sm w-full"
                  placeholder="Enter refund amount"
                />
              </div>
              <p className="text-xs text-gray-400 font-jakarta">
                This marks the payment as refunded in the system. Process the actual refund through the Razorpay dashboard.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => setRefundModal(null)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                Cancel
              </button>
              <button
                onClick={handleRefund}
                disabled={saving}
                className="px-4 py-2 text-sm bg-purple-500 text-white rounded-lg font-semibold hover:bg-purple-600 disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Confirm Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
