'use client';

import { useEffect, useState } from 'react';
import CareersPage, { type CareersPageData } from './CareersPage';

/** Inside the preview iframe: renders whatever the portal (same origin) sends, at the iframe's real width. */
export default function CareersPreviewFrame() {
  const [data, setData] = useState<CareersPageData | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'udyaibase:careers-preview') return;
      if (e.data.data && typeof e.data.data === 'object') setData(e.data.data as CareersPageData);
      if (e.data.theme === 'dark' || e.data.theme === 'light') setTheme(e.data.theme);
    };
    window.addEventListener('message', onMessage);
    if (window.parent !== window) window.parent.postMessage({ type: 'udyaibase:careers-preview-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!data) return null;
  return (
    <div className={theme === 'dark' ? 'dark' : ''} style={{ background: theme === 'dark' ? '#0b0b0c' : '#ffffff', minHeight: '100vh', colorScheme: theme }}>
      {/* Links do nothing here: it's a preview. */}
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10" onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a')) e.preventDefault(); }}>
        <CareersPage data={data} preview theme={theme} />
      </div>
    </div>
  );
}
