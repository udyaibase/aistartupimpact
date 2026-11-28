'use client';

import { Mail, Building2, Phone, Calendar, CheckCircle, XCircle, Clock, Globe, Linkedin, Twitter, User, Briefcase, Shield, TrendingUp, Package, Wrench } from 'lucide-react';
import type { FounderDetail } from './types';

/** Profile card, counts, contact details and account details for one founder. */
export default function FounderOverview({ founder }: {
  founder: FounderDetail;
}) {
  return (
    <>
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
                  <h1 className="portal-title">{founder.name}</h1>
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
    </>
  );
}
