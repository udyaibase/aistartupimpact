import { describe, it, expect, vi, afterEach } from 'vitest';
import { assertNotProductionInDev, isProductionDatabase } from '@udyaibase/database/dev-guard';

const PROD = 'postgresql://u:p@ep-restless-shadow-a1-pooler.example.neon.tech/db';
const DEV = 'postgresql://u:p@ep-winter-cloud-a1-pooler.example.neon.tech/db';

afterEach(() => vi.unstubAllEnvs());

describe('local dev never runs on the production database', () => {
  it('recognises the production endpoint', () => {
    expect(isProductionDatabase(PROD)).toBe(true);
    expect(isProductionDatabase(DEV)).toBe(false);
    expect(isProductionDatabase(undefined)).toBe(false);
  });
  it('stops development against production, allows the dev branch', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => assertNotProductionInDev(PROD)).toThrow(/PRODUCTION database/);
    expect(() => assertNotProductionInDev(DEV)).not.toThrow();
  });
  it('never blocks production itself, tests, or a deliberate override', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertNotProductionInDev(PROD)).not.toThrow();
    vi.stubEnv('NODE_ENV', 'test');
    expect(() => assertNotProductionInDev(PROD)).not.toThrow();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALLOW_PROD_DB_IN_DEV', '1');
    expect(() => assertNotProductionInDev(PROD)).not.toThrow();
  });
});
