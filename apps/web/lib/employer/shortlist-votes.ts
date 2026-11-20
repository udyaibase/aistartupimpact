import { prisma } from '@udyaibase/database';

export type Vote = 'YES' | 'MAYBE' | 'NO';

/** For the hiring team's side panel: what each shared link said about this candidate. */
export async function votesFor(applicationId: string) {
  const rows = await prisma.jobBoardShortlistVote.findMany({
    where: { applicationId },
    orderBy: { updatedAt: 'desc' },
    select: { vote: true, comment: true, updatedAt: true, Share: { select: { sharedWithName: true } } },
  });
  return rows.map((r) => ({ name: r.Share.sharedWithName, vote: r.vote as Vote, comment: r.comment, at: r.updatedAt.toISOString() }));
}
