'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Users, Search, Mail, Calendar, CheckCircle, XCircle, Eye, Trash2, Shield, Download } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Pagination } from '@/components/Pagination';
import { EmptyState } from '@/components/EmptyState';
import { notify } from '@/components/Toast';

const PAGE_SIZE = 20;

interface WebUser {
  id: string;
  email: string;
  name: string;
  slug: string;
  avatar: string | null;
  bio: string | null;
  twitter: string | null;
  linkedin: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  _count?: {
    WebUserSession: number;
  };
}

export default function WebUsersPage() {
  const [users, setUsers] = useState<WebUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      console.log('🔵 Fetching web users from API...');
      const res = await fetch('/api/admin/web-users');
      console.log('🔵 API response status:', res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log('✅ API response data:', data);
        console.log('✅ Number of users:', data.users?.length || 0);
        setUsers(data.users || []);
      } else {
        console.error('❌ API response not OK:', res.status, res.statusText);
        const text = await res.text();
        console.error('❌ Response body:', text);
      }
    } catch (error) {
      console.error('❌ Error fetching web users:', error);
      notify("Couldn't load this. Check your connection and refresh.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/admin/web-users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus }),
      });

      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error('Error updating user status:', error);
      notify("Couldn't save. Check your connection and try again.", 'error');
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/web-users/${userId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      notify("Couldn't delete. Check your connection and try again.", 'error');
    }
  };

  const exportToCSV = () => {
    // Prepare CSV data
    const csvData = filteredUsers.map(user => ({
      Name: user.name,
      Email: user.email,
      Username: user.slug,
      Status: user.isActive ? 'Active' : 'Inactive',
      'Last Login': user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never',
      'Joined Date': new Date(user.createdAt).toLocaleDateString(),
      Sessions: user._count?.WebUserSession || 0,
    }));

    // Convert to CSV string
    const headers = Object.keys(csvData[0]).join(',');
    const rows = csvData.map(row => 
      Object.values(row).map(value => 
        // Escape commas and quotes in values
        typeof value === 'string' && (value.includes(',') || value.includes('"'))
          ? `"${value.replace(/"/g, '""')}"`
          : value
      ).join(',')
    );
    const csv = [headers, ...rows].join('\n');

    // Create download link
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `web-users-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'active' && user.isActive) ||
      (statusFilter === 'inactive' && !user.isActive);

    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: users.length,
    active: users.filter(u => u.isActive).length,
    inactive: users.filter(u => !u.isActive).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-6 h-6 text-brand" />
            <h1 className="portal-title">
              Web Users
            </h1>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Manage website users (separate from admin users and founders)
          </p>
        </div>
        <Link href="/web-users/insights" className="inline-flex items-center h-9 px-3 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
          Audience insights: how people found us
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 dark:text-gray-400 mb-0.5 uppercase font-semibold">Total Users</p>
              <p className="text-2xl font-bold text-navy dark:text-white">{stats.total}</p>
            </div>
            <Users className="w-10 h-10 text-brand/20" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 dark:text-gray-400 mb-0.5 uppercase font-semibold">Active Users</p>
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            </div>
            <CheckCircle className="w-10 h-10 text-green-600/20" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 dark:text-gray-400 mb-0.5 uppercase font-semibold">Inactive Users</p>
              <p className="text-2xl font-bold text-red-600">{stats.inactive}</p>
            </div>
            <XCircle className="w-10 h-10 text-red-600/20" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 mb-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'all'
                  ? 'bg-brand text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'active'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'inactive'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Inactive
            </button>
          </div>

          {/* Export CSV Button */}
          <button
            onClick={exportToCSV}
            disabled={filteredUsers.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-brand text-white hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Export filtered users to CSV"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Users List - Horizontal Compact Rows */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {filteredUsers.length === 0 ? (
          <EmptyState icon={Users} title="No users found" description="Try adjusting your search or filters" />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                {/* Avatar + Name */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-brand font-semibold text-xs shrink-0">
                      {user.name.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                      {user.name}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                      @{user.slug}
                    </p>
                  </div>
                </div>

                {/* Email */}
                <div className="hidden md:flex items-center gap-1.5 min-w-0 flex-1">
                  <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {user.email}
                  </span>
                </div>

                {/* Status */}
                <div className="shrink-0">
                  {user.isActive ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                      <CheckCircle className="w-2.5 h-2.5" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                      <XCircle className="w-2.5 h-2.5" />
                      Inactive
                    </span>
                  )}
                </div>

                {/* Last Login */}
                <div className="hidden lg:block shrink-0 w-24">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Last Login</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    {user.lastLoginAt 
                      ? new Date(user.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : 'Never'
                    }
                  </p>
                </div>

                {/* Joined */}
                <div className="hidden xl:block shrink-0 w-24">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Joined</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                  </p>
                </div>

                {/* Sessions */}
                <div className="hidden xl:block shrink-0 w-16 text-center">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Sessions</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                    {user._count?.WebUserSession || 0}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleUserStatus(user.id, user.isActive)}
                    className={`p-1.5 rounded transition-colors ${
                      user.isActive
                        ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                        : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                    }`}
                    title={user.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {user.isActive ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(user.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title="Delete user"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            deleteUser(confirmDelete);
            setConfirmDelete(null);
          }
        }}
        title="Delete User"
        message="Are you sure you want to delete this user? This action cannot be undone."
        confirmLabel="Delete User"
        variant="danger"
        requireTyping={true}
      />
    </div>
  );
}
