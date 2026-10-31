import { PrismaClient, Prisma } from '@prisma/client';
import { Pool, neonConfig, types } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import ws from 'ws';

// Node < 22 has no global WebSocket.
if (typeof WebSocket === 'undefined') neonConfig.webSocketConstructor = ws;

// Override default date/timestamp parsing behavior to return strings.
// This is required to prevent "Inconsistent column data: Conversion failed" errors
// when using Prisma with the Neon Serverless HTTP adapter.
types.setTypeParser(1082, (val: string) => val); // date
types.setTypeParser(1114, (val: string) => val); // timestamp without timezone
types.setTypeParser(1184, (val: string) => val); // timestamp with timezone

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  // WebSocket pool, not the HTTP driver: HTTP mode can't run transactions, updateMany,
  // createMany or upsert, all of which Prisma needs.
  const pool = new Pool({ connectionString });
  const adapter = new PrismaNeon(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

// True lazy proxy — PrismaClient is NOT instantiated until a property is first accessed
// This prevents build-time failures when DATABASE_URL is not set
let _prismaInstance: PrismaClient | undefined;

function getPrisma(): PrismaClient {
  if (!_prismaInstance) {
    _prismaInstance = globalForPrisma.prisma ?? createPrismaClient();
    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = _prismaInstance;
    }
  }
  return _prismaInstance;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as any)[prop];
  },
});

export default prisma;
export { PrismaClient, Prisma };
