import { prisma } from '@udyaibase/database';
import { makeCatalogLoader } from '@udyaibase/utils/catalog-loader';

/**
 * The plan catalog in the admin app (Billing → Plans & prices). The admin reads plans too (granting a plan, offers,
 * billing), so it applies the version in force whenever an action or API call is authorised (lib/api-auth.ts), and
 * on the pages that print plan values. It is deliberately not loaded from instrumentation.ts: in this app that made
 * the dev server rebuild and reload every page in a loop.
 */
const loader = makeCatalogLoader(prisma as unknown as Parameters<typeof makeCatalogLoader>[0]);

export const ensureCatalog = loader.ensure;
