'use client';

import { CityPicker, CountryPicker } from '@/components/LocationFields';
import type { NewToolForm } from './types';

/** Launch year, founders, location and platform details. */
export default function NewToolDetailsSection({ formData, setFormData, handleChange }: {
  formData: NewToolForm;
  setFormData: React.Dispatch<React.SetStateAction<NewToolForm>>;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}) {
  return (
    <>
      {/* Tool Details */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Tool Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Launch Year <span className="text-red-500" aria-hidden>*</span>
            </label>
            <input
              type="number"
              name="launchYear"
              value={formData.launchYear}
              onChange={handleChange}
              min="1900"
              max={new Date().getFullYear()}
              className="input-field text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Founder Names
            </label>
            <input
              type="text"
              name="founderNames"
              value={formData.founderNames}
              onChange={handleChange}
              className="input-field text-sm"
              placeholder="John Doe, Jane Smith"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Headquarters <span className="text-red-500" aria-hidden>*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CountryPicker value={formData.headquartersCountry || ''} clearable placeholder="Country"
                onChange={(c) => setFormData((prev: any) => (prev ? { ...prev, headquartersCountry: c ?? '', headquartersCity: c === prev.headquartersCountry ? prev.headquartersCity : '' } : prev))} />
              <CityPicker value={formData.headquartersCity || ''} country={formData.headquartersCountry || null} placeholder="City"
                onChange={(c) => setFormData((prev: any) => (prev ? { ...prev, headquartersCity: c?.city ?? '', headquartersCountry: prev.headquartersCountry || c?.country || '' } : prev))} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="hasApi"
              checked={formData.hasApi}
              onChange={handleChange}
              className="w-4 h-4 text-brand bg-gray-100 border-gray-300 rounded focus:ring-brand"
            />
            <span className="text-sm font-medium text-navy dark:text-white font-jakarta">
              Has API
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="hasMobileApp"
              checked={formData.hasMobileApp}
              onChange={handleChange}
              className="w-4 h-4 text-brand bg-gray-100 border-gray-300 rounded focus:ring-brand"
            />
            <span className="text-sm font-medium text-navy dark:text-white font-jakarta">
              Has Mobile App
            </span>
          </label>
        </div>
      </div>

    </>
  );
}
