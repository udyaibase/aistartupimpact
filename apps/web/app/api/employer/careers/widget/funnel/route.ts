import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { getPlatform } from '@/lib/embed/platforms';
import { ensureCareersWidget, toJobsPortalWidget } from '@/lib/jobs/careers';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

const STEPS = ['setup_started', 'platform_selected', 'code_copied', 'marked_installed'] as const;
type Step = (typeof STEPS)[number];

/** Setup-funnel milestones for the careers widget; first occurrence wins. */
export async function POST(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ success: false, error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'widget.manage')) return forbidden();
  const body = await request.json().catch(() => ({}));
  const step = body.step as Step;
  if (!STEPS.includes(step)) return NextResponse.json({ success: false, error: 'Unknown step.' }, { status: 400 });

  const widget = await ensureCareersWidget(session.id);
  const now = new Date();
  const data: Record<string, unknown> = {};
  if (step === 'setup_started' && !widget.setupStartedAt) data.setupStartedAt = now;
  if (step === 'platform_selected') {
    const platform = getPlatform(body.platform);
    if (!platform) return NextResponse.json({ success: false, error: 'Unknown platform.' }, { status: 400 });
    data.platform = platform.id;
  }
  if (step === 'code_copied' && !widget.codeCopiedAt) data.codeCopiedAt = now;
  if (step === 'marked_installed') data.markedInstalledAt = now;

  const updated = Object.keys(data).length ? await prisma.jobBoardCareersWidget.update({ where: { id: widget.id }, data }) : widget;
  return NextResponse.json({ success: true, data: toJobsPortalWidget(updated) });
}
