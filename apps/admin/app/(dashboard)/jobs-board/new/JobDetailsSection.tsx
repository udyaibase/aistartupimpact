'use client';

import { Eye, PenLine } from 'lucide-react';
import { renderDescriptionPreview, DEPARTMENTS, getCustomDepartments, saveCustomDepartment, JOB_CATEGORIES } from './job-form';
import type { JobForm } from './job-form';

/** Title, category, department and the description with its preview. */
export default function JobDetailsSection({ form, updateField, customDeptInput, setCustomDeptInput, showCustomDept, setShowCustomDept, customDepts, setCustomDepts, descTab, setDescTab }: {
  form: JobForm;
  updateField: (field: string, value: any) => void;
  customDeptInput: string;
  setCustomDeptInput: (v: string) => void;
  showCustomDept: boolean;
  setShowCustomDept: (v: boolean) => void;
  customDepts: string[];
  setCustomDepts: (v: string[]) => void;
  descTab: 'write' | 'preview';
  setDescTab: (v: 'write' | 'preview') => void;
}) {
  return (
    <>
      {/* Job Details */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-4">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Job Details</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Title *</label>
          <input type="text" required value={form.title} onChange={e => updateField('title', e.target.value)}
            className="input-field" placeholder="e.g. Senior ML Engineer" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 font-jakarta">Description *</label>
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              <button type="button" onClick={() => setDescTab('write')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  descTab === 'write' ? 'bg-white dark:bg-gray-700 text-navy dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                <PenLine className="w-3 h-3" /> Write
              </button>
              <button type="button" onClick={() => setDescTab('preview')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  descTab === 'preview' ? 'bg-white dark:bg-gray-700 text-navy dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                <Eye className="w-3 h-3" /> Preview
              </button>
            </div>
          </div>
          {descTab === 'write' ? (
            <textarea required value={form.description} onChange={e => updateField('description', e.target.value)}
              rows={12} className="input-field font-mono text-sm" placeholder="Full job description..." />
          ) : (
            <div className="input-field min-h-[200px] max-h-[500px] overflow-y-auto p-4 prose-sm"
              dangerouslySetInnerHTML={{ __html: renderDescriptionPreview(form.description) || '<p class="text-gray-400 italic">No description yet...</p>' }} />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Category</label>
            <select value={form.category} onChange={e => updateField('category', e.target.value)} className="input-field">
              {JOB_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Department</label>
            {showCustomDept ? (
              <div className="flex gap-2">
                <input type="text" value={customDeptInput} onChange={e => setCustomDeptInput(e.target.value)}
                  className="input-field flex-1" placeholder="Enter custom department" autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (customDeptInput.trim()) {
                        saveCustomDepartment(customDeptInput.trim());
                        setCustomDepts(getCustomDepartments());
                        updateField('department', customDeptInput.trim());
                        setCustomDeptInput('');
                        setShowCustomDept(false);
                      }
                    }
                  }} />
                <button type="button" onClick={() => {
                  if (customDeptInput.trim()) {
                    saveCustomDepartment(customDeptInput.trim());
                    setCustomDepts(getCustomDepartments());
                    updateField('department', customDeptInput.trim());
                  }
                  setCustomDeptInput('');
                  setShowCustomDept(false);
                }} className="px-3 py-2 text-xs font-semibold bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors">
                  Add
                </button>
                <button type="button" onClick={() => { setShowCustomDept(false); setCustomDeptInput(''); }}
                  className="px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            ) : (
              <select value={form.department} onChange={e => {
                if (e.target.value === '__custom__') {
                  setShowCustomDept(true);
                } else {
                  updateField('department', e.target.value);
                }
              }} className="input-field">
                <option value="">Select department</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                {customDepts.length > 0 && (
                  <optgroup label="Custom">
                    {customDepts.map(d => <option key={`c-${d}`} value={d}>{d}</option>)}
                  </optgroup>
                )}
                <option value="__custom__">+ Add custom department</option>
              </select>
            )}
          </div>
        </div>
      </div>

    </>
  );
}
