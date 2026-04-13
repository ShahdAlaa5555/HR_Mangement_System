/**
 * src/app.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Express Application Bootstrap
 *
 * THESIS NOTE — Application Architecture:
 * This file wires together all Express middleware and module routers.
 * The order of middleware registration is critical in Express:
 *
 *  1. Security middleware (helmet, cors, rate limiter) — applied first
 *     to protect against attacks before any processing
 *  2. Request parsing (JSON, urlencoded) — needed before route handlers
 *  3. Logging (morgan) — after parsing so request body is available
 *  4. Module routers — the actual API endpoints
 *  5. 404 handler — catches unmatched routes
 *  6. Global error handler — last, catches all thrown errors
 *
 * The /api/v1 prefix follows REST versioning best practices.
 * All future breaking API changes would be released under /api/v2,
 * allowing old clients to continue functioning during migration.
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
require('express-async-errors'); // Patches async route handlers to forward errors

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const logger = require('./config/logger');
const { errorHandler } = require('./middleware/errorHandler');

// Module Routers
const authRoutes = require('./modules/auth/routes/auth.routes');
const employeeRoutes = require('./modules/employee/routes/employee.routes');
const attendanceRoutes = require('./modules/attendance/routes/attendance.routes');
const leaveRoutes = require('./modules/leave/routes/leave.routes');
const payrollRoutes = require('./modules/payroll/routes/payroll.routes');

const app = express();

// ─── Upload Directory ─────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ─── Security Middleware ──────────────────────────────────────────────────────
// Helmet sets security-related HTTP headers (X-Frame-Options, CSP, etc.)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS — restricts which origins can call the API
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: Origin ${origin} not allowed.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
}));

// Global rate limiter: 200 requests per 15 minutes per IP
// Individual routes (e.g., /login) can have stricter limits
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded.' } },
});
app.use('/api', globalLimiter);

// ─── Request Middleware ───────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP request logging (skip in test)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }));
}

// Serve uploaded files statically
app.use('/uploads', express.static(uploadDir));

// ─── Health Check ─────────────────────────────────────────────────────────────
// Used by Docker/Kubernetes liveness probes
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'University HRMS API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/employees`, employeeRoutes);
app.use(`${API_PREFIX}/attendance`, attendanceRoutes);
app.use(`${API_PREFIX}/leave`, leaveRoutes);
app.use(`${API_PREFIX}/payroll`, payrollRoutes);

// ─── API Documentation Index ──────────────────────────────────────────────────
app.get(API_PREFIX, (req, res) => {
  res.json({
    name: 'University HRMS API',
    version: '1.0.0',
    description: 'HR Management System — Graduation Thesis Backend',
    modules: [
      { name: 'Auth', base: `${API_PREFIX}/auth`, endpoints: ['/login', '/refresh', '/me', '/change-password'] },
      { name: 'Employee Profile', base: `${API_PREFIX}/employees`, endpoints: ['/me', '/departments', '/positions', '/work-locations'] },
      { name: 'Time & Attendance', base: `${API_PREFIX}/attendance`, endpoints: ['/dashboard/kpis', '/check-in', '/check-out', '/corrections', '/overtime', '/shifts'] },
      { name: 'Leave Management', base: `${API_PREFIX}/leave`, endpoints: ['/types', '/policies', '/balances/me', '/requests', '/holidays'] },
      { name: 'Payroll', base: `${API_PREFIX}/payroll`, endpoints: ['/dashboard', '/runs', '/payslips/me', '/exceptions', '/bank-files'] },
    ],
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found.`,
    },
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// Must have 4 parameters for Express to treat it as error middleware
app.use(errorHandler);

module.exports = app;
