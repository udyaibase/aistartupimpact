'use client';

import { useState } from 'react';
import CandidateSignIn from '@/components/jobs/CandidateSignIn';

/**
 * Above the apply form, for someone who isn't signed in: one quiet line, not a sign-in box. Applying as a guest is
 * the main path, so nothing here should make a first-time visitor stop and wonder whether they need an account.
 * People who already have one open the sign-in from the link and come back with their resume and details filled in.
 * The id lets the form hide this once the application is sent (the confirmation offers to save it instead).
 */
export default function ApplySignInHint({ returnTo }: { returnTo: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div id="apply-account-card" className="mb-3 font-jakarta">
      {open ? (
        <CandidateSignIn returnTo={returnTo} title="Sign in to use your saved resume and details" />
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Applied here before?{' '}
          <button type="button" onClick={() => setOpen(true)} className="font-semibold text-gray-900 dark:text-white underline underline-offset-2 hover:no-underline">
            Sign in
          </button>{' '}
          to reuse your resume and details. No account needed to apply.
        </p>
      )}
    </div>
  );
}
