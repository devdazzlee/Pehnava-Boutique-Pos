import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * On Vercel (serverless), each function instance needs a tiny pool and
 * should talk to Neon's pooler with pgbouncer=true. Without this, Prisma
 * hits P2024 (pool timeout) and the function exits.
 */
function resolveDatabaseUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;

  if (!process.env.VERCEL) return base;

  try {
    const url = new URL(base);
    if (!url.searchParams.has('pgbouncer')) {
      url.searchParams.set('pgbouncer', 'true');
    }
    url.searchParams.set('connection_limit', '1');
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '20');
    }
    // Can break Neon pooler connections in serverless
    url.searchParams.delete('channel_binding');
    return url.toString();
  } catch {
    return base;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: { url: resolveDatabaseUrl() },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

// Reuse one client across warm serverless invocations
globalForPrisma.prisma = prisma;
