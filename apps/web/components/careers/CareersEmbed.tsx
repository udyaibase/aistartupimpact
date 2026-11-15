'use client';

import { useEffect, useRef, useState } from 'react';
import CareersPage, { type CareersPageData } from './CareersPage';

/**
 * The full careers page inside the website widget (Website widget → "Full careers page").
 * Sizes its frame like the roles widget, follows the widget's theme, and tags applications as coming from the widget.
 */
export default function CareersEmbed({ data, widgetId, darkMode }: { data: CareersPageData; widgetId: string; darkMode: 'auto' | 'light' | 'dark' }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(darkMode === 'dark');
  const [query, setQuery] = useState(`?source=widget&w=${widgetId}`);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.slice(1));
    const q = new URLSearchParams({ source: 'widget', w: widgetId });
    const ref = p.get('ref') || '';
    if (ref) q.set('ref', ref);
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) { const v = p.get(k); if (v) q.set(k, v); }
    setQuery(`?${q.toString()}`);
    const isPreview = p.get('preview') === '1';
    setPreview(isPreview);

    if (darkMode !== 'auto') setIsDark(darkMode === 'dark');
    else {
      const theme = p.get('theme');
      setIsDark(theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches));
    }

    // Count a view when it loads on a real site (same as the roles widget; never the portal preview).
    if (!isPreview && ref && !(navigator as any).webdriver) {
      fetch('/api/embed/track', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'jobs', widgetId, ref }), keepalive: true,
      }).catch(() => {});
    }
  }, [widgetId, darkMode]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (window.parent !== window) window.parent.postMessage({ type: 'udyaibase:resize', height: el.scrollHeight }, '*');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={rootRef} className={isDark ? 'dark' : ''} style={{ colorScheme: isDark ? 'dark' : 'light' }}>
      <div className="p-1">
        <CareersPage data={data} preview={preview} linkQuery={query} newTab theme={isDark ? 'dark' : 'light'} />
      </div>
    </div>
  );
}
