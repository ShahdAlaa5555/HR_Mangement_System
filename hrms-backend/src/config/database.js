/**
 * src/config/database.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Prisma Client Singleton
 *
 * THESIS NOTE — Why a Singleton Pattern?
 * In Node.js, `require()` is cached after the first call, so multiple imports
 * of this module will always return the same PrismaClient instance. This is
 * critical because:
 *   1. PrismaClient manages a connection pool to SQL Server internally.
 *   2. Creating multiple PrismaClient instances causes connection pool
 *      exhaustion, especially under load.
 *   3. During development with hot-reloading (nodemon), the module cache is
 *      reset on each reload — we use the global object to persist the single
 *      instance and avoid "Too many clients" warnings.
 *
 * The `log` configuration sends query/warn/error events to our Winston logger
 * for full observability.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

// Prevent multiple instances during hot-reload in development
const globalForPrisma = global;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

// Forward Prisma events to Winston
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug(`[Prisma Query] ${e.query} | Params: ${e.params} | Duration: ${e.duration}ms`);
  });
}

prisma.$on('warn', (e) => logger.warn(`[Prisma Warning] ${e.message}`));
prisma.$on('error', (e) => logger.error(`[Prisma Error] ${e.message}`));

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
