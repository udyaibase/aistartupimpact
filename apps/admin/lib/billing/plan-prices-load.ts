import { prisma } from '@udyaibase/database';
import { BUILT_IN_CATALOG, catalogChanges, validateCatalog, type CatalogChange, type PlanCatalog } from '@udyaibase/utils/catalog';

/** Everything Billing → Plans & prices shows. `ready` is false until the catalog table exists. */
export interface CatalogVersionRow {
  id: string; note: string | null; effectiveFrom: string; createdAt: string; createdByEmail: string | null;
  state: 'in_force' | 'scheduled' | 'past';
  /** What it changed compared with the version before it. */
  changes: CatalogChange[];
  /** False when the stored data no longer passes the checks (it is skipped, never put in force). */
  valid: boolean;
}

export interface PlanPricesView {
  ready: boolean;
  /** The catalog customers see right now. */
  inForce: PlanCatalog;
  inForceId: string | null;
  builtIn: PlanCatalog;
  versions: CatalogVersionRow[];
  /** Accounts on a paid plan right now, by plan. */
  subscribers: { employer: Record<string, number>; host: Record<string, number> };
}

const missingTable = (e: unknown) => (e as { code?: string } | null)?.code === 'P2021';

export async function loadPlanPrices(now = new Date()): Promise<PlanPricesView> {
  const empty: PlanPricesView = { ready: false, inForce: BUILT_IN_CATALOG, inForceId: null, builtIn: BUILT_IN_CATALOG, versions: [], subscribers: { employer: {}, host: {} } };
  let rows;
  try {
    rows = await prisma.planCatalogVersion.findMany({ orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }], take: 300 });
  } catch (e) {
    if (missingTable(e)) return empty;
    throw e;
  }
  const [emp, host] = await Promise.all([
    prisma.jobBoardEmployer.groupBy({ by: ['plan'], where: { plan: { not: 'FREE' }, planIsTrial: false, planExpiresAt: { gt: now } }, _count: { _all: true } }),
    prisma.eventOrganizer.groupBy({ by: ['plan'], where: { plan: 'PRO', planExpiresAt: { gt: now } }, _count: { _all: true } }),
  ]);

  // Walk the versions oldest first, so each one is compared with the catalog that stood before it.
  let standing = BUILT_IN_CATALOG;
  let inForce = BUILT_IN_CATALOG;
  let inForceId: string | null = null;
  const versions: CatalogVersionRow[] = [];
  for (const r of rows) {
    const checked = validateCatalog(r.data);
    const due = r.effectiveFrom.getTime() <= now.getTime();
    versions.push({
      id: r.id, note: r.note, effectiveFrom: r.effectiveFrom.toISOString(), createdAt: r.createdAt.toISOString(), createdByEmail: r.createdByEmail,
      state: due ? 'past' : 'scheduled', changes: checked.ok ? catalogChanges(standing, checked.data) : [], valid: checked.ok,
    });
    if (checked.ok) standing = checked.data;
    if (due) { inForce = checked.ok ? checked.data : BUILT_IN_CATALOG; inForceId = r.id; }
  }
  for (const v of versions) if (v.id === inForceId) v.state = 'in_force';
  return {
    ready: true, inForce, inForceId, builtIn: BUILT_IN_CATALOG, versions: versions.reverse(),
    subscribers: {
      employer: Object.fromEntries(emp.map((e) => [e.plan, e._count._all])),
      host: Object.fromEntries(host.map((h) => [h.plan, h._count._all])),
    },
  };
}
