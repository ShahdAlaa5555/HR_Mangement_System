/**
 * src/server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP Server Entry Point
 *
 * THESIS NOTE:
 * This file is intentionally minimal — it only starts the HTTP server.
 * The Express application logic lives in app.js, keeping server startup
 * separate from route/middleware configuration. This separation enables:
 *   1. Easier unit testing (import app.js without starting a server)
 *   2. Cleaner process lifecycle management
 *   3. Graceful shutdown handling for in-flight requests
 *
 * Graceful Shutdown:
 * On SIGTERM (Docker stop / Kubernetes pod eviction), we stop accepting
 * new connections and wait for existing requests to complete before
 * closing the Prisma connection pool and exiting.
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const app = require('./app');
const logger = require('./config/logger');
const prisma = require('./config/database');

const PORT = parseInt(process.env.PORT, 10) || 3000;

const server = app.listen(PORT, () => {
  logger.info(`╔══════════════════════════════════════════════╗`);
  logger.info(`║   University HRMS API — Server Started       ║`);
  logger.info(`║   Port     : ${PORT}                              ║`);
  logger.info(`║   Env      : ${(process.env.NODE_ENV || 'development').padEnd(30)}║`);
  logger.info(`║   Base URL : http://localhost:${PORT}/api/v1   ║`);
  logger.info(`╚══════════════════════════════════════════════╝`);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function gracefulShutdown(signal) {
  logger.info(`[Server] ${signal} received — shutting down gracefully...`);

  server.close(async () => {
    logger.info('[Server] HTTP server closed.');

    try {
      await prisma.$disconnect();
      logger.info('[Server] Database connection pool closed.');
    } catch (err) {
      logger.error('[Server] Error closing database connection:', err);
    }

    process.exit(0);
  });

  // Force shutdown after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error('[Server] Could not close connections in time. Forcing shutdown.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled promise rejection guard
process.on('unhandledRejection', (reason) => {
  logger.error('[Server] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('[Server] Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});
