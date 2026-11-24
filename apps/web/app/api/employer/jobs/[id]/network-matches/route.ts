import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { publicListingWhere } from '@/lib/jobs/public';
import { employerApi } from '@/lib/employer/api-session';
import { networkAccess, searchNetwork } from '@/lib/network/intros';
import { networkFit } from '@/lib/network/rules';

export const dynamic = 'force-dynamic';

/**
 * "Open to opportunities" people ranked by fit for one open job, for the Add candidates dialog. Pilot companies only;
 * cards are anonymous, exactly as on the Discover page. `pilot: false` tells the dialog to hide the tab.
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const guard = await employerApi('candidates.move');
  if (guard.error) return guard.error;
  const session = guard.session;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (session.jobIds) return NextResponse.json({ pilot: false }, { headers });
  const access = await networkAccess(session.id);
  if (access.reason === 'not_in_pilot') return NextResponse.json({ pilot: false }, { headers });

  const job = await prisma.jobBoardListing.findFirst({
    where: { id, employerId: session.id, isGeneral: false, applicationType: { not: 'EXTERNAL' }, ...publicListingWhere() },
    select: { skills: true, mustHaveSkills: true, experienceMin: true, experienceMax: true },
  });
  if (!job) return NextResponse.json({ pilot: true, jobOpen: false, access, people: [] }, { headers });

  const people = (await searchNetwork(session.id))
    .map((p) => ({ ...p, score: networkFit(p, job) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);
  return NextResponse.json({ pilot: true, jobOpen: true, access, people }, { headers });
}
