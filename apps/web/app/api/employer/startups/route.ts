import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { websiteDomain } from '@/lib/jobs/trust';
import { employerSubmitter } from '@/lib/startups/ownership';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

/**
 * Adds a startup that isn't on Udyaibase yet, so an employer can verify it and post jobs right away.
 * The public startup profile waits for admin approval, like founder submissions.
 * If a startup with the same website already exists, that one is returned to claim instead.
 */
export async function POST(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'company.manage')) return forbidden();
  const { success } = await checkRateLimit(apiRateLimit, `employer-startup:${session.id}`);
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? '').trim().slice(0, 80);
  const tagline = String(body.tagline ?? '').trim().slice(0, 160);
  const rawWebsite = String(body.websiteUrl ?? '').trim().slice(0, 300);
  const domain = websiteDomain(rawWebsite);

  if (name.length < 2) return NextResponse.json({ error: 'Enter your startup’s name.', field: 'name' }, { status: 400 });
  if (!domain || !domain.includes('.')) return NextResponse.json({ error: 'Enter your company website, like acme.ai.', field: 'websiteUrl' }, { status: 400 });

  // Same website already listed? Claim that profile instead of creating a duplicate.
  const candidates = await prisma.startup.findMany({
    where: { deletedAt: null, websiteUrl: { contains: domain, mode: 'insensitive' } },
    select: { id: true, name: true, logoUrl: true, websiteUrl: true, headquartersCity: true, stage: true },
    take: 10,
  });
  const match = candidates.find((s) => websiteDomain(s.websiteUrl) === domain);
  if (match) return NextResponse.json({ success: true, existing: true, startup: match });

  const pending = await prisma.startup.count({ where: { submittedBy: employerSubmitter(session.id), isApproved: false, deletedAt: null } });
  if (pending >= 2) return NextResponse.json({ error: 'You already added a startup that’s waiting for review. Verify that one, or contact support.' }, { status: 403 });

  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'startup';
  const taken = await prisma.startup.findUnique({ where: { slug: base }, select: { id: true } });
  const startup = await prisma.startup.create({
    data: {
      id: randomUUID(),
      name,
      slug: taken ? `${base}-${randomUUID().slice(0, 6)}` : base,
      tagline: tagline || `${name} is hiring on Udyaibase`,
      description: tagline || `${name} is hiring on Udyaibase.`,
      websiteUrl: `https://${domain}`,
      claimStatus: 'PENDING',
      submittedBy: employerSubmitter(session.id),
      updatedAt: new Date(),
    },
    select: { id: true, name: true, logoUrl: true, websiteUrl: true, headquartersCity: true, stage: true },
  });
  return NextResponse.json({ success: true, existing: false, startup }, { status: 201 });
}
