import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { writeLimited } from '@/lib/employer/write-limit';
import { cleanCin } from '@/lib/employer/company-check';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/** Details that speed up our company check: the LinkedIn page and the MCA number (both optional). */
export async function PATCH(request: NextRequest) {
  const limited = await writeLimited(request, 'company-check');
  if (limited) return limited;
  const guard = await employerApi('jobs.manage');
  if (guard.error) return guard.error;
  const session = guard.session;
  const b = await request.json().catch(() => ({}));
  const cin = cleanCin(b.cin);
  if (cin === 'invalid') return NextResponse.json({ error: 'That doesn’t look like a CIN (21 characters) or LLPIN (like AAB-1234).', field: 'cin' }, { status: 400 });
  const linkedin = typeof b.linkedinUrl === 'string' ? b.linkedinUrl.trim() : '';
  if (linkedin && !/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/company\/[^\s/?#]+\/?$/i.test(linkedin)) {
    return NextResponse.json({ error: 'Paste your company’s LinkedIn page, like https://www.linkedin.com/company/acme.', field: 'linkedinUrl' }, { status: 400 });
  }
  await prisma.jobBoardEmployer.update({ where: { id: session.id }, data: { companyCin: cin, ...(linkedin ? { linkedinUrl: linkedin } : {}) } });
  return NextResponse.json({ success: true });
}
