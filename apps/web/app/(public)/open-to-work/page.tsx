import type { Metadata } from 'next';
import { prisma } from '@udyaibase/database';
import { getCandidate } from '@/lib/jobs/candidate-account';
import { isClaimVerified } from '@/lib/jobs/trust';
import { draftFromApplications, getOpenProfile, myIntroRequests } from '@/lib/network/profile';
import { VISIBLE_DAYS, type IntroStatus, type WorkMode } from '@/lib/network/rules';
import CandidateSignIn from '@/components/jobs/CandidateSignIn';
import VerifyEmailToLink from '../my-applications/VerifyEmailToLink';
import OpenToWork from './OpenToWork';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Open to opportunities', robots: { index: false, follow: false } };

/** A job seeker's "Open to opportunities" profile and the requests companies sent them, behind their sign-in. */
export default async function OpenToWorkPage() {
  const me = await getCandidate();
  const intro = (
    <>
      <h1 className="font-sora font-extrabold text-2xl text-gray-900 dark:text-white">Open to opportunities</h1>
      <p className="mt-1 text-gray-600 dark:text-gray-400">
        Let AI startups hiring on Udyaibase invite you to apply. They see your skills and experience, never your name, email, phone or resume, until you choose to apply.
      </p>
    </>
  );
  if (!me) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 sm:py-16 font-jakarta">
        {intro}
        <div className="mt-6"><CandidateSignIn returnTo="/open-to-work" /></div>
      </div>
    );
  }
  if (!me.emailVerified) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 sm:py-16 font-jakarta">
        {intro}
        <p className="mt-6 text-sm text-gray-700 dark:text-gray-300">First, confirm this email is yours, so nobody else can put you on the network.</p>
        <div className="mt-3"><VerifyEmailToLink email={me.email} /></div>
      </div>
    );
  }

  const [profile, requests] = await Promise.all([getOpenProfile(me.id), myIntroRequests(me.id)]);
  const draft = profile ? null : await draftFromApplications(me.id);
  const blocked = profile?.blockedEmployerIds.length
    ? await prisma.jobBoardEmployer.findMany({ where: { id: { in: profile.blockedEmployerIds } }, select: { id: true, companyName: true } })
    : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 sm:py-16 font-jakarta">
      {intro}
      <OpenToWork
        email={me.email}
        visibleDays={VISIBLE_DAYS}
        profile={profile ? {
          headline: profile.headline, experienceYears: profile.experienceYears, skills: profile.skills, city: profile.city,
          workMode: profile.workMode as WorkMode, noticePeriodDays: profile.noticePeriodDays, currentCompany: profile.currentCompany,
          showCompany: profile.showCompany, visibleUntil: profile.visibleUntil.toISOString(), paused: !!profile.pausedAt,
        } : null}
        draft={draft}
        blocked={blocked.map((b) => ({ id: b.id, name: b.companyName }))}
        requests={requests.map((r) => ({
          id: r.id,
          status: r.status as IntroStatus,
          message: r.message,
          createdAt: r.createdAt.toISOString(),
          applied: !!r.applicationId,
          employerId: r.employerId,
          company: (isClaimVerified(r.Employer) && r.Employer.Startup?.name) || r.Employer.companyName,
          jobTitle: r.Listing.title,
          jobSlug: r.Listing.slug,
        }))}
      />
    </div>
  );
}
