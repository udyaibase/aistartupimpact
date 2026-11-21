/**
 * Dummy data for the DEV database branch, so every portal can be tested end to end:
 * AI tools, startups, an event organizer (events, tickets, registrations, team) and two hiring companies
 * (jobs, ~150 candidates across every stage, notes, history, talent pool, general applications).
 *
 *   cd packages/database && NODE_ENV=test npx tsx --env-file=.env seed-dev.ts
 *
 * - Refuses to run against the production database.
 * - Safe to re-run: it removes its own previous data first (everything it creates uses @udyaibase.test
 *   emails or the "demo-" slug prefix), then inserts fresh data.
 * - Every email address is on the reserved .test domain: the app never sends to it, and in local development
 *   the message (including sign-in codes) is printed in the dev server log instead.
 *
 * Sign-ins are listed in docs/development/TEST_ACCOUNTS.md.
 */
import { randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma, isProductionDatabase } from './index';
import { CITY_DATABASE } from '../utils/src/cities';

// The test accounts' password is never stored in git: set SEED_TEST_PASSWORD in your local .env (not committed),
// or let the seed generate one and print it once at the end.
const PASSWORD = process.env.SEED_TEST_PASSWORD || `Dev-${randomBytes(9).toString('base64url')}-9a`;
const D = '@udyaibase.test';
const DAY = 864e5;
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY);
const daysAhead = (n: number) => new Date(now + n * DAY);

// Deterministic randomness, so every run produces the same data.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const some = <T,>(a: readonly T[], n: number): T[] => [...a].sort(() => rand() - 0.5).slice(0, n);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── Guard ───────────────────────────────────────────────────────────────────────
function guard() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  if (isProductionDatabase(url)) {
    throw new Error('Refusing to seed: DATABASE_URL points at the PRODUCTION database. Run ./scripts/use-dev-db.sh first.');
  }
  const host = url.replace(/^[a-z]+:\/\/[^@]*@([^/:?]+).*/, '$1');
  console.log(`Seeding dev database at ${host}\n`);
}

// ── Cleanup of earlier runs ─────────────────────────────────────────────────────
async function cleanup() {
  const testEmail = { endsWith: D };
  const employers = await prisma.jobBoardEmployer.findMany({ where: { email: testEmail }, select: { id: true } });
  const employerIds = employers.map((e) => e.id);
  if (employerIds.length) {
    const listings = await prisma.jobBoardListing.findMany({ where: { employerId: { in: employerIds } }, select: { id: true } });
    const listingIds = listings.map((l) => l.id);
    const apps = await prisma.jobBoardApplication.findMany({ where: { listingId: { in: listingIds } }, select: { id: true } });
    const appIds = apps.map((a) => a.id);
    await prisma.jobBoardApplicationNote.deleteMany({ where: { applicationId: { in: appIds } } });
    await prisma.jobBoardApplicationEvent.deleteMany({ where: { applicationId: { in: appIds } } });
    await prisma.jobBoardTalentInvite.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.jobBoardApplication.deleteMany({ where: { id: { in: appIds } } });
    await prisma.jobBoardListing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.jobBoardTeamMember.deleteMany({ where: { employerId: { in: employerIds } } });
    await prisma.jobBoardEmployer.deleteMany({ where: { id: { in: employerIds } } });
  }

  const organizers = await prisma.eventOrganizer.findMany({ where: { email: testEmail }, select: { id: true } });
  const organizerIds = organizers.map((o) => o.id);
  if (organizerIds.length) {
    const events = await prisma.event.findMany({ where: { organizerId: { in: organizerIds } }, select: { id: true } });
    const eventIds = events.map((e) => e.id);
    await prisma.eventRegistration.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.eventTicketTier.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.eventTeamAssignment.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.eventTeamMember.deleteMany({ where: { organizerId: { in: organizerIds } } });
    await prisma.eventOrganizerSession.deleteMany({ where: { organizerId: { in: organizerIds } } });
    await prisma.eventOrganizer.deleteMany({ where: { id: { in: organizerIds } } });
  }

  await prisma.aiTool.deleteMany({ where: { slug: { startsWith: 'demo-' } } });
  await prisma.fundingRound.deleteMany({ where: { Startup: { slug: { startsWith: 'demo-' } } } });
  await prisma.investor.deleteMany({ where: { slug: { startsWith: 'demo-' } } });
  await prisma.article.deleteMany({ where: { slug: { startsWith: 'demo-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'demo-' } } });
  await prisma.user.deleteMany({ where: { email: testEmail } });
  await prisma.startup.deleteMany({ where: { slug: { startsWith: 'demo-' } } });
  await prisma.founderUser.deleteMany({ where: { email: testEmail } });
  await prisma.webUser.deleteMany({ where: { email: testEmail } }).catch(() => undefined);
}

// ── AI tools ────────────────────────────────────────────────────────────────────
const TOOL_CATEGORIES = [
  ['Writing', 'Draft, edit and translate text'], ['Coding', 'Code completion, review and agents'],
  ['Design', 'Images, logos and UI'], ['Video', 'Generate and edit video'], ['Productivity', 'Meetings, notes and email'],
  ['Data', 'Analytics and data pipelines'], ['Customer Support', 'Chatbots and helpdesk AI'], ['Voice', 'Speech, dubbing and voice agents'],
] as const;

const TOOLS: [string, string, number, string][] = [
  ['Lekhak AI', 'Write blogs and emails in 12 Indian languages', 0, 'FREEMIUM'],
  ['DraftPilot', 'An editor that rewrites in your brand voice', 0, 'PAID'],
  ['Anuvaad', 'Context-aware translation for Indian languages', 0, 'FREE'],
  ['CodeSutra', 'AI pair programmer that knows your whole repo', 1, 'FREEMIUM'],
  ['ReviewBot', 'Automated pull request review with fix suggestions', 1, 'PAID'],
  ['TestGenie', 'Writes unit tests from your existing code', 1, 'OPEN_SOURCE'],
  ['Rangoli Studio', 'Generate on-brand marketing images', 2, 'FREEMIUM'],
  ['LogoLab', 'Logos and brand kits in minutes', 2, 'PAID'],
  ['WireframeAI', 'Turn a sketch into a clickable prototype', 2, 'FREEMIUM'],
  ['ReelCraft', 'Short-form video from a script', 3, 'FREEMIUM'],
  ['DubIndia', 'Dub videos into Hindi, Tamil and Telugu', 3, 'PAID'],
  ['ClipCut', 'Find the best moments in long videos', 3, 'FREE'],
  ['MeetNotes', 'Meeting notes and action items, automatically', 4, 'FREEMIUM'],
  ['InboxZero AI', 'Sorts and drafts replies to your email', 4, 'PAID'],
  ['TaskWeaver', 'Plans your week from your calendar and tasks', 4, 'FREE'],
  ['QueryMitra', 'Ask questions about your data in plain English', 5, 'FREEMIUM'],
  ['PipeFlow', 'No-code data pipelines with AI cleanup', 5, 'ENTERPRISE'],
  ['ChartSense', 'Turns spreadsheets into dashboards', 5, 'FREEMIUM'],
  ['SahayakDesk', 'Helpdesk AI that answers from your docs', 6, 'PAID'],
  ['ChatSetu', 'WhatsApp chatbot builder for businesses', 6, 'FREEMIUM'],
  ['TicketSense', 'Routes and tags support tickets', 6, 'ENTERPRISE'],
  ['VaaniVoice', 'Natural voice agents for customer calls', 7, 'PAID'],
  ['SpeakEasy', 'Speech-to-text for Indian accents', 7, 'FREEMIUM'],
  ['PodPolish', 'Cleans up podcast audio in one click', 7, 'FREE'],
];

async function seedTools() {
  const cats: string[] = [];
  for (const [i, [name, description]] of TOOL_CATEGORIES.entries()) {
    // Kept between runs (same id), so people's saved interests and open pages keep pointing at real categories.
    const c = await prisma.toolCategory.upsert({
      where: { slug: `demo-${slugify(name)}` },
      update: { name, description, sortOrder: 100 + i, toolCount: 3, isActive: true },
      create: { id: randomUUID(), name, slug: `demo-${slugify(name)}`, description, sortOrder: 100 + i, toolCount: 3 },
    });
    cats.push(c.id);
  }
  for (const [i, [name, tagline, cat, pricing]] of TOOLS.entries()) {
    await prisma.aiTool.create({
      data: {
        id: randomUUID(), name, slug: `demo-${slugify(name)}`, tagline,
        description: `${name} helps teams ${tagline.toLowerCase()}. Built for Indian businesses, it works in English and regional languages, integrates with the tools you already use, and keeps your data in India.\n\nThis is dummy data for testing.`,
        websiteUrl: `https://${slugify(name)}.example.com`, categoryId: cats[cat], pricingModel: pricing as never,
        startingPrice: pricing === 'PAID' || pricing === 'ENTERPRISE' ? int(5, 50) * 100 : null,
        freeTrialDays: pricing === 'PAID' ? 14 : null, hasApi: rand() > 0.4, hasMobileApp: rand() > 0.6,
        launchYear: int(2021, 2026), headquartersCountry: 'India', headquartersCity: pick(['Bengaluru', 'Mumbai', 'Pune', 'Hyderabad', 'Delhi', 'Chennai']),
        founderNames: [pick(['Aarav Mehta', 'Priya Iyer', 'Rohan Gupta', 'Sneha Reddy', 'Kabir Shah', 'Ananya Rao'])],
        screenshotUrls: [], aiSuggestedEdits: [],
        avgRating: Math.round((3.6 + rand() * 1.4) * 10) / 10, reviewCount: int(0, 120), upvoteCount: int(0, 400), saveCount: int(0, 150), clicks: int(20, 3000),
        status: 'APPROVED', contentReviewed: true, isFeatured: i % 6 === 0, featuredUntil: i % 6 === 0 ? daysAhead(30) : null,
        approvedAt: daysAgo(int(5, 300)), isUrlVerified: true, createdAt: daysAgo(int(5, 300)), updatedAt: new Date(),
      },
    });
  }
  console.log(`  ${TOOLS.length} AI tools in ${TOOL_CATEGORIES.length} categories`);
}

// ── Startups ────────────────────────────────────────────────────────────────────
const STARTUPS: [string, string, string, string, string][] = [
  ['Krishi Mitra AI', 'Crop advice for farmers over WhatsApp', 'AgriTech', 'SEED', 'Pune'],
  ['Nimbus AI Labs', 'Document AI for banks and insurers', 'FinTech', 'SERIES_A', 'Bengaluru'],
  ['Kavach Robotics', 'Warehouse robots that learn on the job', 'Robotics', 'PRE_SERIES_A', 'Chennai'],
  ['ArogyaScan', 'AI radiology reports in minutes', 'HealthTech', 'SERIES_B', 'Hyderabad'],
  ['Vidya Path', 'Personal AI tutor for school students', 'EdTech', 'SEED', 'Delhi'],
  ['LedgerLoop', 'Automated GST reconciliation', 'FinTech', 'PRE_SEED', 'Mumbai'],
  ['UrbanGrid AI', 'Traffic signal optimisation for cities', 'GovTech', 'SERIES_A', 'Bengaluru'],
  ['Bhasha Labs', 'Speech models for 22 Indian languages', 'Deep Tech', 'SERIES_B', 'Bengaluru'],
  ['ShopSense', 'Demand forecasting for kirana stores', 'Retail', 'BOOTSTRAPPED', 'Jaipur'],
  ['CareerCraft AI', 'Interview practice with an AI coach', 'HR Tech', 'IDEA', 'Kochi'],
  ['FleetIQ', 'Route planning for delivery fleets', 'Logistics', 'SEED', 'Gurugram'],
  ['GreenWatt AI', 'Solar output prediction for rooftops', 'CleanTech', 'PRE_SERIES_A', 'Ahmedabad'],
  ['LegalLens', 'Contract review for small businesses', 'LegalTech', 'SEED', 'Delhi'],
  ['PixelPrint', 'AI packaging design for D2C brands', 'D2C', 'BOOTSTRAPPED', 'Indore'],
  ['SafeRoute', 'Women-safety routing and alerts', 'Social Impact', 'PRE_SEED', 'Kolkata'],
];

async function seedStartups(founder: { id: string; email: string }) {
  const ids: Record<string, string> = {};
  for (const [i, [name, tagline, category, stage, city]] of STARTUPS.entries()) {
    const id = randomUUID();
    ids[name] = id;
    await prisma.startup.create({
      data: {
        id, name, slug: `demo-${slugify(name)}`, tagline, category, businessType: 'B2B', headquartersCity: city,
        description: `${name} is building ${tagline.toLowerCase()}. Founded by a team from IITs and leading Indian startups, it serves customers across ${int(3, 20)} states.\n\nThis is dummy data for testing.`,
        websiteUrl: `https://${slugify(name)}.example.com`, foundedYear: int(2018, 2025), stage: stage as never,
        totalFundingInr: BigInt(0), employeeCount: int(4, 400),
        founders: [pick(['Aarav Mehta', 'Priya Iyer', 'Rohan Gupta', 'Sneha Reddy', 'Kabir Shah', 'Ananya Rao', 'Vikram Nair'])],
        impactScore: int(35, 92), isFeatured: i < 3, isApproved: true, contentReviewed: true, approvedAt: daysAgo(int(10, 400)),
        // The first one is owned by the test founder account (claimed and verified), for the founder portal.
        ...(i === 0 ? { claimStatus: 'VERIFIED' as const, claimedAt: daysAgo(30), claimedBy: founder.id, ownerId: founder.id, isVerified: true, verifiedAt: daysAgo(30), contactEmail: founder.email } : {}),
        createdAt: daysAgo(int(10, 400)), updatedAt: new Date(),
      },
    });
  }
  console.log(`  ${STARTUPS.length} startups (1 owned by the test founder)`);
  return ids;
}

async function seedFounder(hash: string) {
  const email = `founder${D}`;
  const f = await prisma.founderUser.create({
    data: {
      id: randomUUID(), email, name: 'Meera Kulkarni', passwordHash: hash, company: 'Krishi Mitra AI', role: 'Co-founder & CEO',
      emailVerified: true, status: 'ACTIVE', onboardingCompleted: true, onboardingStep: 99, twoFactorBackupCodes: [], updatedAt: new Date(),
    },
  });
  return { id: f.id, email };
}

// ── Events ──────────────────────────────────────────────────────────────────────
const FIRST = ['Aarav', 'Diya', 'Ishaan', 'Kavya', 'Arjun', 'Saanvi', 'Vihaan', 'Anika', 'Reyansh', 'Myra', 'Aditya', 'Ira', 'Krishna', 'Tara', 'Rohan', 'Nisha', 'Karan', 'Pooja', 'Siddharth', 'Neha', 'Rahul', 'Sneha', 'Varun', 'Meera', 'Nikhil', 'Riya', 'Aman', 'Zara', 'Dev', 'Lakshmi'];
const LAST = ['Sharma', 'Iyer', 'Reddy', 'Patel', 'Nair', 'Gupta', 'Kulkarni', 'Das', 'Menon', 'Singh', 'Rao', 'Joshi', 'Banerjee', 'Pillai', 'Khan', 'Verma', 'Bose', 'Hegde'];
const person = (i: number) => {
  const first = FIRST[i % FIRST.length];
  const last = LAST[(i * 7) % LAST.length];
  return { name: `${first} ${last}`, email: `${first}.${last}.${i}${D}`.toLowerCase() };
};
const code = (n = 6) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[int(0, 30)]).join('');

async function seedEvents(hash: string, startupId: string) {
  const owner = await prisma.eventOrganizer.create({
    data: {
      email: `organizer${D}`, name: 'Ritika Desai', company: 'Bengaluru AI Collective', passwordHash: hash, emailVerified: true, status: 'ACTIVE',
      onboardingCompleted: true, onboardingStep: 99, plan: 'PRO' as never, planExpiresAt: daysAhead(300), twoFactorBackupCodes: [],
      bio: 'Community events for builders working on AI in India.', website: 'https://collective.example.com',
    },
  });

  // Teammates: each has their own organizer login, plus an active membership in this workspace.
  const team: [string, string, string][] = [['admin', 'Farhan Ali', 'ADMIN'], ['manager', 'Leela Thomas', 'MANAGER'], ['staff', 'Joseph Mathew', 'STAFF'], ['checkin', 'Asha Kumari', 'CHECK_IN']];
  for (const [key, name, role] of team) {
    const email = `organizer-${key}${D}`;
    await prisma.eventOrganizer.create({ data: { email, name, passwordHash: hash, emailVerified: true, status: 'ACTIVE', onboardingCompleted: true, onboardingStep: 99, twoFactorBackupCodes: [] } });
    await prisma.eventTeamMember.create({
      data: { organizerId: owner.id, email, role: role as never, status: 'ACTIVE', inviteToken: randomUUID(), expiresAt: daysAhead(7), acceptedAt: daysAgo(20), passwordHash: hash },
    });
  }

  const EVENTS: [string, string, string, number, number, string, number, boolean][] = [
    // title, category, format, starts in (days), length (hours), status, capacity, paid
    ['Bengaluru GenAI Summit 2026', 'SUMMIT', 'IN_PERSON', 12, 9, 'PUBLISHED', 400, true],
    ['Build with LLMs: Hands-on Workshop', 'WORKSHOP', 'IN_PERSON', 5, 4, 'PUBLISHED', 40, true],
    ['AI for Bharat Hackathon', 'HACKATHON', 'HYBRID', 21, 36, 'PUBLISHED', 200, false],
    ['Founders & Funders Mixer', 'NETWORKING', 'IN_PERSON', 8, 3, 'PUBLISHED', 80, false],
    ['Responsible AI in Healthcare (Webinar)', 'WEBINAR', 'VIRTUAL', 3, 1, 'PUBLISHED', 1000, false],
    ['Demo Day: Spring Cohort', 'DEMO_DAY', 'IN_PERSON', 35, 5, 'PUBLISHED', 150, false],
    ['AI Meetup #41: Agents in Production', 'MEETUP', 'IN_PERSON', -10, 3, 'COMPLETED', 120, false],
    ['Vision AI Conference (draft)', 'CONFERENCE', 'IN_PERSON', 60, 8, 'DRAFT', 300, true],
  ];
  const venues = [['NIMHANS Convention Centre', 'Hosur Road, Bengaluru'], ['91springboard Koramangala', 'Koramangala, Bengaluru'], ['IISc Faculty Hall', 'CV Raman Road, Bengaluru']];
  let regs = 0;
  for (const [i, [title, category, format, startsIn, hours, status, capacity, paid]] of EVENTS.entries()) {
    const startAt = new Date(now + startsIn * DAY);
    startAt.setUTCHours(4, 30, 0, 0); // 10:00 IST
    const virtual = format === 'VIRTUAL';
    const [venueName, address] = pick(venues);
    const event = await prisma.event.create({
      data: {
        slug: `demo-${slugify(title)}`, shortCode: code(), organizerId: owner.id, title, category: category as never, format: format as never, status: status as never,
        subtitle: 'Dummy event for testing', startupId: i === 0 ? startupId : null,
        startAt, endAt: new Date(startAt.getTime() + hours * 3600_000), timezone: 'Asia/Kolkata',
        ...(virtual ? { meetingLink: 'https://meet.example.com/demo-room', revealLinkAfterRegistration: true } : { venueName, address }),
        description: { html: `<p>${title} brings together founders, engineers and researchers building AI in India.</p><p>Talks, demos and plenty of time to meet people. This is dummy data for testing.</p>`, text: `${title} brings together founders, engineers and researchers building AI in India.` },
        capacity, visibility: 'PUBLIC', publishedAt: status === 'DRAFT' ? null : daysAgo(int(5, 30)),
        registrationDeadline: startsIn > 0 ? new Date(startAt.getTime() - DAY) : null,
      },
    });
    if (status === 'DRAFT') continue;
    const tiers = paid
      ? [
          await prisma.eventTicketTier.create({ data: { eventId: event.id, name: 'Early bird', tierType: 'EARLY_BIRD', priceCents: 49900, quantity: 50, saleEnd: daysAgo(1) } }),
          await prisma.eventTicketTier.create({ data: { eventId: event.id, name: 'Regular', tierType: 'REGULAR', priceCents: 99900, quantity: capacity - 60 } }),
          await prisma.eventTicketTier.create({ data: { eventId: event.id, name: 'VIP', tierType: 'VIP', priceCents: 299900, quantity: 10 } }),
        ]
      : [await prisma.eventTicketTier.create({ data: { eventId: event.id, name: 'Free pass', tierType: 'REGULAR', priceCents: 0, quantity: capacity } })];

    const count = Math.min(capacity, status === 'COMPLETED' ? 90 : int(15, 60));
    const sold: Record<string, number> = {};
    for (let r = 0; r < count; r++) {
      const p = person(i * 100 + r);
      const tier = pick(tiers);
      sold[tier.id] = (sold[tier.id] ?? 0) + 1;
      const past = status === 'COMPLETED';
      const roll = rand();
      const regStatus = past ? (roll < 0.75 ? 'CHECKED_IN' : 'CONFIRMED') : roll < 0.08 ? 'CANCELLED' : roll < 0.14 && !paid ? 'WAITLISTED' : 'CONFIRMED';
      await prisma.eventRegistration.create({
        data: {
          eventId: event.id, ticketTierId: tier.id, guestName: p.name, guestEmail: p.email, guestPhone: `+9198${String(10000000 + i * 1000 + r).slice(-8)}`,
          guestCompany: pick(['Infosys', 'Flipkart', 'Zoho', 'Freshworks', 'Swiggy', 'Razorpay', 'Student', 'Independent']), guestRole: pick(['Engineer', 'Founder', 'Product Manager', 'Designer', 'Student', 'Researcher']),
          status: regStatus as never, qrToken: randomUUID(), registrationSource: pick(['direct', 'direct', 'embed', 'share']),
          ...(tier.priceCents > 0 ? { paymentStatus: 'paid', amountPaise: tier.priceCents, paidAt: daysAgo(int(1, 20)) } : {}),
          registeredAt: daysAgo(int(1, 25)), checkedInAt: regStatus === 'CHECKED_IN' ? startAt : null, cancelledAt: regStatus === 'CANCELLED' ? daysAgo(2) : null,
        },
      });
      regs++;
    }
    for (const t of tiers) await prisma.eventTicketTier.update({ where: { id: t.id }, data: { soldCount: sold[t.id] ?? 0 } });
    await prisma.event.update({ where: { id: event.id }, data: { registrationCount: count } });
  }
  console.log(`  1 organizer workspace, 4 teammates, ${EVENTS.length} events, ${regs} registrations`);

  // A new, unverified organizer's first event, waiting in the admin review queue (Events → Review).
  const newbie = await prisma.eventOrganizer.create({
    data: { email: `new-organizer${D}`, name: 'Kiran Rao', company: 'Pune Builders Club', passwordHash: hash, emailVerified: true, status: 'ACTIVE', onboardingCompleted: true, onboardingStep: 99, twoFactorBackupCodes: [], bio: 'We run small build nights for developers in Pune.' },
  });
  const pendingStart = new Date(now + 14 * DAY);
  pendingStart.setUTCHours(12, 30, 0, 0); // 18:00 IST
  const pending = await prisma.event.create({
    data: {
      slug: 'demo-pune-ai-build-night', shortCode: code(), organizerId: newbie.id, title: 'Pune AI Build Night', subtitle: 'Ship a small AI project in one evening',
      category: 'WORKSHOP', format: 'HYBRID', status: 'PENDING_REVIEW', startAt: pendingStart, endAt: new Date(pendingStart.getTime() + 4 * 3600_000), timezone: 'Asia/Kolkata',
      venueName: 'Cowork Hub Baner', address: 'Baner Road, Pune|||https://maps.example.com/cowork-hub', meetingLink: 'https://meet.google.com/abc-defg-hij', revealLinkAfterRegistration: true,
      description: { html: '<p>Bring a laptop and an idea. We pair people up, build for three hours, then demo.</p><h2>Who should come</h2><ul><li>Developers new to LLM APIs</li><li>Designers who want to prototype</li></ul><p>RSVP details on <a href="https://pune-builders.example.com">our site</a>. Dummy event for testing.</p>', text: 'Bring a laptop and an idea. We pair people up, build for three hours, then demo. Who should come: developers new to LLM APIs, designers who want to prototype. Dummy event for testing.' },
      capacity: 60, visibility: 'PUBLIC',
    },
  });
  await prisma.eventTicketTier.create({ data: { eventId: pending.id, name: 'Builder pass', tierType: 'REGULAR', priceCents: 29900, quantity: 50 } });
  await prisma.eventTicketTier.create({ data: { eventId: pending.id, name: 'Student', tierType: 'EARLY_BIRD', priceCents: 0, quantity: 10 } });
  await prisma.eventSpeaker.createMany({ data: [
    { eventId: pending.id, name: 'Kiran Rao', title: 'Organizer', company: 'Pune Builders Club', bio: 'https://www.linkedin.com/in/kiran-rao-demo', sortOrder: 0 },
    { eventId: pending.id, name: 'Neha Joshi', title: 'ML Engineer', company: 'Bhasha Labs', sortOrder: 1 },
  ] });
  await prisma.eventAgendaItem.createMany({ data: [
    { eventId: pending.id, dayNumber: 1, startTime: '18:00', endTime: '18:30', title: 'Intros and team matching', sortOrder: 0 },
    { eventId: pending.id, dayNumber: 1, startTime: '18:30', endTime: '21:15', title: 'Build', sortOrder: 1 },
    { eventId: pending.id, dayNumber: 1, startTime: '21:15', endTime: '22:00', title: 'Demos', sortOrder: 2 },
  ] });
  console.log('  1 event waiting in the admin review queue (new organizer: new-organizer@udyaibase.test)');
}

// ── Hiring ──────────────────────────────────────────────────────────────────────
const SKILLS = ['Python', 'TypeScript', 'React', 'Node.js', 'PyTorch', 'LLMs', 'RAG', 'SQL', 'AWS', 'Docker', 'Kubernetes', 'Figma', 'Go', 'Java', 'Data Analysis', 'Machine Learning', 'NLP', 'Computer Vision'];
const COMPANIES = ['TCS', 'Infosys', 'Wipro', 'Flipkart', 'Swiggy', 'Zomato', 'Razorpay', 'Freshworks', 'Zoho', 'PhonePe', 'CRED', 'Ola', 'Paytm', 'Myntra', 'Startup (stealth)'];
const TITLES = ['Software Engineer', 'Senior Software Engineer', 'Data Scientist', 'ML Engineer', 'Product Designer', 'Backend Developer', 'Frontend Developer', 'Analyst'];
const CITIES = ['Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Chennai', 'Delhi', 'Gurugram', 'Noida', 'Kochi', 'Ahmedabad'];
const STAGES = ['APPLIED', 'APPLIED', 'APPLIED', 'REVIEWED', 'REVIEWED', 'SHORTLISTED', 'SHORTLISTED', 'INTERVIEW', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'REJECTED', 'REJECTED'] as const;
const PATH = ['APPLIED', 'REVIEWED', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED'] as const;
const NOTES = ['Strong system design answers.', 'Good culture fit, a bit junior for this level.', 'Asked for a take-home; submitted on time and clean.', 'Notice period is negotiable to 30 days.', 'Great portfolio. Schedule with the design lead.', 'Salary expectation above band; discuss with founder.'];

const description = (title: string, company: string) => `## About ${company}

${company} builds AI products for Indian businesses. We're a small team that ships every week.

## What you'll do

- Own features end to end, from design to production
- Work closely with customers and the founders
- Help shape how we build as the team grows

## What we're looking for

- Experience relevant to a ${title} role
- Clear written communication
- Curiosity and ownership

This is dummy data for testing.`;

interface JobSpec { title: string; category: string; status: 'OPEN' | 'PAUSED' | 'CLOSED' | 'DRAFT'; workType: string; city: string; skills: string[]; apps: number; positions?: number; expMin?: number; expMax?: number }

async function seedEmployer(opts: { company: string; key: string; startupId: string | null; hash: string; jobs: JobSpec[]; general: number; team: boolean; plan: string }) {
  const ownerEmail = `${opts.key}-owner${D}`;
  const employer = await prisma.jobBoardEmployer.create({
    data: {
      companyName: opts.company, slug: `demo-${slugify(opts.company)}`, email: ownerEmail, passwordHash: opts.hash,
      description: `${opts.company} builds AI products for Indian businesses. This is dummy data for testing.`,
      industry: 'Artificial Intelligence', companySize: '51-200', location: 'Bengaluru, India', country: 'India', websiteUrl: `https://${slugify(opts.company)}.example.com`,
      startupId: opts.startupId, plan: opts.plan as never, planExpiresAt: daysAhead(300), emailVerified: true, isVerified: true, onboardingCompleted: true, onboardingStep: 99,
      twoFactorBackupCodes: [], perks: ['Health insurance', 'Flexible hours', 'Learning budget', 'ESOPs'], techStack: ['Python', 'TypeScript', 'PostgreSQL', 'AWS'],
      tagline: 'Building AI for Bharat', brandColor: '#A50F15', acceptGeneralApplications: true, firstJobPublishedAt: daysAgo(60),
    },
  });
  // Owner row, plus a recruiter and an interviewer limited to the first job.
  await prisma.jobBoardTeamMember.create({ data: { employerId: employer.id, email: ownerEmail, name: 'Owner', role: 'OWNER', status: 'ACTIVE', invitedByEmail: ownerEmail, acceptedAt: daysAgo(60), updatedAt: new Date() } });

  const listingIds: string[] = [];
  let total = 0;
  let personIx = opts.key === 'nimbus' ? 1000 : 5000;
  const make = async (job: JobSpec, isGeneral = false) => {
    const published = job.status !== 'DRAFT';
    const listing = await prisma.jobBoardListing.create({
      data: {
        slug: `demo-${opts.key}-${slugify(job.title)}`, title: job.title, description: description(job.title, opts.company),
        shortDescription: `${job.title} at ${opts.company}`, employerId: employer.id, startupId: opts.startupId, isGeneral,
        category: job.category as never, workType: job.workType as never, city: job.workType === 'REMOTE' ? null : job.city, country: 'India',
        location: job.workType === 'REMOTE' ? 'Remote · India' : `${job.city}, India`, employmentType: 'FULL_TIME',
        salaryCurrency: 'INR', salaryMin: int(8, 20) * 100_000, salaryMax: int(22, 45) * 100_000, showSalary: !isGeneral, hasEsops: true,
        experienceMin: job.expMin ?? null, experienceMax: job.expMax ?? null, skills: job.skills, mustHaveSkills: job.skills.slice(0, 2),
        status: job.status as never, isActive: job.status === 'OPEN', positions: job.positions ?? 1,
        closedAt: job.status === 'CLOSED' ? daysAgo(5) : null, closeReason: job.status === 'CLOSED' && !isGeneral ? 'FILLED' : null,
        publishedAt: published ? daysAgo(int(10, 50)) : null, draftSavedAt: published ? null : daysAgo(1), expiresAt: daysAhead(45),
        showOnCareers: !isGeneral, showOnJobsPage: !isGeneral, showOnProfile: !isGeneral,
        publishedByEmail: published ? ownerEmail : null, viewsCount: published ? int(80, 2500) : 0,
        screeningQuestions: isGeneral ? [] : [{ id: 'q1', question: 'Are you open to working from our Bengaluru office twice a week?', type: 'yesno', required: true }],
      },
    });
    listingIds.push(listing.id);
    for (let a = 0; a < job.apps; a++) {
      const p = person(personIx++);
      const status = isGeneral ? pick(['APPLIED', 'REVIEWED'] as const) : pick(STAGES);
      const appliedAt = daysAgo(int(1, 40));
      const skills = some(SKILLS, int(3, 7));
      const inPool = rand() < 0.45;
      const app = await prisma.jobBoardApplication.create({
        data: {
          listingId: listing.id, fullName: p.name, email: p.email, phone: `+9199${String(10000000 + personIx).slice(-8)}`,
          linkedinUrl: `https://www.linkedin.com/in/${slugify(p.name)}-demo`, githubUrl: rand() > 0.5 ? `https://github.com/${slugify(p.name)}-demo` : null,
          currentCompany: pick(COMPANIES), currentTitle: pick(TITLES), city: pick(CITIES), experienceYears: int(0, 12), noticePeriodDays: pick([0, 15, 30, 60, 90]),
          expectedCtcLakh: int(6, 45), confirmedSkills: skills, matchedSkills: skills.filter((s) => job.skills.includes(s)),
          source: pick(['JOBS_PAGE', 'JOBS_PAGE', 'CAREERS_PAGE', 'WIDGET', 'REFERRAL', 'GOOGLE', 'DIRECT'] as const),
          screeningAnswers: isGeneral ? undefined : [{ id: 'q1', question: 'Are you open to working from our Bengaluru office twice a week?', answer: rand() > 0.2 ? 'Yes' : 'No' }],
          coverLetter: rand() > 0.6 ? 'I have followed your work for a while and would love to help build this. (dummy data)' : null,
          consentAt: appliedAt, consentText: 'Dummy consent for testing.', status,
          appliedAt, reviewedAt: status === 'APPLIED' ? null : new Date(appliedAt.getTime() + DAY), statusChangedAt: status === 'APPLIED' ? null : new Date(appliedAt.getTime() + 2 * DAY),
          firstResponseAt: ['APPLIED', 'REVIEWED'].includes(status) ? null : new Date(appliedAt.getTime() + 2 * DAY),
          // Talent pool: about half opted in; a few end within 30 days (to test the "ending soon" filter).
          talentPoolUntil: inPool ? (rand() < 0.15 ? daysAhead(int(3, 25)) : daysAhead(int(200, 360))) : null,
          talentTags: inPool && rand() < 0.3 ? some(['backend', 'frontend', 'ml', 'next-quarter', 'strong-referral'], int(1, 2)) : [],
        },
      });
      // Stage history, so the timeline and "Interviewed, not selected" labels have something to show.
      const target = status === 'REJECTED' ? pick(['REVIEWED', 'SHORTLISTED', 'INTERVIEW'] as const) : status;
      const steps = PATH.slice(1, PATH.indexOf(target as (typeof PATH)[number]) + 1);
      let from: string = 'APPLIED';
      for (const [s, to] of steps.entries()) {
        await prisma.jobBoardApplicationEvent.create({ data: { applicationId: app.id, fromStatus: from as never, toStatus: to as never, actorEmail: ownerEmail, createdAt: new Date(appliedAt.getTime() + (s + 1) * DAY) } });
        from = to;
      }
      if (status === 'REJECTED') {
        await prisma.jobBoardApplicationEvent.create({ data: { applicationId: app.id, fromStatus: from as never, toStatus: 'REJECTED', actorEmail: ownerEmail, createdAt: new Date(appliedAt.getTime() + (steps.length + 1) * DAY) } });
      }
      if (!['APPLIED', 'REVIEWED'].includes(status) && rand() < 0.5) {
        await prisma.jobBoardApplicationNote.create({ data: { applicationId: app.id, authorEmail: ownerEmail, authorName: 'Owner', body: pick(NOTES), createdAt: new Date(appliedAt.getTime() + 2 * DAY) } });
      }
      total++;
    }
    await prisma.jobBoardListing.update({ where: { id: listing.id }, data: { applicationsCount: job.apps } });
  };

  for (const job of opts.jobs) await make(job);
  if (opts.general) await make({ title: 'General applications', category: 'OTHER', status: 'CLOSED', workType: 'ONSITE', city: 'Bengaluru', skills: [], apps: opts.general }, true);

  // A few people applied to two roles (for "Also applied to").
  const [a, b] = listingIds;
  if (a && b) {
    const twins = await prisma.jobBoardApplication.findMany({ where: { listingId: a }, take: 3, select: { fullName: true, email: true } });
    for (const t of twins) {
      await prisma.jobBoardApplication.create({ data: { listingId: b, fullName: t.fullName, email: t.email, status: 'APPLIED', confirmedSkills: some(SKILLS, 4), consentAt: daysAgo(2), consentText: 'Dummy consent for testing.', appliedAt: daysAgo(2) } });
      total++;
    }
  }

  if (opts.team) {
    await prisma.jobBoardTeamMember.create({ data: { employerId: employer.id, email: `${opts.key}-recruiter${D}`, name: 'Rakesh Pillai', role: 'RECRUITER', status: 'ACTIVE', invitedByEmail: ownerEmail, acceptedAt: daysAgo(30), updatedAt: new Date() } });
    await prisma.jobBoardTeamMember.create({ data: { employerId: employer.id, email: `${opts.key}-interviewer${D}`, name: 'Divya Menon', role: 'INTERVIEWER', jobIds: [listingIds[0]], status: 'ACTIVE', invitedByEmail: ownerEmail, acceptedAt: daysAgo(30), updatedAt: new Date() } });
  }
  console.log(`  ${opts.company}: ${opts.jobs.length} jobs${opts.general ? ' + general applications' : ''}, ${total} candidates${opts.team ? ', recruiter + interviewer' : ''}`);
}


// ── Funding rounds and investors ────────────────────────────────────────────────
const USD_INR = 84;
const INVESTORS: [string, 'VC' | 'ANGEL' | 'CORPORATE' | 'GOVERNMENT', string[]][] = [
  ['Peak Peninsula Ventures', 'VC', ['SaaS', 'AI', 'FinTech']], ['Blume Basin Capital', 'VC', ['Deep Tech', 'AI']],
  ['Accel Arc Partners', 'VC', ['SaaS', 'Consumer']], ['Kalaari Coast Capital', 'VC', ['HealthTech', 'EdTech']],
  ['Chiratae Crest', 'VC', ['AgriTech', 'Consumer']], ['Stellar Seed Fund', 'VC', ['Early stage', 'AI']],
  ['Indian Angel Circle', 'ANGEL', ['Pre-seed', 'Seed']], ['Mumbai Angels Collective', 'ANGEL', ['Seed']],
  ['Tata Digital Ventures (demo)', 'CORPORATE', ['Retail', 'FinTech']], ['SIDBI Startup Fund (demo)', 'GOVERNMENT', ['Fund of funds']],
];
/** Rounds per stage: [round type, USD in millions (min, max), months ago (min, max)] from earliest to latest. */
const LADDER: Record<string, [string, number, number, number, number][]> = {
  IDEA: [],
  BOOTSTRAPPED: [],
  PRE_SEED: [['PRE_SEED', 0.2, 0.6, 3, 10]],
  SEED: [['PRE_SEED', 0.3, 0.6, 20, 30], ['SEED', 1, 3, 2, 12]],
  PRE_SERIES_A: [['SEED', 1, 2.5, 18, 30], ['PRE_SERIES_A', 3, 6, 1, 8]],
  SERIES_A: [['SEED', 1.5, 3, 30, 40], ['SERIES_A', 8, 15, 2, 12]],
  SERIES_B: [['SEED', 2, 4, 40, 54], ['SERIES_A', 10, 18, 20, 30], ['SERIES_B', 30, 60, 1, 10]],
};

async function seedFunding(startupIds: Record<string, string>) {
  const names = INVESTORS.map(([n]) => n);
  for (const [name, type, focusAreas] of INVESTORS) {
    await prisma.investor.create({
      data: {
        id: randomUUID(), name, slug: `demo-${slugify(name)}`, type, focusAreas, notableInvestments: some(Object.keys(startupIds), 3),
        description: `${name} backs Indian founders building with AI. Dummy investor for testing.`, websiteUrl: `https://${slugify(name)}.example.com`,
        totalDealsIndia: int(8, 140), updatedAt: new Date(),
      },
    });
  }
  let rounds = 0;
  for (const [name, , , stage] of STARTUPS) {
    let total = 0n;
    for (const [roundType, minM, maxM, minAgo, maxAgo] of LADDER[stage] ?? []) {
      const usdM = Math.round((minM + rand() * (maxM - minM)) * 10) / 10;
      const cents = BigInt(Math.round(usdM * 1_000_000 * 100));
      const paise = cents * BigInt(USD_INR);
      const leads = some(names, roundType === 'PRE_SEED' ? 1 : int(1, 2));
      await prisma.fundingRound.create({
        data: {
          id: randomUUID(), startupId: startupIds[name], roundType, amountUsd: cents, amountInr: paise, fxDerived: 'INR', fxUsdInr: USD_INR,
          announcedAt: new Date(now - int(minAgo, maxAgo) * 30 * DAY), leadInvestors: leads,
          allInvestors: Array.from(new Set([...leads, ...some(names, int(0, 3))])),
          valuation: roundType.startsWith('SERIES') ? paise * BigInt(int(5, 9)) : null,
          sourceUrl: 'https://news.example.com/funding-dummy',
        },
      });
      total += paise;
      rounds++;
    }
    await prisma.startup.update({ where: { id: startupIds[name] }, data: { totalFundingInr: total } });
  }
  console.log(`  ${rounds} funding rounds across ${STARTUPS.length} startups, ${INVESTORS.length} investors`);
}

// ── Stories (editorial and founder stories) ─────────────────────────────────────
const para = (t: string) => `<p>${t}</p>`;
const storyHtml = (lead: string, sections: [string, string][]) =>
  para(lead) + sections.map(([h, t]) => `<h2>${h}</h2>${para(t)}`).join('') + para('<em>This is dummy content for testing.</em>');

const FOUNDER_STORIES: [string, string, string, [string, string][]][] = [
  ['How we got our first 1,000 farmers on WhatsApp', 'Krishi Mitra AI', 'We started with one village near Pune and a phone number. Here is what worked, and what we would never do again.',
    [['Start where people already are', 'Farmers did not want another app. They already used WhatsApp every day, so we built the whole product as a chat.'],
     ['Trust beats features', 'Our first 100 users came from one agronomist who vouched for us at the local mandi. Referrals still bring 60% of new users.'],
     ['What we would do differently', 'We spent three months on a dashboard nobody opened. Talk to users before you build anything with a login screen.']]],
  ['Selling document AI to banks without a sales team', 'Nimbus AI Labs', 'Banks are slow buyers. We closed our first three with a pilot that paid for itself in 30 days.',
    [['Pick one painful workflow', 'We only automated KYC document checks at first. One workflow, one metric: hours saved per week.'],
     ['Make security the first meeting', 'We brought our security answers to the first call. It cut two months off every deal.'],
     ['Hiring our first salesperson', 'We waited until the founders had closed ten deals and written down exactly how.']]],
  ['Building robots in Chennai on a seed budget', 'Kavach Robotics', 'Hardware is hard, and harder when every part ships from abroad. We redesigned around what we could source in Tamil Nadu.',
    [['Local suppliers first', 'Half our parts now come from within 200 km, which cut lead times from eight weeks to ten days.'],
     ['Software sells the hardware', 'Customers bought the fleet dashboard first. The robots followed.'],
     ['Our biggest mistake', 'We built a custom gripper too early. An off-the-shelf one handled 90% of cases.']]],
  ['From radiologist to founder: why I left the hospital', 'ArogyaScan', 'I read 120 scans a day and still had a backlog. That backlog is why ArogyaScan exists.',
    [['The problem up close', 'Tier-2 hospitals often have one radiologist for the whole district. Reports wait days.'],
     ['Getting clinical validation', 'We ran a 9-month study across four hospitals before selling to anyone.'],
     ['Advice for doctor-founders', 'Find a technical co-founder who respects clinical workflow as much as model accuracy.']]],
  ['Teaching 50,000 students in their own language', 'Vidya Path', 'Our tutor speaks Hindi, Marathi and Tamil. Usage tripled the week we added voice.',
    [['Language is the product', 'Students asked more questions, and better ones, when they could ask in their first language.'],
     ['Parents are the real customers', 'A weekly WhatsApp summary to parents turned free users into paying ones.'],
     ['Keeping costs low', 'We cache common explanations and only call the large model for new questions.']]],
  ['Bootstrapping to profit with kirana stores', 'ShopSense', 'No funding, ten people, profitable in 18 months. Here are the numbers.',
    [['Charge from day one', 'A ₹299 monthly plan filtered out people who were only curious.'],
     ['Field sales on scooters', 'Our team visits stores in person. Demos in the shop convert five times better than calls.'],
     ['Why we have not raised', 'We will raise when money speeds up something that already works, not before.']]],
];

const NEWS: [string, string][] = [
  ['India AI Mission opens new GPU access for startups', 'The programme adds subsidised compute for early-stage teams, with applications open until the end of the quarter.'],
  ['Five Indian AI startups to watch this quarter', 'From farm advisory to radiology, these teams are shipping fast and finding paying customers.'],
  ['What the new data protection rules mean for AI products', 'Consent, retention and deletion: a plain-language guide for founders building on personal data.'],
  ['Bengaluru still leads AI hiring, but Pune and Hyderabad are catching up', 'Job postings for AI roles grew fastest outside Bengaluru this year.'],
];

async function seedStories(founder: { id: string }, startupIds: Record<string, string>) {
  const editor = await prisma.user.create({
    data: { id: randomUUID(), email: `editor${D}`, name: 'Udyaibase Desk (demo)', slug: 'demo-udyaibase-desk', role: 'WRITER', twoFactorBackupCodes: [], updatedAt: new Date() },
  });
  const cat = async (name: string) => (await prisma.category.create({ data: { id: randomUUID(), name, slug: `demo-${slugify(name)}`, updatedAt: new Date() } })).id;
  const founderCat = await cat('Founder Journeys');
  const newsCat = await cat('Ecosystem News');

  const create = async (title: string, excerpt: string, html: string, type: 'FOUNDER_STORY' | 'STORY', categoryId: string, extra: Record<string, unknown>, daysOld: number) => {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = text.split(' ').length;
    await prisma.article.create({
      data: {
        id: randomUUID(), title, slug: `demo-${slugify(title)}`.slice(0, 90), excerpt, content: { html }, contentText: text, type, status: 'PUBLISHED',
        authorId: editor.id, categoryId, readTimeMinutes: Math.max(2, Math.round(words / 200)), wordCount: words,
        viewCount: int(120, 9000), shareCount: int(0, 300), likeCount: int(0, 400), publishedAt: daysAgo(daysOld), createdAt: daysAgo(daysOld), updatedAt: new Date(),
        keyTakeaways: ['Start with one painful problem', 'Talk to users every week', 'Charge early'], ...extra,
      },
    });
  };

  for (const [i, [title, company, lead, sections]] of FOUNDER_STORIES.entries()) {
    await create(title, lead, storyHtml(lead, sections), 'FOUNDER_STORY', founderCat, {
      startupId: startupIds[company] ?? null, isFeatured: i < 2,
      // The first one is written by the test founder account (shows in their founder portal content list).
      ...(i === 0 ? { founderAuthorId: founder.id, submittedById: founder.id, moderationStatus: 'APPROVED' } : {}),
    }, 3 + i * 6);
  }
  for (const [i, [title, lead]] of NEWS.entries()) {
    await create(title, lead, storyHtml(lead, [['Why it matters', 'Founders should plan for this in the next two quarters.'], ['What to do now', 'Review your roadmap and talk to your investors and customers.']]), 'STORY', newsCat, { isFeatured: i === 0 }, 1 + i * 4);
  }
  console.log(`  ${FOUNDER_STORIES.length} founder stories and ${NEWS.length} news stories`);
}


// ── Reference data (not dummy: the same lists production is built from) ────────
/**
 * A schema-only database branch has no reference rows at all. The India AI map only places startups in cities it
 * knows (IndiaAICity, with coordinates), and onboarding searches the City table, so both are loaded from the
 * shared city list. Kept between runs.
 */
async function seedReferenceData() {
  const rows = CITY_DATABASE.filter((c) => c.country === 'India' && c.lat && c.lng).map((c, i) => ({
    cityName: c.city, slug: slugify(c.city), state: c.state ?? null, latitude: c.lat!, longitude: c.lng!, aliases: c.aliases ?? [],
    topSectors: [], keyAccelerators: [], notableCompanies: [], isActive: true, displayOrder: 100 + i,
  }));
  const seen = new Set<string>();
  const unique = rows.filter((r) => !seen.has(r.slug) && !seen.has(r.cityName.toLowerCase()) && seen.add(r.slug) && seen.add(r.cityName.toLowerCase()));
  const res = await prisma.indiaAICity.createMany({ data: unique, skipDuplicates: true });
  const total = await prisma.indiaAICity.count();
  console.log(`  ${total} Indian cities for the map (${res.count} new)`);

  // Cities people pick in onboarding (City table): every country in the shared list, India first in search.
  const slugs = new Set<string>();
  const cityRows = CITY_DATABASE.flatMap((c) => {
    const slug = c.country === 'India' ? slugify(c.city) : slugify(`${c.city}-${c.country}`);
    if (slugs.has(slug)) return [];
    slugs.add(slug);
    return [{ slug, name: c.city, state: c.state ?? null, country: c.country, latitude: c.lat ?? null, longitude: c.lng ?? null, aliases: (c.aliases ?? []).map((a) => a.toLowerCase()) }];
  });
  const added = await prisma.city.createMany({ data: cityRows, skipDuplicates: true });
  console.log(`  ${await prisma.city.count()} cities for onboarding and profiles (${added.count} new)`);
}


// ── Admin access (local) ────────────────────────────────────────────────────────
/**
 * The admin app signs in with Google only, then requires the email to be an active staff member (User table).
 * Pass your own Google address to get Super Admin on the dev database:
 *   SEED_ADMIN_EMAIL=you@gmail.com NODE_ENV=test npx tsx --env-file=.env seed-dev.ts --admin-only
 * The address is never written into the code, and this account is kept when the dummy data is re-created.
 */
async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!email) {
    console.log('  (no SEED_ADMIN_EMAIL given: skipped admin access; see docs/development/TEST_ACCOUNTS.md)');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('SEED_ADMIN_EMAIL is not an email address.');
  const name = email.split('@')[0];
  await prisma.user.upsert({
    where: { email },
    update: { role: 'SUPER_ADMIN', isActive: true, failedLoginAttempts: 0, lockedUntil: null, deletedAt: null },
    create: { id: randomUUID(), email, name, slug: `admin-${slugify(name)}-${randomUUID().slice(0, 6)}`, role: 'SUPER_ADMIN', isActive: true, twoFactorBackupCodes: [], updatedAt: new Date() },
  });
  console.log('  Super Admin access for the admin app (http://localhost:3001) for the email you gave');
}

async function main() {
  guard();
  // --admin-only: just grant admin access, leaving the dummy data as it is.
  if (process.argv.includes('--admin-only')) {
    await seedAdmin();
    return;
  }
  console.log('Removing earlier dummy data...');
  await cleanup();
  const hash = await bcrypt.hash(PASSWORD, 10);
  console.log('Reference data:');
  await seedReferenceData();
  await seedAdmin();
  console.log('Creating dummy data:');
  await seedTools();
  const founder = await seedFounder(hash);
  const startups = await seedStartups(founder);
  await seedFunding(startups);
  await seedStories(founder, startups);
  await seedEvents(hash, startups['Krishi Mitra AI']);
  await seedEmployer({
    company: 'Nimbus AI Labs', key: 'nimbus', startupId: startups['Nimbus AI Labs'], hash, plan: 'PRO', team: true, general: 6,
    jobs: [
      { title: 'Senior ML Engineer', category: 'ML_ENGINEER', status: 'OPEN', workType: 'HYBRID', city: 'Bengaluru', skills: ['Python', 'PyTorch', 'LLMs', 'RAG', 'AWS'], apps: 34, expMin: 4, expMax: 8 },
      { title: 'Full Stack Engineer', category: 'FULL_STACK_ENGINEER', status: 'OPEN', workType: 'REMOTE', city: 'Bengaluru', skills: ['TypeScript', 'React', 'Node.js', 'SQL'], apps: 28, positions: 3, expMin: 2, expMax: 6 },
      { title: 'Product Designer', category: 'AI_DESIGNER', status: 'OPEN', workType: 'ONSITE', city: 'Bengaluru', skills: ['Figma', 'Data Analysis'], apps: 16 },
      { title: 'Data Analyst Intern', category: 'DATA_ANALYST', status: 'PAUSED', workType: 'HYBRID', city: 'Pune', skills: ['SQL', 'Python', 'Data Analysis'], apps: 12, positions: 5 },
      { title: 'DevOps Engineer', category: 'DEVOPS_ENGINEER', status: 'CLOSED', workType: 'ONSITE', city: 'Bengaluru', skills: ['Docker', 'Kubernetes', 'AWS'], apps: 9 },
      { title: 'AI Product Manager', category: 'AI_PRODUCT_MANAGER', status: 'DRAFT', workType: 'HYBRID', city: 'Bengaluru', skills: ['LLMs', 'Data Analysis'], apps: 0 },
    ],
  });
  await seedEmployer({
    company: 'Kavach Robotics', key: 'kavach', startupId: startups['Kavach Robotics'], hash, plan: 'FREE', team: false, general: 0,
    jobs: [
      { title: 'Robotics Engineer', category: 'ROBOTICS_ENGINEER', status: 'OPEN', workType: 'ONSITE', city: 'Chennai', skills: ['Python', 'Computer Vision', 'Machine Learning'], apps: 11 },
      { title: 'Computer Vision Engineer', category: 'COMPUTER_VISION', status: 'OPEN', workType: 'HYBRID', city: 'Chennai', skills: ['Python', 'PyTorch', 'Computer Vision'], apps: 7 },
    ],
  });
  console.log(`\nDone. Sign-ins: docs/development/TEST_ACCOUNTS.md (password for every account: ${PASSWORD})`);
}

main()
  .catch((err) => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
