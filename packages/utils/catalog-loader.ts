/**
 * Loads the plan catalog version in force and applies it (see catalog.ts). Server only: it reads the database.
 *
 * Each app makes one loader with its own Prisma client and calls `ensure()` wherever a request starts reading plans.
 * The answer is remembered for a short while per server instance, so the cost is one small query a minute. A
 * checkout asks for a fresh read, so a price is never charged from a remembered copy.
 */
import { applyCatalog, validateCatalog } from './catalog';

interface VersionRow { id: string; data: unknown }
interface CatalogDb { planCatalogVersion: { findFirst(args: unknown): Promise<VersionRow | null> } }

/** How long a server instance trusts what it last read. */
export const CATALOG_TTL_MS = 60_000;

export function makeCatalogLoader(db: CatalogDb, opts: { ttlMs?: number; now?: () => number } = {}) {
  const ttl = opts.ttlMs ?? CATALOG_TTL_MS;
  const clock = opts.now ?? Date.now;
  let readAt = -Infinity;
  let inForce: string | null = null;
  let reading: Promise<void> | null = null;

  async function read(): Promise<void> {
    try {
      const v = await db.planCatalogVersion.findFirst({ where: { effectiveFrom: { lte: new Date(clock()) } }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }], select: { id: true, data: true } });
      const id = v?.id ?? null;
      if (id !== inForce) {
        const checked = v ? validateCatalog(v.data) : null;
        // A stored version that no longer passes the checks is never put in force: the built-in values apply.
        if (v && checked && !checked.ok) console.error('[catalog] version', v.id, 'is not valid and was skipped:', checked.path, checked.error);
        applyCatalog(checked && checked.ok ? checked.data : null);
        inForce = id;
      }
    } catch (err) {
      // Table missing or database unreachable: keep whatever is in force (the built-in values at first).
      const code = (err as { code?: string } | null)?.code;
      if (code !== 'P2021') console.error('[catalog] not loaded', err instanceof Error ? err.message : err);
    } finally {
      readAt = clock();
      reading = null;
    }
  }

  return {
    /** Make sure the catalog in force has been applied. `fresh` skips the remembered copy (used at checkout). */
    ensure(o: { fresh?: boolean } = {}): Promise<void> {
      if (!o.fresh && clock() - readAt < ttl) return Promise.resolve();
      return (reading ??= read());
    },
    /** The id of the version in force, or null for the built-in values. */
    versionInForce: () => inForce,
  };
}
