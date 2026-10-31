'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Building2, Save, Link2, Unlink, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react';
import ClaimStartup from '@/components/employer/ClaimStartup';
import Link from 'next/link';

export default function EmployerCompanyPage() {
  const [company, setCompany] = useState<any>(null);
  const [form, setForm] = useState({
    companyName: '', description: '', websiteUrl: '', industry: '',
    companySize: '', location: '', country: '', linkedinUrl: '', twitterUrl: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    fetch('/api/employer/company')
      .then(r => r.json())
      .then(data => {
        if (data.company) {
          setCompany(data.company);
          setForm({
            companyName: data.company.companyName || '',
            description: data.company.description || '',
            websiteUrl: data.company.websiteUrl || '',
            industry: data.company.industry || '',
            companySize: data.company.companySize || '',
            location: data.company.location || '',
            country: data.company.country || '',
            linkedinUrl: data.company.linkedinUrl || '',
            twitterUrl: data.company.twitterUrl || '',
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const refreshCompany = async () => {
    const res = await fetch('/api/employer/company');
    const data = await res.json();
    setCompany(data.company);
  };

  const disconnectStartup = async () => {
    if (!confirm('Disconnect from this startup? Jobs will no longer appear on the startup profile.')) return;
    try {
      const res = await fetch('/api/employer/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect_startup' }),
      });
      if (res.ok) {
        setCompany((prev: any) => ({ ...prev, startupId: null, startupName: null, startupSlug: null, startupLogo: null, startupClaimMethod: null }));
        setMessage('Startup disconnected.');
      }
    } catch {}
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/employer/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) setMessage('Profile updated successfully');
      else setMessage('Failed to update profile');
    } catch { setMessage('Something went wrong'); }
    setSaving(false);
  };

  if (loading) return <div className="p-10 text-center text-gray-400 font-jakarta">Loading...</div>;

  const isConnected = !!company?.startupId;
  const isVerifiedClaim = isConnected && (company?.startupClaimMethod === 'DOMAIN_OTP' || company?.startupClaimMethod === 'ADMIN');

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="w-5 h-5 text-brand" />
        <h1 className="font-sora font-extrabold text-xl text-navy dark:text-white">Company Profile</h1>
      </div>

      {message && (
        <div className={`rounded-lg p-3 text-sm mb-5 ${message.includes('success') || message.includes('Verified') || message.includes('disconnected') ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
          {message}
        </div>
      )}

      {/* Connect to Startup Section */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-4 h-4 text-brand" />
          <h2 className="font-sora font-bold text-sm text-navy dark:text-white">Connect to Startup Profile</h2>
        </div>

        {isConnected ? (
          /* Connected State */
          <div>
            {isVerifiedClaim ? (
              <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl mb-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300 font-jakarta">Verified owner{company.verifiedCompanyDomain ? ` · ${company.verifiedCompanyDomain}` : ''}</p>
                  <p className="text-xs text-green-700 dark:text-green-400 font-jakarta">Jobs you post appear on AI Jobs, this startup&apos;s profile, your website widget and Google job search.</p>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl mb-3">
                <div className="flex items-start gap-3 mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 font-jakarta">Confirm you work at {company.startupName}</p>
                    <p className="text-xs text-amber-800 dark:text-amber-300 font-jakarta">Verify a work email on the startup&apos;s domain to publish jobs. It takes a minute.</p>
                  </div>
                </div>
                <ClaimStartup
                  initialStartup={{ id: company.startupId, name: company.startupName, logoUrl: company.startupLogo, websiteUrl: company.startupWebsite }}
                  defaultEmail={company.email}
                  onClaimed={() => { setMessage('Verified. Jobs now appear on your startup profile.'); refreshCompany(); }}
                />
              </div>
            )}

            <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <div className="w-11 h-11 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                {company.startupLogo ? (
                  <Image src={company.startupLogo} alt="" width={44} height={44} sizes="44px" className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-sora font-bold text-sm text-navy dark:text-white">{company.startupName}</p>
                <div className="flex items-center gap-2 text-xs text-gray-400 font-jakarta mt-0.5">
                  {company.startupCity && <span>{company.startupCity}</span>}
                  {company.startupStage && <span>• {company.startupStage}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/startups/${company.startupSlug}`} target="_blank" className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700" title="View profile">
                  <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                </Link>
                <button onClick={disconnectStartup} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10" title="Disconnect">
                  <Unlink className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-400 font-jakarta mt-3 italic">
              Company info is synced from your startup profile. To edit, update your startup listing in the directory.
            </p>
          </div>
        ) : (
          /* Not connected: claim with company-domain verification */
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-3">
              Jobs are always posted under a verified startup. Find yours, or add it, then confirm with a code sent to your work email.
            </p>
            <ClaimStartup
              defaultEmail={company?.email ?? ''}
              onClaimed={() => { setMessage('Verified. Jobs now appear on your startup profile.'); refreshCompany(); }}
            />
            <p className="text-xs text-gray-500 font-jakarta mt-3">
              Already verified your startup as a founder? <a href="/api/employer/auth/founder" className="text-brand font-semibold hover:underline">Continue with your founder account</a> instead.
            </p>
          </div>
        )}
      </div>

      {/* Manual Company Profile Form (hidden when connected) */}
      {!isConnected && (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="card p-5 sm:p-6 space-y-4">
            <h2 className="font-sora font-bold text-sm text-navy dark:text-white">Company Details</h2>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-1.5">Company Name</label>
              <input type="text" value={form.companyName} onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))} className="input-field w-full" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-1.5">About the Company</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={4} className="input-field w-full resize-none" placeholder="Tell candidates about your company..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-1.5">Website</label>
                <input type="url" value={form.websiteUrl} onChange={e => setForm(p => ({ ...p, websiteUrl: e.target.value }))} className="input-field w-full" placeholder="https://..." />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-1.5">Industry</label>
                <select value={form.industry} onChange={e => setForm(p => ({ ...p, industry: e.target.value }))} className="input-field w-full">
                  <option value="">Select Industry</option>
                  <option value="AI Infrastructure & MLOps">AI Infrastructure & MLOps</option>
                  <option value="Enterprise Software & SaaS">Enterprise Software & SaaS</option>
                  <option value="Developer Tools & DevOps">Developer Tools & DevOps</option>
                  <option value="FinTech">FinTech</option>
                  <option value="HealthTech & BioTech">HealthTech & BioTech</option>
                  <option value="EdTech">EdTech</option>
                  <option value="Cybersecurity">Cybersecurity</option>
                  <option value="MarTech & AdTech">MarTech & AdTech</option>
                  <option value="E-Commerce & Retail Tech">E-Commerce & Retail Tech</option>
                  <option value="AgriTech">AgriTech</option>
                  <option value="CleanTech & Energy">CleanTech & Energy</option>
                  <option value="HRTech">HRTech</option>
                  <option value="Logistics & Supply Chain">Logistics & Supply Chain</option>
                  <option value="FoodTech">FoodTech</option>
                  <option value="Data & Analytics">Data & Analytics</option>
                  <option value="Robotics & Industrial Automation">Robotics & Industrial Automation</option>
                  <option value="DeepTech & Hardware">DeepTech & Hardware</option>
                  <option value="Media & Entertainment">Media & Entertainment</option>
                  <option value="Blockchain & Web3">Blockchain & Web3</option>
                  <option value="Consumer Apps & Social">Consumer Apps & Social</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-1.5">Location</label>
                <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} className="input-field w-full" placeholder="San Francisco, CA" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-1.5">Company Size</label>
                <select value={form.companySize} onChange={e => setForm(p => ({ ...p, companySize: e.target.value }))} className="input-field w-full">
                  <option value="">Select</option>
                  <option value="1-10">1-10</option>
                  <option value="11-50">11-50</option>
                  <option value="51-200">51-200</option>
                  <option value="201-500">201-500</option>
                  <option value="500+">500+</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-1.5">LinkedIn</label>
                <input type="url" value={form.linkedinUrl} onChange={e => setForm(p => ({ ...p, linkedinUrl: e.target.value }))} className="input-field w-full" placeholder="https://linkedin.com/company/..." />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-1.5">Twitter/X</label>
                <input type="url" value={form.twitterUrl} onChange={e => setForm(p => ({ ...p, twitterUrl: e.target.value }))} className="input-field w-full" placeholder="https://x.com/..." />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="btn-brand flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
