'use client';

import { useCallback, useState } from 'react';

/**
 * One list of everything wrong with a form, shown at the top when the person tries to save.
 *
 * Browsers show their own bubble on the first bad field only ("Please fill in this field"), so a long form is fixed
 * one field at a time. With `noValidate` on the form and this hook, every problem is listed at once, each item jumps
 * to its field, and the fields are marked for screen readers.
 */

export interface FormProblem { key: string; label: string; message: string }

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function labelOf(el: Field): string {
  const fromLabel = el.labels?.[0]?.textContent ?? '';
  const raw = fromLabel || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || 'This field';
  // Drop the required star and any "12 / 60" or "(23 characters remaining)" counter inside the label.
  return raw.replace(/\([^)]*\)/g, '').replace(/\d+\s*\/\s*[\d,]+/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim() || 'This field';
}

function messageOf(el: Field): string {
  const v = el.validity;
  if (v.valueMissing) return el instanceof HTMLSelectElement ? 'needs a choice' : 'is required';
  if (v.typeMismatch && el.getAttribute('type') === 'url') return 'must be a full web address, like https://example.com';
  if (v.typeMismatch && el.getAttribute('type') === 'email') return 'must be an email address';
  if (v.tooLong) return `must be ${el.getAttribute('maxlength')} characters or fewer`;
  if (v.tooShort) return `must be at least ${el.getAttribute('minlength')} characters`;
  if (v.rangeUnderflow) return `must be ${el.getAttribute('min')} or more`;
  if (v.rangeOverflow) return `must be ${el.getAttribute('max')} or less`;
  if (v.patternMismatch) return el.getAttribute('title') ? `: ${el.getAttribute('title')}` : 'is not in the right format';
  return el.validationMessage || 'needs fixing';
}

const FIELDS = 'input:not([type=hidden]), textarea, select';
const keyFor = (el: Field, i: number) => el.id || el.name || `field-${i}`;

/** Every field the browser considers invalid, in page order. Also marks them (and clears the mark on the rest). */
export function findFormProblems(form: HTMLFormElement): FormProblem[] {
  const problems: FormProblem[] = [];
  form.querySelectorAll<Field>(FIELDS).forEach((el, i) => {
    const bad = el.willValidate && !el.checkValidity();
    if (bad) {
      el.setAttribute('aria-invalid', 'true');
      el.dataset.problemKey = keyFor(el, i);
      problems.push({ key: keyFor(el, i), label: labelOf(el), message: messageOf(el) });
    } else if (el.getAttribute('aria-invalid') === 'true') {
      el.removeAttribute('aria-invalid');
    }
  });
  return problems;
}

function focusProblem(form: HTMLFormElement | null, key: string) {
  const el = form ? [...form.querySelectorAll<Field>(FIELDS)].find((f) => f.dataset.problemKey === key) : undefined;
  if (!el) return;
  el.focus({ preventScroll: true });
  // A hidden field (a file input behind a button) can't take focus: bring its visible container into view instead.
  const target = document.activeElement === el ? el : el.closest<HTMLElement>('div, label, fieldset') ?? el;
  target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}

export function useFormProblems() {
  const [problems, setProblems] = useState<FormProblem[]>([]);
  const [form, setForm] = useState<HTMLFormElement | null>(null);

  /** Call from onSubmit. True when the form may be saved; otherwise the list is shown and the first field focused. */
  const check = useCallback((target: HTMLFormElement): boolean => {
    const found = findFormProblems(target);
    setForm(target);
    setProblems(found);
    if (found.length) focusProblem(target, found[0].key);
    return found.length === 0;
  }, []);

  const jumpTo = useCallback((key: string) => focusProblem(form, key), [form]);
  return { problems, check, jumpTo, clear: () => setProblems([]) };
}

export function FormProblemList({ problems, onJump }: { problems: FormProblem[]; onJump: (key: string) => void }) {
  if (problems.length === 0) return null;
  return (
    <div role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
      <p className="text-sm font-semibold text-red-700 dark:text-red-300">
        {problems.length === 1 ? 'Fix 1 field to save' : `Fix ${problems.length} fields to save`}
      </p>
      <ul className="mt-2 space-y-1">
        {problems.map((p) => (
          <li key={p.key}>
            <button type="button" onClick={() => onJump(p.key)} className="text-left text-sm text-red-700 dark:text-red-300 underline underline-offset-2 hover:no-underline min-h-[28px]">
              <span className="font-semibold">{p.label}</span> {p.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Jump links for a long form. Each `id` is the id of a section on the page. */
export function SectionLinks({ label, sections }: { label: string; sections: readonly { id: string; label: string }[] }) {
  return (
    <nav aria-label={label}>
      <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((sec) => (
          <li key={sec.id} className="shrink-0">
            <a href={`#${sec.id}`} className="inline-flex items-center min-h-[40px] sm:min-h-[36px] px-4 sm:px-3 rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm sm:text-[13px] font-semibold text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600">
              {sec.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
