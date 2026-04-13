/**
 * src/config/logger.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Winston Logger Configuration
 *
 * THESIS NOTE:
 * Structured logging is essential for production systems. Winston writes:
 *   • Console: colorized, human-readable output during development
 *   • logs/combined.log: all log levels (JSON format for log aggregators)
 *   • logs/error.log: errors only (for alerting / monitoring)
 *
 * Each log entry includes timestamp, level, message, and any metadata.
 * This enables post-incident debugging and audit trail reconstruction.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logDir = process.env.LOG_DIR || 'logs';
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp, level, message, stack }) =>
    stack ? `${timestamp} [${level}] ${message}\n${stack}` : `${timestamp} [${level}] ${message}`
  )
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: prodFormat,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: prodFormat,
    }),
  ],
});

module.exports = logger;
