import type { Metadata } from 'next';
import CareersPreviewFrame from '@/components/careers/CareersPreviewFrame';

export const metadata: Metadata = { title: 'Careers page preview', robots: { index: false, follow: false } };

/**
 * Blank frame for the employer portal's device preview. It fetches nothing: the portal posts the page content in
 * (same origin only), so the preview shows unsaved edits at a real desktop, tablet or phone width.
 */
export default function CareersPreviewPage() {
  return <CareersPreviewFrame />;
}
