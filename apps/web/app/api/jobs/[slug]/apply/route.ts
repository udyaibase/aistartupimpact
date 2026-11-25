import { ensureSkillOverrides } from '@/lib/jobs/skill-overrides';
import { notifyEmployer } from '@/lib/employer/notify';
import { numberAnswer } from '@/lib/jobs/knockouts';
import { referrerFor } from '@/lib/employer/referrals';
import { markStep } from '@/lib/employer/onboarding';
import { isAcceptedIntro, linkIntroApplication } from '@/lib/network/profile';
import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { jobApplyRateLimit } from '@/lib/event-rate-limit';
import { applyableListingWhere } from '@/lib/jobs/public';
import { verifyApplySession } from '@/lib/jobs/apply-session';
import { matchSkills } from '@/lib/jobs/skills';
import { applyConsentText } from '@/lib/jobs/consent';
import { sendApplicationReceived, sendNewApplicationAlert } from '@/lib/jobs/apply-emails';
import { isClaimVerified } from '@/lib/jobs/trust';
import { getCandidate } from '@/lib/jobs/candidate-account';
import { cleanOptions, type ScreeningQuestion } from '@/lib/jobs/composer';
import { screenApplication } from '@/lib/jobs/ai-screen';
import { parseApplyFormConfig, requiredFieldErrors, withoutHiddenFields } from '@/lib/jobs/apply-form';

export const dynamic = 'force-dynamic';

type Source = 'JOBS_PAGE' | 'STARTUP_PROFILE' | 'GOOGLE' | 'WIDGET' | 'CAREERS_PAGE' | 'REFERRAL' | 'DIRECT' | 'OTHER' | 'NETWORK';
const SOURCE_LABEL: Record<Source, string> = {
  JOBS_PAGE: 'Udyaibase AI Jobs', STARTUP_PROFILE: 'your startup profile', GOOGLE: 'Google', WIDGET: 'your website', CAREERS_PAGE: 'your Udyaibase careers page',
  REFERRAL: 'a referral', DIRECT: 'a direct link', OTHER: 'another site', NETWORK: 'your Open to opportunities request',
};

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const httpUrl = (v: unknown) => {
  const s = clip(v, 300);
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
};
const num = (v: unknown, min: number, max: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/**
 * Step 2 of applying: submit the application. Requires the apply session from the resume upload,
 * so the bot check isn't repeated. Used by the job page and the website widget.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const { success } = await checkRateLimit(jobApplyRateLimit, getClientIdentifier(request));
  if (!success) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  const raw = await request.json().catch(() => ({}));

  const listing = await prisma.jobBoardListing.findFirst({
    where: { ...applyableListingWhere(), slug },
    select: {
      id: true, title: true, skills: true, applicationType: true, screeningQuestions: true, employerId: true, isGeneral: true,
      Employer: {
        select: {
          id: true, email: true, companyName: true, passwordHash: true, startupId: true, startupClaimMethod: true, applyFormConfig: true,
          Startup: { select: { name: true } }, CareersWidgets: { select: { id: true } },
        },
      },
    },
  });
  if (!listing) return NextResponse.json({ error: 'This job is no longer accepting applications.' }, { status: 404 });
  if (listing.applicationType === 'EXTERNAL') return NextResponse.json({ error: 'This job accepts applications on the company’s own site.' }, { status: 400 });

  const session = verifyApplySession(raw.token, listing.id);
  if (!session) return NextResponse.json({ error: 'Your session expired. Upload your resume again.', code: 'session' }, { status: 401 });
  const upload = await prisma.jobBoardResumeUpload.findUnique({ where: { id: session.uploadId } });
  if (!upload || upload.listingId !== listing.id) return NextResponse.json({ error: 'Upload your resume again.', code: 'session' }, { status: 401 });
  if (upload.applicationId) return NextResponse.json({ error: 'This application was already submitted.' }, { status: 409 });

  // ── Candidate details: what this employer's form asks for, and nothing it doesn't
  const form = parseApplyFormConfig(listing.Employer.applyFormConfig);
  const b = withoutHiddenFields(form, raw);
  const fullName = clip(b.fullName, 100);
  const email = clip(b.email, 200).toLowerCase();
  const errors: Record<string, string> = requiredFieldErrors(form, b);
  if (fullName.length < 2) errors.fullName = 'Enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Enter a valid email address.';
  if (b.consent !== true) errors.consent = 'Please agree to share your application.';

  // ── Screening questions: answer every required one
  const questions = (Array.isArray(listing.screeningQuestions) ? listing.screeningQuestions : []) as unknown as ScreeningQuestion[];
  const given = new Map<string, string>((Array.isArray(b.screeningAnswers) ? b.screeningAnswers : [])
    .map((a: any) => [String(a?.id ?? ''), clip(a?.answer, 1000)] as [string, string]));
  const screeningAnswers = questions.map((q) => {
    let answer = given.get(q.id) ?? '';
    if (q.type === 'yesno' && answer && answer !== 'yes' && answer !== 'no') answer = '';
    if (q.type === 'choice' && answer && !cleanOptions(q.options).includes(answer)) answer = '';
    if (q.type === 'number' && answer && numberAnswer(answer) == null) answer = '';
    if (q.required && !answer) errors[`q_${q.id}`] = 'Please answer this question.';
    return { id: q.id, question: q.question, type: q.type, answer };
  });
  if (Object.keys(errors).length) {
    const [field, message] = Object.entries(errors)[0];
    return NextResponse.json({ error: message, field, errors }, { status: 400 });
  }

  // ── Skills: candidate ticks from the job's own list; match is a plain comparison
  const confirmedSkills = (Array.isArray(b.confirmedSkills) ? b.confirmedSkills : [])
    .map(String).filter((s: string) => listing.skills.includes(s)).slice(0, 30);
  await ensureSkillOverrides();
  const matchedSkills = matchSkills(listing.skills, confirmedSkills);

  // ── Attribution
  const att = (b.attribution ?? {}) as Record<string, unknown>;
  const widgetId = typeof att.widgetId === 'string' && listing.Employer.CareersWidgets.some((w) => w.id === att.widgetId) ? att.widgetId : null;
  const referrerUrl = httpUrl(att.ref);
  let source: Source = 'JOBS_PAGE';
  if (att.source === 'widget' && widgetId) source = 'WIDGET';
  else if (att.source === 'profile') source = 'STARTUP_PROFILE';
  else if (att.source === 'careers') source = 'CAREERS_PAGE';
  else if (referrerUrl && /(^|\.)google\./i.test(new URL(referrerUrl).hostname)) source = 'GOOGLE';
  else if (att.source === 'referral') source = 'REFERRAL';
  // A teammate's referral link wins over everything else: someone at the company vouched for them.
  const referrer = await referrerFor(att.rc, listing.employerId);
  if (referrer) source = 'REFERRAL';

  const company = (isClaimVerified(listing.Employer) && listing.Employer.Startup?.name) || listing.Employer.companyName;
  const statusToken = crypto.randomBytes(24).toString('base64url');
  // Applying while signed in puts it in their "My applications" straight away (their own session, so no email check).
  const candidate = await getCandidate().catch(() => null);
  // Applying after accepting a company's "Open to opportunities" request (their own request, for this job).
  const fromIntro = await isAcceptedIntro(att.intro, candidate?.id, listing.id);
  if (fromIntro) source = 'NETWORK';

  let applicationId: string;
  try {
    applicationId = await prisma.$transaction(async (tx) => {
      const app = await tx.jobBoardApplication.create({
        data: {
          listingId: listing.id,
          webUserId: candidate?.id ?? null,
          fullName,
          email,
          phone: clip(b.phone, 30) || null,
          linkedinUrl: httpUrl(b.linkedinUrl),
          githubUrl: httpUrl(b.githubUrl),
          portfolioUrl: httpUrl(b.portfolioUrl),
          resumeKey: upload.key,
          coverLetter: clip(b.coverLetter, 3000) || null,
          currentTitle: clip(b.currentTitle, 100) || null,
          currentCompany: clip(b.currentCompany, 100) || null,
          city: clip(b.city, 80) || null,
          experienceYears: num(b.experienceYears, 0, 60) != null ? Math.round(num(b.experienceYears, 0, 60)!) : null,
          noticePeriodDays: num(b.noticePeriodDays, 0, 365) != null ? Math.round(num(b.noticePeriodDays, 0, 365)!) : null,
          expectedCtcLakh: num(b.expectedCtcLakh, 0, 1000),
          screeningAnswers: screeningAnswers.length ? screeningAnswers : undefined,
          confirmedSkills,
          matchedSkills,
          source,
          widgetId,
          referrerUrl,
          referrerId: referrer?.id ?? null,
          utmSource: clip(att.utm_source, 100) || null,
          utmMedium: clip(att.utm_medium, 100) || null,
          utmCampaign: clip(att.utm_campaign, 100) || null,
          consentAt: new Date(),
          consentText: applyConsentText(company),
          talentPoolUntil: b.talentPool === true ? new Date(Date.now() + 365 * 864e5) : null,
          statusTokenHash: crypto.createHash('sha256').update(statusToken).digest('hex'),
        },
        select: { id: true },
      });
      await tx.jobBoardResumeUpload.update({ where: { id: upload.id }, data: { applicationId: app.id } });
      await tx.jobBoardListing.update({ where: { id: listing.id }, data: { applicationsCount: { increment: 1 } } });
      return app.id;
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      // Signed in: their applications are in the account. Guests: the email we sent has their private link.
      return NextResponse.json({
        error: candidate ? 'You’ve already applied for this job.' : 'You’ve already applied for this job with this email. Check your email for the link to track it.',
        code: 'duplicate', ...(candidate ? { trackUrl: '/my-applications' } : {}),
      }, { status: 409 });
    }
    console.error('[POST /api/jobs/apply]', err);
    return NextResponse.json({ error: 'We couldn’t submit your application. Please try again.' }, { status: 500 });
  }

  if (fromIntro) await linkIntroApplication({ introId: att.intro, userId: candidate?.id, listingId: listing.id, applicationId }).catch(() => false);
  sendApplicationReceived({ to: email, name: fullName, jobTitle: listing.title, company, statusToken });
  // Admin-managed placeholder accounts have no inbox of their own.
  if (listing.Employer.passwordHash !== '') {
    sendNewApplicationAlert({
      to: listing.Employer.email, candidateName: fullName, jobTitle: listing.title, jobId: listing.id,
      matched: matchedSkills.length, total: listing.skills.length, source: SOURCE_LABEL[source],
    });
  }

  void notifyEmployer(listing.employerId, {
    type: 'new_application', title: `New applicant for ${listing.title}`,
    message: `${fullName} applied via ${SOURCE_LABEL[source]}.`, link: `/employer/applications?job=${listing.id}`,
  });

  // Auto-screening on, with quota left on any plan: review runs after the response, so the candidate never waits.
  const employerId = listing.employerId;
  // General applications have no role to screen against.
  after(() => markStep(employerId, 'FIRST_APPLICATION'));
  if (!listing.isGeneral) after(() => screenApplication(applicationId, employerId, { auto: true }).then(() => undefined));

  // The candidate's own tracking link (also emailed), so the confirmation screen can offer it straight away.
  // Signed in: track it in their account. Guests: the private status link (also emailed).
  return NextResponse.json({
    success: true, applicationId, inAccount: !!candidate,
    trackUrl: candidate ? `/my-applications/${applicationId}` : `/applications/${statusToken}`,
  }, { status: 201 });
}
