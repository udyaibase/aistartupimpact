'use client';

import { useState } from 'react';
import JobApplyForm from '@/components/jobs/apply/JobApplyForm';
import type { ApplyFormConfig } from '@/lib/jobs/apply-form';

/** "Apply generally" on the hosted company page when no roles are open; opens the normal application form. */
export default function GeneralApplyCard({ slug, company, consentText, form, preview = false }: {
  slug: string; company: string; consentText: string; form: ApplyFormConfig;
  /** Employer's live preview: the button does nothing. */
  preview?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = { borderColor: 'var(--w-border)', background: 'var(--w-surface)', borderRadius: 'var(--r-card)' };

  if (open) {
    return (
      <div className="border p-5 sm:p-6" style={box}>
        <JobApplyForm
          job={{ slug, title: 'General application', company, skills: [], screeningQuestions: [], consentText, form }}
          attribution={{ source: 'careers' }}
          onBack={() => setOpen(false)}
        />
      </div>
    );
  }
  return (
    <div className="border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-3" style={box}>
      <div className="flex-1">
        <p className="font-semibold">Don’t want to wait?</p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--w-muted)' }}>Send a general application and the {company} team will keep you in mind.</p>
      </div>
      <button type="button" onClick={() => { if (!preview) setOpen(true); }}
        className="shrink-0 min-h-[44px] px-5 font-semibold text-sm"
        style={{ background: 'var(--embed-accent)', color: 'var(--embed-on-accent)', borderRadius: 'var(--r-button)' }}>
        Apply generally
      </button>
    </div>
  );
}
