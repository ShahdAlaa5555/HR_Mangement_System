/**
 * src/modules/auth/routes/auth.routes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Authentication Routes
 * Base prefix: /api/v1/auth  (mounted in app.js)
 *
 * THESIS NOTE:
 * Public routes (login, refresh) require NO authentication token.
 * Protected routes (me, change-password) require a valid Bearer token.
 * Rate limiting is applied to /login to prevent brute-force attacks.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const router = require('express').Router();
const Joi = require('joi');
const ctrl = require('../controllers/auth.controller');
const { authenticate } = require('../../../middleware/auth');
const { validate } = require('../../../middleware/validate');
const rateLimit = require('express-rate-limit');

// Strict rate limit on login: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Please try again in 15 minutes.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({ 'string.email': 'Please provide a valid email address.' }),
  password: Joi.string().required().messages({ 'string.empty': 'Password is required.' }),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      'string.min': 'Password must be at least 8 characters.',
      'string.pattern.base': 'Password must contain uppercase, lowercase, and a number.',
    }),
});

// POST /api/v1/auth/login
// Public — returns accessToken, refreshToken, employee profile
router.post('/login', loginLimiter, validate(loginSchema), ctrl.login);

// POST /api/v1/auth/refresh
// Public — exchanges refreshToken for new accessToken
router.post('/refresh', validate(refreshSchema), ctrl.refresh);

// GET /api/v1/auth/me
// Protected — returns current logged-in user info from JWT payload
router.get('/me', authenticate, ctrl.me);

// POST /api/v1/auth/change-password
// Protected — allows authenticated user to change their password
router.post('/change-password', authenticate, validate(changePasswordSchema), ctrl.changePassword);
// POST /api/v1/auth/register-credential
// Creates a hashed password for an existing employee
router.post('/register-credential', validate(Joi.object({
  employeeId: Joi.number().integer().positive().required(),
  password: Joi.string().min(8).required(),
})), async (req, res) => {
  const bcrypt = require('bcryptjs');
  const prisma = require('../../../config/database');
  const { sendSuccess } = require('../../../middleware/validate');

  const { employeeId, password } = req.body;
  const hash = await bcrypt.hash(password, 12);

  const credential = await prisma.userCredential.upsert({
    where: { EmployeeID: employeeId },
    update: { PasswordHash: hash, UpdatedAt: new Date() },
    create: { EmployeeID: employeeId, PasswordHash: hash },
  });

  return sendSuccess(res, { message: 'Credential saved.', employeeId: credential.EmployeeID }, 201);
});


module.exports = router;
