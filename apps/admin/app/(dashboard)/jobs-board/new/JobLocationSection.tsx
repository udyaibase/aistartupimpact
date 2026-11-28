'use client';

import { CityPicker, CountryPicker } from '@/components/LocationFields';
import type { JobForm } from './job-form';

/** Where the job is based and how people work. */
export default function JobLocationSection({ form, updateField }: {
  form: JobForm;
  updateField: (field: string, value: any) => void;
}) {
  return (
    <>
      {/* Location */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-4">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Location</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 font-jakarta">Work Type</label>
          <div className="flex gap-2">
            {['REMOTE', 'HYBRID', 'ONSITE'].map(t => (
              <button key={t} type="button" onClick={() => updateField('workType', t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  form.workType === t
                    ? 'bg-brand text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 font-jakarta">Employment Type</label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'FULL_TIME', label: 'Full Time' },
              { value: 'PART_TIME', label: 'Part Time' },
              { value: 'CONTRACT', label: 'Contract' },
              { value: 'INTERNSHIP', label: 'Internship' },
              { value: 'FREELANCE', label: 'Freelance' },
            ].map(t => (
              <button key={t.value} type="button" onClick={() => updateField('employmentType', t.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  form.employmentType === t.value
                    ? 'bg-brand text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="job-country" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Country</label>
            <CountryPicker id="job-country" value={form.country}
              onChange={(c) => { updateField('country', c ?? ''); if (c !== form.country) updateField('city', ''); }} />
          </div>
          {form.workType !== 'REMOTE' && (
            <div>
              <label htmlFor="job-city" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">City</label>
              <CityPicker id="job-city" value={form.city} country={form.country || null}
                onChange={(c) => { updateField('city', c?.city ?? ''); if (c && !form.country) updateField('country', c.country); }} />
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.visaSponsorship} onChange={e => updateField('visaSponsorship', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand" />
          <span className="text-sm text-gray-700 dark:text-gray-300 font-jakarta">Visa sponsorship available</span>
        </label>
      </div>

    </>
  );
}
