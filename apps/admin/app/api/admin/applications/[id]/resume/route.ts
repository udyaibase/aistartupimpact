import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireApiAuth } from '@/lib/api-auth';
import { careersResumeKey, readCareersResume } from '@/lib/careers-resume';

export const dynamic = 'force-dynamic';

/** Download an applicant's resume from private storage. Signed-in staff only. */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { error } = await requireApiAuth(['SUPER_ADMIN', 'EDITOR_IN_CHIEF']); // same roles as the Applications page
  if (error) return error;

  const { id } = await props.params;
  const app = await prisma.jobApplication.findUnique({ where: { id }, select: { resumeUrl: true, resumeLink: true, resumeFileName: true } });
  const key = careersResumeKey(app?.resumeUrl) ?? careersResumeKey(app?.resumeLink);
  if (!app || !key) return NextResponse.json({ error: 'Resume not found' }, { status: 404 });

  try {
    const file = await readCareersResume(key);
    const name = (app.resumeFileName || 'resume.pdf').replace(/[^\w.\- ]/g, '_');
    return new NextResponse(file as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[applications] resume read', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not load the resume' }, { status: 502 });
  }
}
