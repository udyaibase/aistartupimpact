'use client';

import type { JobForm } from './job-form';

/** Pay, requirements, how to apply and the admin-only listing settings. */
export default function JobTermsSection({ form, updateField }: {
  form: JobForm;
  updateField: (field: string, value: any) => void;
}) {
  return (
    <>
      {/* Compensation */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-4">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Compensation</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Min Salary</label>
            <input type="number" value={form.salaryMin} onChange={e => updateField('salaryMin', e.target.value)}
              className="input-field" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Max Salary</label>
            <input type="number" value={form.salaryMax} onChange={e => updateField('salaryMax', e.target.value)}
              className="input-field" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Currency</label>
            <select value={form.salaryCurrency} onChange={e => updateField('salaryCurrency', e.target.value)} className="input-field">
              <option value="INR">INR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.showSalary} onChange={e => updateField('showSalary', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand" />
              <span className="text-sm text-gray-700 dark:text-gray-300 font-jakarta">Show salary</span>
            </label>
          </div>
        </div>
      </div>

      {/* Requirements */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-4">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Requirements</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Min Experience (years)</label>
            <input type="number" value={form.experienceMin} onChange={e => updateField('experienceMin', e.target.value)}
              className="input-field" min="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Max Experience (years)</label>
            <input type="number" value={form.experienceMax} onChange={e => updateField('experienceMax', e.target.value)}
              className="input-field" min="0" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Skills (comma-separated)</label>
          <input type="text" value={form.skills} onChange={e => updateField('skills', e.target.value)}
            className="input-field" placeholder="Python, TensorFlow, PyTorch, NLP" />
        </div>
      </div>

      {/* Application Method */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-4">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Application Method</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 font-jakarta">How should candidates apply?</label>
          <div className="flex gap-2">
            {[{ v: 'EXTERNAL', l: 'External URL' }, { v: 'INTERNAL', l: 'On Udyaibase' }].map(t => (
              <button key={t.v} type="button" onClick={() => updateField('applicationType', t.v)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  form.applicationType === t.v
                    ? 'bg-brand text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>

        {form.applicationType === 'EXTERNAL' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Application URL</label>
            <input type="url" value={form.applicationUrl} onChange={e => updateField('applicationUrl', e.target.value)}
              className="input-field" placeholder="https://careers.example.com/apply" />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Application Email (optional)</label>
          <input type="email" value={form.applicationEmail} onChange={e => updateField('applicationEmail', e.target.value)}
            className="input-field" placeholder="hr@example.com" />
        </div>
      </div>

      {/* Listing Settings (admin-only) */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-4">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Listing Settings</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Listing Tier</label>
            <select value={form.listingTier} onChange={e => updateField('listingTier', e.target.value)} className="input-field">
              <option value="FREE">Free</option>
              <option value="FEATURED">Featured</option>
              <option value="PREMIUM">Premium</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isFeatured} onChange={e => updateField('isFeatured', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand" />
            <span className="text-sm text-gray-700 dark:text-gray-300 font-jakarta">Featured</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={e => updateField('isActive', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand" />
            <span className="text-sm text-gray-700 dark:text-gray-300 font-jakarta">Publish immediately</span>
          </label>
        </div>
      </div>

    </>
  );
}
