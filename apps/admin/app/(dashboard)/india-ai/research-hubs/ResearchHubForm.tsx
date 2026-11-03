'use client';

import { useState } from 'react';
import { CityPicker } from '@/components/LocationFields';

interface Props {
  action: (formData: FormData) => Promise<void>;
  defaultValues?: {
    name?: string;
    city?: string;
    state?: string;
    tag?: string;
    category?: string;
    aiCentre?: string | null;
    dept?: string | null;
    faculty?: string | null;
    students?: string | null;
    programs?: string | null;
    fundedBy?: string | null;
    bharatGen?: string | null;
    appliedAI?: string | null;
    researchAreas?: string[];
    labs?: { name: string; description: string }[];
    link?: string;
    linkLabel?: string;
    displayOrder?: number;
    isActive?: boolean;
  };
}

export default function ResearchHubForm({ action, defaultValues }: Props) {
  const [city, setCity] = useState(defaultValues?.city ?? '');
  const [state, setState] = useState(defaultValues?.state ?? '');
  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <form action={action} className="max-w-2xl space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Name *</label>
          <input name="name" required className={inputClass} defaultValue={defaultValues?.name} placeholder="IISc Bangalore" />
        </div>
        <div>
          <label className={labelClass}>Category *</label>
          <select name="category" required className={inputClass} defaultValue={defaultValues?.category || 'AI Centre'}>
            <option value="AI Centre">AI Centre</option>
            <option value="Dedicated AI Dept">Dedicated AI Dept</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="hub-city" className={labelClass}>City *</label>
          <CityPicker id="hub-city" country="India" value={city} onChange={(c) => { setCity(c?.city ?? ''); if (c?.state) setState(c.state); }} />
          <input type="hidden" name="city" value={city} required />
        </div>
        <div>
          <label className={labelClass}>State *</label>
          <input name="state" required className={inputClass} value={state} onChange={(e) => setState(e.target.value)} placeholder="Filled from the city" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Tag *</label>
        <select name="tag" required className={inputClass} defaultValue={defaultValues?.tag || 'Institute of Eminence'}>
          <option value="Institute of Eminence">Institute of Eminence</option>
          <option value="Institute of National Importance">Institute of National Importance</option>
          <option value="Deemed University">Deemed University</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>AI Centre / School Name</label>
        <input name="aiCentre" className={inputClass} defaultValue={defaultValues?.aiCentre || ''} placeholder="Kotak IISc AI-ML Centre (KIAC)" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Department</label>
          <input name="dept" className={inputClass} defaultValue={defaultValues?.dept || ''} placeholder="CDS (14 labs)" />
        </div>
        <div>
          <label className={labelClass}>Faculty</label>
          <input name="faculty" className={inputClass} defaultValue={defaultValues?.faculty || ''} placeholder="80+ (across 15 depts)" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Students</label>
          <input name="students" className={inputClass} defaultValue={defaultValues?.students || ''} placeholder="100+ current & alumni" />
        </div>
        <div>
          <label className={labelClass}>Programs</label>
          <input name="programs" className={inputClass} defaultValue={defaultValues?.programs || ''} placeholder="BTech, MTech, PhD" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Funded By</label>
          <input name="fundedBy" className={inputClass} defaultValue={defaultValues?.fundedBy || ''} placeholder="TCS Foundation, MeitY" />
        </div>
        <div>
          <label className={labelClass}>BharatGen</label>
          <input name="bharatGen" className={inputClass} defaultValue={defaultValues?.bharatGen || ''} placeholder="Consortium member" />
        </div>
        <div>
          <label className={labelClass}>Applied AI</label>
          <input name="appliedAI" className={inputClass} defaultValue={defaultValues?.appliedAI || ''} placeholder="Mobility & Healthcare" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Research Areas (one per line)</label>
        <textarea name="researchAreas" rows={4} className={inputClass} defaultValue={defaultValues?.researchAreas?.join('\n') || ''} placeholder="Machine Learning&#10;Deep Learning&#10;Computer Vision" />
      </div>

      <div>
        <label className={labelClass}>Labs & Centres (format: Name | Description, one per line)</label>
        <textarea name="labs" rows={6} className={inputClass} defaultValue={defaultValues?.labs?.map(l => `${l.name} | ${l.description}`).join('\n') || ''} placeholder="KIAC (Kotak IISc AI-ML Centre) | Flagship AI centre with PhD & MTech(Res) programs" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Website Link *</label>
          <input name="link" required type="url" className={inputClass} defaultValue={defaultValues?.link} placeholder="https://kiac.iisc.ac.in/" />
        </div>
        <div>
          <label className={labelClass}>Link Label *</label>
          <input name="linkLabel" required className={inputClass} defaultValue={defaultValues?.linkLabel} placeholder="Visit KIAC" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Display Order</label>
          <input name="displayOrder" type="number" className={inputClass} defaultValue={defaultValues?.displayOrder || 0} />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input name="isActive" type="checkbox" defaultChecked={defaultValues?.isActive !== false} className="w-4 h-4" />
          <label className="text-sm text-gray-700 dark:text-gray-300">Active</label>
        </div>
      </div>

      <div className="pt-4">
        <button type="submit" className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-sm">
          Save Institution
        </button>
      </div>
    </form>
  );
}
