import { prisma } from '@udyaibase/database';
import { makeCatalogLoader } from '@udyaibase/utils/catalog-loader';

/**
 * The plan catalog on this server (Admin → Billing → Plans & prices): prices and limits for hiring plans, host
 * plans, Event Boost and funding packs. `ensureCatalog()` makes sure the version in force has been applied before
 * plans are read. It is called:
 *  - once when a server instance starts, and every minute after (instrumentation.ts);
 *  - by both session loaders, so every signed-in portal request has it;
 *  - by the public entry points that read plans (pricing, funding, event registration, ticket checkout);
 *  - with `{ fresh: true }` at every checkout and payment activation, so money is never taken at a remembered price.
 * Without the catalog table, or before any version is saved, the values built into the code apply.
 */
const loader = makeCatalogLoader(prisma as unknown as Parameters<typeof makeCatalogLoader>[0]);

export const ensureCatalog = loader.ensure;
export const catalogVersionInForce = loader.versionInForce;
