'use client';

import ProsConsManager from '@/components/shared/ProsConsManager';
import type { NewToolForm } from './types';

/** Features, use cases, pros and cons. */
export default function NewToolFeaturesSection({ formData, handleChange, pros, cons, setPros, setCons }: {
  formData: NewToolForm;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  pros: string[];
  cons: string[];
  setPros: React.Dispatch<React.SetStateAction<string[]>>;
  setCons: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return (
    <>
      {/* Features & Use Cases */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Features & Use Cases</h2>

        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
            Key Features <span className="text-red-500" aria-hidden>*</span>
          </label>
          <textarea
            name="features"
            value={formData.features}
            onChange={handleChange}
            rows={4}
            className="input-field text-sm"
            placeholder="Paste features here — one per line, auto-formatted with bullet points"
          />
          <p className="text-xs text-gray-400 mt-1">One feature per line</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
            Use Cases <span className="text-red-500" aria-hidden>*</span>
          </label>
          <textarea
            name="useCases"
            value={formData.useCases}
            onChange={handleChange}
            rows={4}
            className="input-field text-sm"
            placeholder="Paste use cases here — one per line"
          />
          <p className="text-xs text-gray-400 mt-1">One use case per line</p>
        </div>
      </div>

      {/* Pros & Cons */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
        <ProsConsManager
          pros={pros}
          cons={cons}
          onChangePros={setPros}
          onChangeCons={setCons}
        />
      </div>

    </>
  );
}
