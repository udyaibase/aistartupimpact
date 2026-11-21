'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface ProsConsManagerProps {
  pros: string[];
  cons: string[];
  onChangePros: (pros: string[]) => void;
  onChangeCons: (cons: string[]) => void;
  maxPros?: number;
  maxCons?: number;
}

function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.replace(/^[\s•\-\*\d.)\]]+/, '').trim())
    .filter(Boolean);
}

function toDisplay(items: string[]): string {
  return items.map(t => `• ${t}`).join('\n');
}

export default function ProsConsManager({
  pros,
  cons,
  onChangePros,
  onChangeCons,
  maxPros = 6,
  maxCons = 3,
}: ProsConsManagerProps) {
  const [prosText, setProsText] = useState(toDisplay(pros));
  const [consText, setConsText] = useState(toDisplay(cons));

  const handleProsChange = (value: string) => {
    setProsText(value);
    onChangePros(parseLines(value).slice(0, maxPros));
  };

  const handleConsChange = (value: string) => {
    setConsText(value);
    onChangeCons(parseLines(value).slice(0, maxCons));
  };

  const handlePaste = (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    setter: (v: string) => void,
    current: string
  ) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes('\n')) {
      e.preventDefault();
      const lines = parseLines(pasted);
      const existing = parseLines(current);
      const merged = [...existing, ...lines];
      setter(toDisplay(merged));
    }
  };

  const removePro = (index: number) => {
    const updated = parseLines(prosText).filter((_, i) => i !== index);
    setProsText(toDisplay(updated));
    onChangePros(updated);
  };

  const removeCon = (index: number) => {
    const updated = parseLines(consText).filter((_, i) => i !== index);
    setConsText(toDisplay(updated));
    onChangeCons(updated);
  };

  const proItems = parseLines(prosText);
  const conItems = parseLines(consText);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Strengths & Limitations</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Help users understand what your tool does best and where it has gaps.</p>
      </div>

      {/* Pros / Top Strengths */}
      <div>
        <label className="text-xs font-medium text-green-700 dark:text-green-400 mb-2 block">
          Top Strengths ({proItems.length}/{maxPros}) <span className="text-gray-400 font-normal">— paste multiple lines at once</span>
        </label>
        <textarea
          aria-label="Top strengths, one per line"
          value={prosText}
          onChange={(e) => handleProsChange(e.target.value)}
          onPaste={(e) => handlePaste(e, handleProsChange, prosText)}
          placeholder="Paste strengths here — one per line, auto-formatted with bullet points"
          rows={4}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-green-500/20 focus:border-green-400 resize-none"
        />
        {proItems.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {proItems.map((pro, i) => (
              <div key={i} className="flex items-center gap-2 group">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{pro}</span>
                <button type="button" onClick={() => removePro(i)} className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cons / Limitations */}
      <div>
        <label className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-2 block">
          Limitations ({conItems.length}/{maxCons}) <span className="text-gray-400 font-normal">— optional, builds trust</span>
        </label>
        <textarea
          aria-label="Limitations, one per line"
          value={consText}
          onChange={(e) => handleConsChange(e.target.value)}
          onPaste={(e) => handlePaste(e, handleConsChange, consText)}
          placeholder="Paste limitations here — one per line, auto-formatted with bullet points"
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 resize-none"
        />
        {conItems.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {conItems.map((con, i) => (
              <div key={i} className="flex items-center gap-2 group">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{con}</span>
                <button type="button" onClick={() => removeCon(i)} className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
