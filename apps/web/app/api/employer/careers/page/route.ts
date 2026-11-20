import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { prisma } from '@udyaibase/database';
import { writeLimited } from '@/lib/employer/write-limit';
import { careersSettingsOf, ensureGeneralListing, getCareersCompany, JobsWidgetInputError, parseCareersSettingsInput } from '@/lib/jobs/careers';
import { refreshPaths } from '@/lib/revalidate';
import { employerActor, logEmployerActivity } from '@/lib/workspace-activity';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/** Autosaved changes from the Careers page editor (template, brand colour, sections, general applications). Owners only. */
export async function PUT(request: NextRequest) {
  const limited = await writeLimited(request, 'careers/page');
  if (limited) return limited;
  const guard = await employerApi('company.manage');
  if (guard.error) return guard.error;
  const session = guard.session;

  const body = await request.json().catch(() => ({}));
  let data: Record<string, unknown>;
  try {
    data = parseCareersSettingsInput(body);
  } catch (err) {
    const msg = err instanceof JobsWidgetInputError ? err.message : 'Invalid settings.';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ success: false, error: 'Nothing to save.' }, { status: 400 });

  const before = await prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { careersContent: true, acceptGeneralApplications: true } });
  if (data.acceptGeneralApplications === true) await ensureGeneralListing(session.id);
  const saved = await prisma.jobBoardEmployer.update({
    where: { id: session.id },
    data: data as Prisma.JobBoardEmployerUpdateInput,
    select: { slug: true, CareersWidgets: { select: { id: true } } },
  });

  // The careers page, and the widget (it shows "Apply generally" when no roles are open).
  refreshPaths([`/jobs/company/${saved.slug}`]);
  for (const w of saved.CareersWidgets) revalidatePath(`/embed/jobs/${w.id}`);

  // Autosave runs as people type, so only log the choices worth seeing later.
  const tpl = (c: unknown) => (c && typeof c === 'object' ? (c as { template?: string }).template : undefined);
  const content = data.careersContent as { template?: string } | undefined;
  if (content && tpl(before?.careersContent) !== content.template) {
    await logEmployerActivity(session.id, 'profile_updated', { actor: employerActor(session), request, metadata: { what: `careers page template (${content.template})` } });
  }
  if (typeof data.acceptGeneralApplications === 'boolean' && data.acceptGeneralApplications !== before?.acceptGeneralApplications) {
    await logEmployerActivity(session.id, 'profile_updated', {
      actor: employerActor(session), request, metadata: { what: data.acceptGeneralApplications ? 'general applications (turned on)' : 'general applications (turned off)' },
    });
  }

  return NextResponse.json({ success: true, data: careersSettingsOf(await getCareersCompany({ id: session.id })) });
}
