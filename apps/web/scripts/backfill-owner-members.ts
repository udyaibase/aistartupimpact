/**
 * One-time backfill: give every hiring workspace's account owner an OWNER team-member row (see lib/employer/owners.ts).
 * Dry run by default: prints what it would do and changes nothing. Add --apply to write. Safe to re-run.
 * Run from apps/web: npx dotenv-cli -e ../../.env -- npx tsx --tsconfig tsconfig.json scripts/backfill-owner-members.ts [--apply]
 */
import { prisma } from '@udyaibase/database';
import { ensureOwnerMember, isRealInbox } from '../lib/employer/owners';

const mask = (email: string) => email.replace(/^(.).*?(@.*)$/, '$1***$2');

(async () => {
  const apply = process.argv.includes('--apply');
  const workspaces = await prisma.jobBoardEmployer.findMany({
    where: { deletedAt: null },
    select: { id: true, companyName: true, email: true, passwordHash: true },
    orderBy: { createdAt: 'asc' },
  });
  const rows = await prisma.jobBoardTeamMember.findMany({
    where: { employerId: { in: workspaces.map((w) => w.id) } },
    select: { employerId: true, email: true, role: true, status: true },
  });

  const plan = { create: 0, upgrade: 0, ok: 0, skip: 0 };
  for (const w of workspaces) {
    const email = w.email.toLowerCase();
    if (w.passwordHash === '' || !isRealInbox(email)) {
      plan.skip++;
      console.log(`skip     ${w.companyName} (${w.passwordHash === '' ? 'admin placeholder' : 'no real inbox'})`);
      continue;
    }
    const row = rows.find((r) => r.employerId === w.id && r.email.toLowerCase() === email);
    const action = !row ? 'create' : row.role === 'OWNER' && row.status === 'ACTIVE' ? 'ok' : 'upgrade';
    plan[action]++;
    if (action !== 'ok') console.log(`${action.padEnd(8)} ${w.companyName} · ${mask(email)}${row ? ` (was ${row.role} ${row.status})` : ''}`);
    if (apply && action !== 'ok') await ensureOwnerMember(w.id);
  }

  console.log(`\n${apply ? 'APPLIED' : 'DRY RUN (nothing changed)'}: ${workspaces.length} workspaces · create ${plan.create} · upgrade ${plan.upgrade} · already done ${plan.ok} · skipped ${plan.skip}`);
  if (!apply && plan.create + plan.upgrade > 0) console.log('Run again with --apply to make these changes.');
  await prisma.$disconnect();
})();
