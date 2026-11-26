'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

/**
 * What a message is, from its wording, for callers that just pass text (everything that used to be a browser
 * alert()). Problems are checked first, so "Saved but some data failed" is a warning, not a success.
 */
export function toneOf(message: string): ToastType {
  const m = message.toLowerCase();
  if (/\b(but|some data failed|partly|partially)\b/.test(m) && /\b(saved|created|updated)\b/.test(m)) return 'warning';
  if (/(fail|error|couldn.t|could not|cannot|can.t|unable|not found|denied|unauthori[sz]ed|invalid|went wrong)/.test(m)) return 'error';
  if (/(required|missing|please|must\b|maximum|already exists|too large|less than|under \d|select a|upload a)/.test(m)) return 'warning';
  if (/(success|saved|created|updated|deleted|approved|rejected|sent|copied|removed|added|done)/.test(m)) return 'success';
  return 'info';
}

type Listener = (message: string, type: ToastType) => void;
let listener: Listener | null = null;

/**
 * Show a message from anywhere in the admin, in place of a browser alert(): it doesn't block the page, it reads
 * as success / warning / error, and it goes away by itself. Pass the type, or leave it to the wording.
 */
export function notify(message: unknown, type?: ToastType) {
  const text = typeof message === 'string' && message.trim() ? message.trim() : 'Something went wrong. Please try again.';
  const tone = type ?? toneOf(text);
  if (listener) listener(text, tone);
  else if (typeof window !== 'undefined') console.warn('[notify]', text); // no provider mounted (tests, error pages)
}

/** Errors and warnings stay longer: they usually need reading, and often acting on. */
const LIFETIME_MS: Record<ToastType, number> = { success: 4000, info: 5000, warning: 8000, error: 10000 };

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId;
    // At most four on screen; a repeat of the message already showing is not stacked again.
    setToasts(prev => (prev.some(t => t.message === message && t.type === type) ? prev : [...prev.slice(-3), { id, message, type }]));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, LIFETIME_MS[type]);
  }, []);

  useEffect(() => {
    listener = toast;
    return () => { if (listener === toast) listener = null; };
  }, [toast]);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-600" aria-hidden />,
    error: <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" aria-hidden />,
    warning: <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" aria-hidden />,
    info: <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" aria-hidden />,
  };

  const bgColors = {
    success: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800',
    error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',
    warning: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800',
    info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:max-w-sm" aria-label="Notifications">
        {toasts.map(t => (
          <div
            key={t.id}
            role={t.type === 'error' || t.type === 'warning' ? 'alert' : 'status'}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg animate-slide-up ${bgColors[t.type]}`}
          >
            {icons[t.type]}
            <p className="text-sm font-jakarta font-medium text-gray-900 dark:text-white flex-1 whitespace-pre-line break-words">{t.message}</p>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="p-1 -m-1 rounded hover:bg-black/5 dark:hover:bg-white/10">
              <X className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
