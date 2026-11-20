import { prisma, Prisma } from '@udyaibase/database';

/**
 * The onboarding funnel: the first time each workspace reaches a step, from sign-up to its first live job and first
 * application. One row per workspace and step (later repeats are ignored), so the admin report can show how many
 * get through each step and how long it takes. Recording never fails the action it belongs to.
 */
export const ONBOARDING_STEPS = [
  { step: 'WORKSPACE_CREATED', label: 'Workspace created' },
  { step: 'FIRST_DRAFT', label: 'First job drafted' },
  { step: 'PUBLISH_BLOCKED', label: 'Publish waited (company not cleared)' },
  { step: 'FOUNDER_ASKED', label: 'Founder asked to verify' },
  { step: 'REVIEW_REQUESTED', label: 'Company check requested' },
  { step: 'REVIEW_DECIDED', label: 'Company check decided' },
  { step: 'FIRST_JOB_LIVE', label: 'First job live' },
  { step: 'FIRST_APPLICATION', label: 'First application' },
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]['step'];

/** How the workspace started: a verified founder, or someone signing up (usually a recruiter or HR). */
export type OnboardingPath = 'founder' | 'signup';

export async function markStep(employerId: string, step: OnboardingStep, meta?: Record<string, string | number | boolean | null>): Promise<void> {
  try {
    await prisma.jobBoardOnboardingStep.createMany({
      data: [{ employerId, step, ...(meta ? { meta: meta as Prisma.InputJsonValue } : {}) }],
      skipDuplicates: true,
    });
  } catch (e) {
    console.warn('[onboarding] step not recorded', step, e instanceof Error ? e.message : e);
  }
}
