'use client';

import { useState } from 'react';
import { useHumanCheck } from '@/components/shared/useHumanCheck';
import Link from 'next/link';
import { Building2, ChevronRight, CheckCircle2, Loader2, Plus, X } from 'lucide-react';
import { STARTUP_CATEGORIES, USE_CASES } from '@/lib/categories';
import CityCombobox from '@/components/shared/CityCombobox';

const STAGES = ['BOOTSTRAPPED', 'IDEA', 'PRE_SEED', 'SEED', 'PRE_SERIES_A', 'SERIES_A', 'PRE_SERIES_B', 'SERIES_B', 'PRE_SERIES_C', 'SERIES_C', 'PRE_SERIES_D', 'SERIES_D', 'SERIES_E', 'SERIES_F', 'SERIES_G', 'SERIES_I', 'SERIES_J', 'GROWTH', 'PUBLIC'];
const STAGE_LABELS: Record<string, string> = {
  BOOTSTRAPPED: 'Bootstrapped',
  IDEA: 'Idea',
  PRE_SEED: 'Pre-Seed',
  SEED: 'Seed',
  PRE_SERIES_A: 'Pre-Series A',
  SERIES_A: 'Series A',
  PRE_SERIES_B: 'Pre-Series B',
  SERIES_B: 'Series B',
  PRE_SERIES_C: 'Pre-Series C',
  SERIES_C: 'Series C',
  PRE_SERIES_D: 'Pre-Series D',
  SERIES_D: 'Series D',
  SERIES_E: 'Series E',
  SERIES_F: 'Series F',
  SERIES_G: 'Series G',
  SERIES_I: 'Series I',
  SERIES_J: 'Series J',
  GROWTH: 'Growth',
  PUBLIC: 'Public',
};

interface Founder { name: string; role: string; prev: string; }

export default function SubmitStartupPage() {
  const [form, setForm] = useState({
    name: '', websiteUrl: '', linkedinUrl: '', logoUrl: '',
    tagline: '', description: '',
    stage: 'SEED', headquartersCity: '',
    foundedYear: '', employeeCount: '',
    founderEmail: '',
    category: '',
  });
  const [useCases, setUseCases] = useState<string[]>([]);
  const [founders, setFounders] = useState<Founder[]>([{ name: '', role: '', prev: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const addFounder = () => setFounders(f => [...f, { name: '', role: '', prev: '' }]);
  const removeFounder = (i: number) => setFounders(f => f.filter((_, j) => j !== i));
  const updateFounder = (i: number, field: keyof Founder, val: string) =>
    setFounders(f => f.map((x, j) => j === i ? { ...x, [field]: val } : x));

  const toggleUseCase = (useCase: string) => {
    setUseCases(prev => 
      prev.includes(useCase) 
        ? prev.filter(uc => uc !== useCase)
        : [...prev, useCase]
    );
  };

  const human = useHumanCheck({ className: 'flex justify-center' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.websiteUrl || !form.tagline || !form.founderEmail) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!human.ready) { setError('Complete the quick security check above the button, then submit.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/startups/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...form,
          turnstileToken: human.token, 
          founders: founders.filter(f => f.name.trim()),
          useCases: useCases,
        }),
      });
      human.reset(); // a check works once
      if (res.ok) { setDone(true); }
      else { const d = await res.json(); setError(d.error || 'Submission failed.'); }
    } catch { setError('Network error. Please try again.'); }
    finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white mb-2">Submission Received!</h1>
        <p className="text-gray-500 font-jakarta text-sm mb-6">
          We'll review your startup and publish it within 2–3 business days.
        </p>
        <Link href="/startups" className="btn-brand">Browse Startups →</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <nav className="flex items-center gap-1.5 text-xs font-jakarta text-gray-400 mb-6">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/startups" className="hover:text-brand">Startups</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300">Submit</span>
      </nav>

      <div className="flex items-center gap-3 mb-2">
        <Building2 className="w-6 h-6 text-brand" />
        <h1 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white">List Your Startup</h1>
      </div>
      <p className="text-gray-500 font-jakarta text-sm mb-8">
        Get your Indian AI startup featured in front of investors, journalists, and ecosystem partners.
      </p>

      <form onSubmit={handleSubmit} className="space-y-8">
        {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl">{error}</p>}

        {/* ── Basic Info ── */}
        <section className="space-y-4">
          <h2 className="font-sora font-bold text-sm text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 pb-2">Basic Info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-sora font-bold text-sm text-navy dark:text-white mb-2">Startup Name *</label>
              <input type="text" className="input-field w-full" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sarvam AI" />
            </div>
            <div>
              <label className="block font-sora font-bold text-sm text-navy dark:text-white mb-2">Website URL *</label>
              <input type="url" className="input-field w-full" value={form.websiteUrl}
                onChange={e => setForm({ ...form, websiteUrl: e.target.value })} placeholder="https://..." />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-sora font-bold text-sm text-navy dark:text-white mb-2">LinkedIn URL</label>
              <input type="url" className="input-field w-full" value={form.linkedinUrl}
                onChange={e => setForm({ ...form, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/company/..." />
            </div>
            <div>
              <label className="block font-sora font-bold text-sm text-navy dark:text-white mb-2">Logo URL</label>
              <input type="url" className="input-field w-full" value={form.logoUrl}
                onChange={e => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://..." />
            </div>
          </div>
          <div>
            <label className="block font-sora font-bold text-sm text-navy dark:text-white mb-2">
              Tagline * <span className="text-gray-400 font-normal text-xs">(max 100 chars)</span>
            </label>
            <input type="text" maxLength={100} className="input-field w-full" value={form.tagline}
              onChange={e => setForm({ ...form, tagline: e.target.value })}
              placeholder="One-line description of what you build" />
            <div className="text-right text-xs text-gray-400 mt-1">{form.tagline.length}/100</div>
          </div>
          <div>
            <label className="block font-sora font-bold text-sm text-navy dark:text-white mb-2">
              Description <span className="text-gray-400 font-normal text-xs">(shown on profile, ~4 lines)</span>
            </label>
            <textarea rows={4} className="input-field w-full" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="What problem do you solve? Who do you serve? What makes you unique?" />
          </div>
        </section>

        {/* ── Company Details ── */}
        <section className="space-y-4">
          <h2 className="font-sora font-bold text-sm text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 pb-2">Company Details</h2>
          
          <div>
            <label className="block font-sora font-bold text-sm text-navy dark:text-white mb-2">
              Category <span className="text-gray-400 font-normal text-xs">(helps with discovery)</span>
            </label>
            <select className="input-field w-full" value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="">Select a category...</option>
              {STARTUP_CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>
                  {cat.label} — {cat.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-sora font-bold text-sm text-navy dark:text-white mb-2">
              Use Cases <span className="text-gray-400 font-normal text-xs">(select all that apply)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              {USE_CASES.map(useCase => (
                <label key={useCase} className="flex items-center gap-2 text-sm font-jakarta cursor-pointer hover:text-brand transition-colors">
                  <input
                    type="checkbox"
                    checked={useCases.includes(useCase)}
                    onChange={() => toggleUseCase(useCase)}
                    className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand"
                  />
                  <span className="text-xs">{useCase}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 font-jakarta mt-1">
              Selected: {useCases.length > 0 ? useCases.join(', ') : 'None'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-sora font-bold text-sm text-navy dark:text-white mb-2">Stage</label>
              <select className="input-field w-full" value={form.stage}
                onChange={e => setForm({ ...form, stage: e.target.value })}>
                {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-sora font-bold text-sm text-navy dark:text-white mb-2">HQ City</label>
              <CityCombobox
                value={form.headquartersCity}
                onChange={val => setForm({ ...form, headquartersCity: val })}
                placeholder="Search and select city (e.g. Bengaluru)"
                className="input-field w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-sora font-bold text-sm text-navy dark:text-white mb-2">Founded Year</label>
              <input type="number" className="input-field w-full" value={form.foundedYear}
                onChange={e => setForm({ ...form, foundedYear: e.target.value })} placeholder="e.g. 2023" min={2000} max={2030} />
            </div>
            <div>
              <label className="block font-sora font-bold text-sm text-navy dark:text-white mb-2">Team Size</label>
              <input type="number" className="input-field w-full" value={form.employeeCount}
                onChange={e => setForm({ ...form, employeeCount: e.target.value })} placeholder="e.g. 50" min={1} />
            </div>
          </div>
        </section>

        {/* ── Founders ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
            <h2 className="font-sora font-bold text-sm text-gray-500 uppercase tracking-wider">Founders</h2>
            <button type="button" onClick={addFounder}
              className="text-xs text-brand font-semibold hover:underline flex items-center gap-1 font-jakarta">
              <Plus className="w-3 h-3" /> Add Founder
            </button>
          </div>
          {founders.map((f, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 font-jakarta">Full Name</label>
                <input type="text" className="input-field text-sm w-full" value={f.name}
                  onChange={e => updateFounder(i, 'name', e.target.value)} placeholder="e.g. Vivek Raghavan" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 font-jakarta">Role / Title</label>
                <input type="text" className="input-field text-sm w-full" value={f.role}
                  onChange={e => updateFounder(i, 'role', e.target.value)} placeholder="e.g. Co-founder & CEO" />
              </div>
              <div className="relative">
                <label className="block text-xs font-semibold text-gray-500 mb-1 font-jakarta">Previous Company</label>
                <input type="text" className="input-field text-sm w-full pr-8" value={f.prev}
                  onChange={e => updateFounder(i, 'prev', e.target.value)} placeholder="e.g. Ex-Google AI" />
                {founders.length > 1 && (
                  <button type="button" onClick={() => removeFounder(i)}
                    className="absolute right-2 top-8 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                    <X className="w-3.5 h-3.5 text-red-400" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* ── Contact ── */}
        <section className="space-y-4">
          <h2 className="font-sora font-bold text-sm text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 pb-2">Your Contact</h2>
          <div>
            <label className="block font-sora font-bold text-sm text-navy dark:text-white mb-2">Work Email *</label>
            <input type="email" className="input-field w-full" value={form.founderEmail}
              onChange={e => setForm({ ...form, founderEmail: e.target.value })} placeholder="you@startup.com" />
            <p className="text-xs text-gray-400 font-jakarta mt-1">We'll use this to notify you when your profile goes live.</p>
          </div>
        </section>

        {human.widget}
        <button type="submit" disabled={submitting}
          className="btn-brand w-full flex items-center justify-center gap-2 disabled:opacity-50 py-3">
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : 'Submit for Review'}
        </button>
        <p className="text-xs text-gray-400 font-jakarta text-center">
          Free listing. Reviewed within 2–3 business days.
        </p>
      </form>
    </div>
  );
}
