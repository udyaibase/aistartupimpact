'use server';

import { prisma } from '@udyaibase/database';
import { BUILT_IN_CATALOG, catalogChanges, validateCatalog, type PlanCatalog } from '@udyaibase/utils/catalog';
import { requireActionAuth } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';
import { logAuditEvent } from '@/lib/audit-log';
import { publicError } from '@/lib/public-error';
import { tooManyShared } from '@/lib/rate-limit';
import { refreshPublic } from '@/lib/refresh-public';
import { ensureCatalog } from '@/lib/catalog';
import { loadPlanPrices } from '@/lib/billing/plan-prices-load';

const ROLES = sectionRoles('/billing');
type Fail = { success: false; error: string; path?: string };

/** A schedule can't be set further out than this: a forgotten far-future price change is a surprise waiting. */
const MAX_SCHEDULE_DAYS = 365;

/** The catalog that will stand at a moment: the newest valid version due by then, else the built-in values. */
async function standingAt(when: Date): Promise<PlanCatalog> {
  const rows = await prisma.planCatalogVersion.findMany({ where: { effectiveFrom: { lte: when } }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }], take: 20, select: { data: true } });
  for (const r of rows) {
    const c = validateCatalog(r.data);
    if (c.ok) return c.data;
  }
  return BUILT_IN_CATALOG;
}

async function publish() {
  await ensureCatalog({ fresh: true });
  // Pricing pages are cached: rebuild them now. Website servers pick the new version up within a minute; every
  // checkout reads it fresh, so the price charged is always the one in force.
  await refreshPublic(['all']);
}

/**
 * Save a new version of plan prices and limits, in force now or from a chosen time. Versions are never edited:
 * a correction is another version, so the history always says what customers were shown and when.
 */
export async function savePlanPricesAction(raw: unknown, opts: { effectiveFrom?: string | null; note?: string }): Promise<{ success: true; scheduled: boolean; changes: number } | Fail> {
  // Checked here, in the action itself: a server action is a public endpoint.
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  const limited = await tooManyShared(session!.user.id, 'planChange');
  if (limited) return { success: false, error: limited };
  const by = session!.user.email ?? null;
  const v = validateCatalog(raw);
  if (!v.ok) return { success: false, error: v.error, path: v.path };
  const note = String(opts.note ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
  if (note.length < 3) return { success: false, error: 'Add a short note saying why the prices or limits are changing. It is kept in the history.', path: 'note' };

  const now = new Date();
  let effectiveFrom = now;
  if (opts.effectiveFrom) {
    effectiveFrom = new Date(opts.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) return { success: false, error: 'Choose a valid date and time.', path: 'effectiveFrom' };
    if (effectiveFrom.getTime() < now.getTime() - 60_000) return { success: false, error: 'The start can’t be in the past. Leave it empty to start now.', path: 'effectiveFrom' };
    if (effectiveFrom.getTime() > now.getTime() + MAX_SCHEDULE_DAYS * 864e5) return { success: false, error: 'Schedule at most a year ahead.', path: 'effectiveFrom' };
  }
  const scheduled = effectiveFrom.getTime() > now.getTime() + 60_000;

  try {
    const before = await standingAt(effectiveFrom);
    const changes = catalogChanges(before, v.data);
    if (!changes.length) return { success: false, error: scheduled ? 'Nothing differs from what will already be in force at that time.' : 'Nothing has changed.' };
    const made = await prisma.planCatalogVersion.create({ data: { data: v.data as object, note, effectiveFrom: scheduled ? effectiveFrom : now, createdByEmail: by } });
    await logAuditEvent({
      action: 'UPDATE', resourceType: 'SETTINGS', resourceId: made.id, resourceName: `Plans & prices${scheduled ? ' (scheduled)' : ''}: ${note}`,
      before: Object.fromEntries(changes.map((c) => [c.label, c.from])), after: { ...Object.fromEntries(changes.map((c) => [c.label, c.to])), effectiveFrom: (scheduled ? effectiveFrom : now).toISOString() },
    });
    if (!scheduled) await publish();
    return { success: true, scheduled, changes: changes.length };
  } catch (e) {
    return { success: false, error: publicError(e, "Couldn't save the new prices. Nothing was changed.") };
  }
}

/** Remove a version that has not started yet. One already in force is history and stays. */
export async function cancelScheduledPricesAction(id: string): Promise<{ success: true } | Fail> {
  // Checked here, in the action itself: a server action is a public endpoint.
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  const limited = await tooManyShared(session!.user.id, 'planChange');
  if (limited) return { success: false, error: limited };
  const by = session!.user.email ?? null;
  try {
    const gone = await prisma.planCatalogVersion.deleteMany({ where: { id, effectiveFrom: { gt: new Date() } } });
    if (!gone.count) return { success: false, error: 'That change has already started, so it can’t be cancelled. Save a new version to change prices again.' };
    await logAuditEvent({ action: 'DELETE', resourceType: 'SETTINGS', resourceId: id, resourceName: 'Plans & prices: scheduled change cancelled' });
    return { success: true };
  } catch (e) {
    return { success: false, error: publicError(e, "Couldn't cancel the scheduled change.") };
  }
}

/** Put an earlier version (or the built-in values) back in force, as a new version dated now. */
export async function restorePlanPricesAction(id: string | 'BUILT_IN'): Promise<{ success: true; changes: number } | Fail> {
  // Checked here, in the action itself: a server action is a public endpoint.
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  const limited = await tooManyShared(session!.user.id, 'planChange');
  if (limited) return { success: false, error: limited };
  const by = session!.user.email ?? null;
  try {
    let data: PlanCatalog = BUILT_IN_CATALOG;
    let label = 'the built-in prices';
    if (id !== 'BUILT_IN') {
      const row = await prisma.planCatalogVersion.findUnique({ where: { id } });
      const checked = row ? validateCatalog(row.data) : null;
      if (!row || !checked?.ok) return { success: false, error: 'That version can’t be restored: it no longer passes the checks.' };
      data = checked.data;
      label = `the version from ${row.effectiveFrom.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`;
    }
    const now = new Date();
    const changes = catalogChanges(await standingAt(now), data);
    if (!changes.length) return { success: false, error: 'Those prices are already in force.' };
    const made = await prisma.planCatalogVersion.create({ data: { data: data as object, note: `Restored ${label}`, effectiveFrom: now, createdByEmail: by } });
    await logAuditEvent({ action: 'UPDATE', resourceType: 'SETTINGS', resourceId: made.id, resourceName: `Plans & prices: restored ${label}`, before: Object.fromEntries(changes.map((c) => [c.label, c.from])), after: Object.fromEntries(changes.map((c) => [c.label, c.to])) });
    await publish();
    return { success: true, changes: changes.length };
  } catch (e) {
    return { success: false, error: publicError(e, "Couldn't restore that version. Nothing was changed.") };
  }
}

export async function planPricesViewAction() {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  try {
    return { success: true as const, data: await loadPlanPrices() };
  } catch (e) {
    return { success: false as const, error: publicError(e, "Couldn't load plans and prices.") };
  }
}
