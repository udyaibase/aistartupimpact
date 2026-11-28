'use client';

import { pricingModels } from './types';
import type { NewToolForm } from './types';

/** Pricing model and price details. */
export default function NewToolPricingSection({ formData, handleChange }: {
  formData: NewToolForm;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}) {
  return (
    <>
      {/* Pricing */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Pricing</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Pricing Model
            </label>
            <select
              name="pricingModel"
              value={formData.pricingModel}
              onChange={handleChange}
              className="input-field text-sm"
            >
              {pricingModels.map(p => (
                <option key={p} value={p}>{p.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Starting Price (USD/month)
            </label>
            <input
              type="number"
              name="startingPrice"
              value={formData.startingPrice ?? ''}
              onChange={handleChange}
              min="0"
              step="0.01"
              className="input-field text-sm"
              placeholder="9.99"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Pricing Page URL
            </label>
            <input
              type="url"
              name="pricingUrl"
              value={formData.pricingUrl}
              onChange={handleChange}
              className="input-field text-sm"
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Free Trial Days
            </label>
            <input
              type="number"
              name="freeTrialDays"
              value={formData.freeTrialDays ?? ''}
              onChange={handleChange}
              min="0"
              className="input-field text-sm"
              placeholder="14"
            />
          </div>
        </div>
      </div>

    </>
  );
}
