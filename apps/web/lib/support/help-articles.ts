/**
 * Short help articles for the employer portal's Help page: the questions people ask most. Plain text paragraphs; each
 * links to the page where the thing is done. Keep them in step with the product when a flow changes.
 */
export interface HelpArticle { slug: string; title: string; body: string[]; link?: { href: string; label: string }; keywords: string }

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: 'post-first-job', title: 'Post your first job',
    body: [
      'Go to Jobs, then Post a job. The fastest way is to paste a job description you already have: we fill in the title, location, experience and skills for you to check.',
      'Add the salary range if you can (jobs with pay get more applicants), then press Publish. The job is live on Udyaibase AI Jobs, your startup profile and Google job search.',
    ],
    link: { href: '/employer/jobs/new', label: 'Post a job' }, keywords: 'create new job publish paste description',
  },
  {
    slug: 'job-waiting', title: 'Why is my job waiting to go live?',
    body: [
      'Jobs go live only for companies we can trust. If your startup isn’t verified by its founder yet, your job waits after you press Publish and goes live by itself once your company is cleared.',
      'There are two ways through: your founder verifies the startup (a few minutes), or, if your work email is on your company’s domain, our team checks your company the same working day.',
    ],
    link: { href: '/employer/company', label: 'Open your Company page' }, keywords: 'pending draft publish blocked verify waiting',
  },
  {
    slug: 'ask-founder', title: 'Ask your founder to verify the startup',
    body: [
      'On your Company page, enter your founder’s email and press “Email them for me”. We send them a link to verify the startup and open hiring, and remind them once the next day.',
      'When they do, they join your hiring workspace as an owner and your waiting jobs go live. You can also copy the link and send it on WhatsApp.',
    ],
    link: { href: '/employer/company', label: 'Ask your founder' }, keywords: 'founder verification verify startup link',
  },
  {
    slug: 'company-check', title: 'The company check and the “Email verified” label',
    body: [
      'If your work email is on your company’s website domain, your first job is checked by our team before it goes live. We look at your website, LinkedIn page and MCA record, the same working day (Mon–Sat, 9:30 am to 6:30 pm IST).',
      'After the check you can have 2 live jobs, shown with an “Email verified” label. When your founder verifies the startup, the limit goes and your jobs get the verified tick.',
    ],
    keywords: 'review check mca cin linkedin email verified limit two jobs',
  },
  {
    slug: 'pipeline', title: 'Move candidates through your pipeline',
    body: [
      'Open Candidates and drag a card to another stage, or select several and use Move. You choose whether the candidate gets an email, and can edit it before it goes.',
      'Each candidate’s history shows every move, email and note, so the whole team sees the same picture.',
    ],
    link: { href: '/employer/applications', label: 'Open candidates' }, keywords: 'stages move drag shortlist email candidate',
  },
  {
    slug: 'reject-hold', title: 'Reject a candidate, or put them on hold',
    body: [
      'Rejecting asks for a reason (skills, salary, notice period and so on). The reason is for your reports only; the candidate never sees it.',
      'On hold parks a good candidate with a date to come back to them, instead of rejecting. They return to your list on that date.',
    ],
    keywords: 'reject reason on hold later decline',
  },
  {
    slug: 'interviews', title: 'Interview rounds and calendar invites',
    body: [
      'Set the rounds for a job (for example Screening, Technical, Founder) from Candidates, then pick a candidate’s round as they move through.',
      'Schedule an interview from the candidate’s panel: choose the time, the panel from your team and an optional video link. The candidate and panel get an email with a calendar invite that works in Google, Outlook and Apple Calendar.',
    ],
    keywords: 'interview schedule round calendar invite ics meet zoom',
  },
  {
    slug: 'scorecards', title: 'Scorecards after an interview',
    body: [
      'After an interview, each interviewer fills a short scorecard for that round: a rating per skill, a recommendation and notes.',
      'Everyone’s scorecards sit on the candidate’s panel, so you can compare views before deciding.',
    ],
    keywords: 'scorecard feedback rating recommendation',
  },
  {
    slug: 'share-shortlist', title: 'Share a shortlist with someone outside the team',
    body: [
      'From a job’s candidates, use Share shortlist to create a private link for a founder, advisor or client. They can see the shortlisted profiles and resumes and vote, without an account.',
      'Links expire, and you can turn one off at any time.',
    ],
    keywords: 'share shortlist link vote client advisor',
  },
  {
    slug: 'team', title: 'Invite your team and choose their role',
    body: [
      'Owners manage everything. Recruiters post jobs and move candidates, but can’t change billing, team or company settings. Interviewers see only the jobs you give them and can add notes and scorecards.',
      'Invite people from the Team page with their work email.',
    ],
    link: { href: '/employer/team', label: 'Open your team' }, keywords: 'team invite recruiter interviewer owner role permission',
  },
  {
    slug: 'import', title: 'Import candidates from another tool',
    body: [
      'Export your candidates as CSV from your old tool (or save a spreadsheet as CSV), then use Import on the Candidates page. Add a ZIP of resumes if you have them.',
      'You match the columns, jobs and stages, see a preview, and import. Nobody is emailed, nobody joins your talent pool, and you can undo the whole import for 7 days.',
    ],
    link: { href: '/employer/applications/import', label: 'Import candidates' }, keywords: 'import csv freshteam migrate move spreadsheet zip resumes',
  },
  {
    slug: 'website', title: 'Show your jobs on your website',
    body: [
      'Your Careers settings give you a jobs widget to paste into your website, and a hosted careers page you can link to. Both update by themselves when you publish or close a job.',
    ],
    link: { href: '/employer/widget', label: 'Open careers settings' }, keywords: 'website widget careers page embed',
  },
  {
    slug: 'plans', title: 'Plans, the free trial and job limits',
    body: [
      'Your first published job starts a free trial of a paid plan. Each plan sets how many jobs can be live at once and which features you get. The Billing page shows your plan, its limits and when it renews.',
      'If you reach your live-job limit, close or pause a job, or upgrade.',
    ],
    link: { href: '/employer/billing', label: 'Open billing' }, keywords: 'plan price trial limit upgrade pro growth scale',
  },
  {
    slug: 'invoices', title: 'Invoices and GST',
    body: [
      'Add your company’s billing details and GSTIN on the Billing page before you pay, so your invoice carries them. Invoices are emailed after each payment and listed on the Billing page.',
      'If an invoice is wrong, report it from this page and choose “A payment or invoice went wrong”.',
    ],
    link: { href: '/employer/billing', label: 'Open billing' }, keywords: 'invoice gst gstin tax receipt payment refund',
  },
  {
    slug: 'privacy', title: 'Candidate data and privacy',
    body: [
      'Candidates’ details are visible only to your team. We delete candidate data after a set time under India’s data protection law (DPDP), and candidates can ask to have their data removed.',
      'Export what you need from Candidates before then, and don’t copy candidate data into other places you don’t control.',
    ],
    keywords: 'privacy data deletion dpdp retention export gdpr',
  },
];

export function findArticle(slug: string) {
  return HELP_ARTICLES.find((a) => a.slug === slug) ?? null;
}
