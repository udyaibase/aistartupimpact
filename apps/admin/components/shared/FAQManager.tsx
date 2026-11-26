'use client';

import { notify } from '@/components/Toast';
import { useState } from 'react';
import { Plus, Edit3, Trash2, Save, X, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { ask } from '@/components/Ask';

export interface FAQ {
  id?: string;
  question: string;
  answer: string;
  order: number;
}

interface FAQManagerProps {
  faqs: FAQ[];
  onChange: (faqs: FAQ[]) => void;
  maxFaqs?: number;
  readonly?: boolean;
}

export function FAQManager({ faqs, onChange, maxFaqs = 10, readonly = false }: FAQManagerProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingFAQ, setEditingFAQ] = useState<FAQ | null>(null);
  const [originalFAQ, setOriginalFAQ] = useState<FAQ | null>(null);

  const addFAQ = () => {
    if (faqs.length >= maxFaqs) return;
    const newFAQ: FAQ = {
      question: '',
      answer: '',
      order: faqs.length,
    };
    onChange([...faqs, newFAQ]);
    setEditingIndex(faqs.length);
    setEditingFAQ(newFAQ);
    setOriginalFAQ(null);
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditingFAQ({ ...faqs[index] });
    setOriginalFAQ({ ...faqs[index] });
  };

  const saveEdit = () => {
    if (editingIndex === null || !editingFAQ) return;
    
    // Validate
    if (!editingFAQ.question.trim() || !editingFAQ.answer.trim()) {
      notify('Question and answer are required');
      return;
    }

    const updated = [...faqs];
    updated[editingIndex] = editingFAQ;
    onChange(updated);
    setEditingIndex(null);
    setEditingFAQ(null);
    setOriginalFAQ(null);
  };

  const cancelEdit = () => {
    if (editingIndex === null) return;

    if (originalFAQ) {
      // Revert parent state to originalFAQ
      const updatedFaqs = [...faqs];
      updatedFaqs[editingIndex] = originalFAQ;
      onChange(updatedFaqs);
    } else {
      // It was a new FAQ, let's delete it
      const updatedFaqs = faqs.filter((_, i) => i !== editingIndex);
      onChange(updatedFaqs.map((faq, i) => ({ ...faq, order: i })));
    }
    setEditingIndex(null);
    setEditingFAQ(null);
    setOriginalFAQ(null);
  };

  const deleteFAQ = async (index: number) => {
    if (!(await ask({ title: 'Delete this FAQ', confirmLabel: 'Delete', danger: true }))) return;
    const updated = faqs.filter((_, i) => i !== index);
    // Reorder
    onChange(updated.map((faq, i) => ({ ...faq, order: i })));
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditingFAQ(null);
    }
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...faqs];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onChange(updated.map((faq, i) => ({ ...faq, order: i })));
  };

  const moveDown = (index: number) => {
    if (index === faqs.length - 1) return;
    const updated = [...faqs];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onChange(updated.map((faq, i) => ({ ...faq, order: i })));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-sora font-bold text-lg text-navy dark:text-white">
            FAQs ({faqs.length}/{maxFaqs})
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Add frequently asked questions to help users understand your offering
          </p>
        </div>
        {!readonly && (
          <button
            onClick={addFAQ}
            disabled={faqs.length >= maxFaqs}
            className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Add FAQ
          </button>
        )}
      </div>

      {/* FAQ List */}
      {faqs.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No FAQs yet. Click "Add FAQ" to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden"
            >
              {editingIndex === index && editingFAQ ? (
                // Edit Mode
                <div className="p-4 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                      Question * (max 200 characters)
                    </label>
                    <input
                      type="text"
                      value={editingFAQ.question}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingFAQ(prev => prev ? { ...prev, question: val } : null);
                        if (editingIndex !== null) {
                          const updated = [...faqs];
                          updated[editingIndex] = { ...updated[editingIndex], question: val };
                          onChange(updated);
                        }
                      }}
                      maxLength={200}
                      className="input-field text-sm"
                      placeholder="e.g. What problem does your startup solve?"
                      autoFocus
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {editingFAQ.question.length}/200 characters
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                      Answer * (max 1000 characters)
                    </label>
                    <textarea
                      value={editingFAQ.answer}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingFAQ(prev => prev ? { ...prev, answer: val } : null);
                        if (editingIndex !== null) {
                          const updated = [...faqs];
                          updated[editingIndex] = { ...updated[editingIndex], answer: val };
                          onChange(updated);
                        }
                      }}
                      maxLength={1000}
                      rows={4}
                      className="input-field text-sm"
                      placeholder="Provide a clear and concise answer..."
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {editingFAQ.answer.length}/1000 characters
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <button
                      onClick={cancelEdit}
                      className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={!editingFAQ.question.trim() || !editingFAQ.answer.trim()}
                      className="btn-brand text-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" /> Save
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Reorder Handle */}
                    {!readonly && (
                      <div className="flex flex-col gap-1 pt-1">
                        <button
                          onClick={() => moveUp(index)}
                          disabled={index === 0}
                          className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-30"
                          title="Move up"
                        >
                          <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                        <GripVertical className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                        <button
                          onClick={() => moveDown(index)}
                          disabled={index === faqs.length - 1}
                          className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-30"
                          title="Move down"
                        >
                          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h4 className="font-sora font-semibold text-sm text-navy dark:text-white mb-2">
                            {index + 1}. {faq.question}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                            {faq.answer}
                          </p>
                        </div>

                        {/* Actions */}
                        {!readonly && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => startEdit(index)}
                              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                              title="Edit"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                            <button
                              onClick={() => deleteFAQ(index)}
                              className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Help Text */}
      {!readonly && faqs.length > 0 && faqs.length < maxFaqs && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          You can add up to {maxFaqs - faqs.length} more FAQ{maxFaqs - faqs.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
