'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Building2, MapPin, Globe, Linkedin, Twitter, ArrowRight, CheckCircle, Upload, FileText } from 'lucide-react';
import { completeEmployerOnboarding } from './actions';

interface Employer {
  id: string;
  email: string;
  companyName: string;
  logoUrl: string | null;
  description: string | null;
  industry: string | null;
  companySize: string | null;
  location: string | null;
  country: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  websiteUrl: string | null;
  onboardingStep: number;
}

const INDUSTRIES = [
  'Artificial Intelligence', 'Machine Learning', 'SaaS', 'FinTech', 'HealthTech',
  'EdTech', 'E-Commerce', 'AgriTech', 'CleanTech', 'Cybersecurity',
  'IoT', 'Blockchain', 'Gaming', 'Media & Entertainment', 'Logistics',
  'Real Estate', 'Food & Beverage', 'Travel', 'Social Media', 'Hardware',
  'Other',
];

const COMPANY_SIZES = [
  '1-10', '11-50', '51-200', '201-500', '501-1000', '1000+',
];

export default function OnboardingClient({ employer }: { employer: Employer }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    logoUrl: employer.logoUrl || '',
    description: employer.description || '',
    location: employer.location || '',
    country: employer.country || '',
    industry: employer.industry || '',
    companySize: employer.companySize || '',
    linkedinUrl: employer.linkedinUrl || '',
    twitterUrl: employer.twitterUrl || '',
  });


  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select a JPG or PNG image file'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Image must be less than 5MB'); return; }

    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await fetch('/api/media/upload', { method: 'POST', body: data });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Upload failed');
      setFormData(prev => ({ ...prev, logoUrl: result.url }));
    } catch (err: any) {
      alert('Upload failed: ' + (err.message || 'Please try again'));
    } finally {
      setUploading(false);
    }
  };

  const isFormValid = () =>
    formData.logoUrl.trim() !== '' &&
    formData.description.trim() !== '' &&
    formData.location.trim() !== '' &&
    formData.country.trim() !== '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isFormValid()) {
      setError('Company logo, description, location, and country are required');
      return;
    }

    setLoading(true);
    try {
      const result = await completeEmployerOnboarding(formData);
      if (!result.success) {
        setError(result.error || 'Failed to complete onboarding');
        setLoading(false);
        return;
      }
      router.push('/employer/dashboard?welcome=true');
    } catch {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand/10 mb-4">
            <Building2 className="w-8 h-8 text-brand" />
          </div>
          <h1 className="font-sora font-bold text-3xl text-gray-900 dark:text-white mb-2">
            Complete Your Company Profile
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta">
            Add your company details to attract the best talent
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500 text-white text-sm font-bold">
              <CheckCircle className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Sign Up</span>
          </div>
          <div className="w-12 h-0.5 bg-brand" />
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand text-white text-sm font-bold">
              2
            </div>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Company</span>
          </div>
          <div className="w-12 h-0.5 bg-gray-200 dark:bg-gray-700" />
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 text-sm font-bold">
              3
            </div>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Dashboard</span>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                <p className="text-sm text-red-600 dark:text-red-400 font-jakarta">{error}</p>
              </div>
            )}

            {/* Logo Upload */}
            <div className="flex flex-col items-center gap-4 border-b border-gray-100 dark:border-gray-800 pb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 font-jakarta self-start">
                Company Logo <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-6 w-full">
                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                  {formData.logoUrl ? (
                    <Image src={formData.logoUrl} alt="Logo preview" width={80} height={80} unoptimized className="w-full h-full object-contain p-1" />
                  ) : (
                    <Building2 className="w-10 h-10 text-gray-400" />
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <input type="file" id="logo-upload" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  <label htmlFor="logo-upload" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-brand bg-brand/10 hover:bg-brand/20 rounded-lg cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" /> Upload Logo
                  </label>
                  <p className="text-xs text-gray-400 font-jakarta">JPG, PNG up to 5MB. Square recommended.</p>
                </div>
              </div>
            </div>

            {/* Company Name (read-only) */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 font-jakarta">Company Name</label>
              <div className="relative">
                <input type="text" value={employer.companyName} disabled className="w-full px-4 py-3 pl-11 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 dark:text-gray-400 font-jakarta" />
                <Building2 className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 font-jakarta flex justify-between items-center">
                <span>Company Description <span className="text-red-500">*</span></span>
                <span className="text-xs font-normal text-gray-400 font-jakarta">{formData.description.length}/1000 characters</span>
              </label>
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="What does your company do? What's your mission?" required maxLength={1000} rows={4} className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent font-jakarta resize-none" />
            </div>

            {/* Location + Country */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 font-jakarta">
                  City / Location <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="Bangalore" required className="w-full px-4 py-3 pl-11 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent font-jakarta" />
                  <MapPin className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 font-jakarta">
                  Country <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input type="text" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} placeholder="India" required className="w-full px-4 py-3 pl-11 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent font-jakarta" />
                  <Globe className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                </div>
              </div>
            </div>

            {/* Industry + Company Size */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 font-jakarta">Industry</label>
                <select value={formData.industry} onChange={(e) => setFormData({ ...formData, industry: e.target.value })} className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent font-jakarta appearance-none">
                  <option value="">Select industry</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 font-jakarta">Company Size</label>
                <select value={formData.companySize} onChange={(e) => setFormData({ ...formData, companySize: e.target.value })} className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent font-jakarta appearance-none">
                  <option value="">Select size</option>
                  {COMPANY_SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
                </select>
              </div>
            </div>

            {/* Social Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 font-jakarta">LinkedIn</label>
                <div className="relative">
                  <input type="url" value={formData.linkedinUrl} onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/company/..." className="w-full px-4 py-3 pl-11 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent font-jakarta" />
                  <Linkedin className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 font-jakarta">Twitter</label>
                <div className="relative">
                  <input type="url" value={formData.twitterUrl} onChange={(e) => setFormData({ ...formData, twitterUrl: e.target.value })} placeholder="https://twitter.com/..." className="w-full px-4 py-3 pl-11 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent font-jakarta" />
                  <Twitter className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                </div>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading || !isFormValid()} className="w-full bg-brand hover:bg-brand-600 text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed font-jakarta">
              {loading ? (
                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Completing Profile...</>
              ) : (
                <>Complete Profile & Start Hiring <ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6 font-jakarta">
          You can update these details anytime from your company profile settings
        </p>
      </div>
    </div>
  );
}
