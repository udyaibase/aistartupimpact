import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { ensureCareersWidget, JobsWidgetInputError, parseJobsWidgetInput, syncCareersCsp, toJobsPortalWidget } from '@/lib/jobs/careers';
import { can, forbidden } from '@/lib/employer/permissions';
import { parseApplyFormConfig, type ApplyFormConfig } from '@/lib/jobs/apply-form';
import type { Prisma } from '@prisma/client';
import { writeLimited } from '@/lib/employer/write-limit';

export const dynamic = 'force-dynamic';

const unauthorized = () => NextResponse.json({ success: false, error: 'Please log in again.' }, { status: 401 });

/** The employer's careers widget (polled by the portal for install detection). */
export async function GET() {
  const session = await getEmployerSession();
  if (!session) return unauthorized();
  if (!can(session.role, 'widget.manage')) return forbidden();
  const widget = await ensureCareersWidget(session.id);
  return NextResponse.json({ success: true, data: toJobsPortalWidget(widget) });
}

/** Autosaved changes from the customize panel. */
export async function PUT(request: NextRequest) {
  const limited = await writeLimited(request, 'careers/widget');
  if (limited) return limited;
  const session = await getEmployerSession();
  if (!session) return unauthorized();
  if (!can(session.role, 'widget.manage')) return forbidden();
  const widget = await ensureCareersWidget(session.id);
  const body = await request.json().catch(() => ({}));

  // The application form belongs to the workspace, since it also runs on the Udyaibase job page.
  let applyForm: ApplyFormConfig | undefined;
  if ('applyForm' in body) {
    applyForm = parseApplyFormConfig(body.applyForm);
    await prisma.jobBoardEmployer.update({ where: { id: session.id }, data: { applyFormConfig: applyForm as unknown as Prisma.InputJsonValue } });
  }

  let data: Record<string, unknown>;
  try {
    data = parseJobsWidgetInput(body);
  } catch (err) {
    const msg = err instanceof JobsWidgetInputError ? err.message : 'Invalid settings.';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }

  const updated = await prisma.jobBoardCareersWidget.update({ where: { id: widget.id }, data });
  await syncCareersCsp(updated);
  revalidatePath(`/embed/jobs/${updated.id}`);
  return NextResponse.json({ success: true, data: toJobsPortalWidget(updated, applyForm) });
}
