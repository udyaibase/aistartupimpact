'use client';

import { useEffect, useState } from 'react';

export interface AppliedJob { slug: string; id: string; appliedAt: string; withdrawn: boolean }

// One request per page load, shared by every card and button on the page.
let pending: Promise<Map<string, AppliedJob>> | null = null;
function load() {
  pending ??= fetch('/api/user/applied-jobs', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : { jobs: [] }))
    .then((d) => new Map<string, AppliedJob>((d.jobs ?? []).map((j: AppliedJob) => [j.slug, j])))
    .catch(() => new Map());
  return pending;
}

/** The signed-in job seeker's applications by job slug (empty when signed out). */
export function useAppliedJobs(): Map<string, AppliedJob> {
  const [map, setMap] = useState<Map<string, AppliedJob>>(new Map());
  useEffect(() => { let live = true; load().then((m) => { if (live) setMap(m); }); return () => { live = false; }; }, []);
  return map;
}

export const appliedOn = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
