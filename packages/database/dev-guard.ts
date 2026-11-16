/**
 * Local development must never run against the production database: opening a candidate marks them seen,
 * a test hire emails a real person, a bad migration hits live data. Local dev uses the Neon "dev" branch
 * (scripts/use-dev-db.sh). This stops `next dev` (and anything else run with NODE_ENV=development) if the
 * connection string points at production.
 *
 * Production's endpoint id is not a secret. Override it with PRODUCTION_DB_HOST if production ever moves;
 * ALLOW_PROD_DB_IN_DEV=1 bypasses the check for a deliberate one-off.
 */
const PRODUCTION_DB_HOST = process.env.PRODUCTION_DB_HOST || 'ep-restless-shadow';

export function isProductionDatabase(connectionString: string | undefined): boolean {
  return !!connectionString && connectionString.includes(PRODUCTION_DB_HOST);
}

export function assertNotProductionInDev(connectionString: string | undefined): void {
  if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_PROD_DB_IN_DEV === '1') return;
  if (isProductionDatabase(connectionString)) {
    throw new Error(
      'Local development is pointed at the PRODUCTION database. Run ./scripts/use-dev-db.sh to switch to the dev branch ' +
      '(or set ALLOW_PROD_DB_IN_DEV=1 for a deliberate one-off).',
    );
  }
}
