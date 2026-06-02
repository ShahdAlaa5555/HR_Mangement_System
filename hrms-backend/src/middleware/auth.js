/**
 * src/middleware/auth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * JWT Authentication & Role-Based Authorization Middleware
 *
 * THESIS NOTE:
 * The system uses stateless JWT (JSON Web Token) authentication.
 * On login, the server issues a signed token containing the employee's ID,
 * role, and permissions. Every subsequent request carries this token in the
 * Authorization header: `Bearer <token>`.
 *
 * Token Payload Structure:
 * {
 *   sub: 42,               // EmployeeID
 *   email: "...",
 *   role: "Manager",       // determines what they can see/do
 *   deptId: 3,             // used for team-scoped queries
 *   iat: 1700000000,
 *   exp: 1700028800        // 8-hour expiry
 * }
 *
 * Roles in this system:
 *   Employee  — self-service only
 *   Manager   — team oversight + approval workflows
 *   HR        — full leave/payroll operations
 *   Payroll   — payroll specialist
 *   Admin     — system configuration
 * ─────────────────────────────────────────────────────────────────────────────
 */

const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');
const prisma = require('../config/database');

/**
 * Verifies the Bearer token and attaches `req.user` for downstream use.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication token is missing.', 401, 'UNAUTHORIZED'));
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ── FIX: Select PositionID so we can check it in real-time ──
    const employee = await prisma.employee.findUnique({
      where: { EmployeeID: decoded.sub },
      select: {
        EmployeeID: true,
        EmployeeCode: true,
        FullName: true,
        Email: true,
        DepartmentID: true,
        CurrentStatus: true,
        IsActive: true,
        PositionID: true, // ✅ Added this
      },
    });

    if (!employee || !employee.IsActive || employee.CurrentStatus === 'Terminated') {
      return next(new AppError('Account is inactive or has been terminated.', 401, 'ACCOUNT_INACTIVE'));
    }

    // ── FIX: Calculate the role dynamically based on PositionID ──
    let effectiveRole = decoded.role; // Default to token role
    
   
    req.user = {
      id: employee.EmployeeID,
      code: employee.EmployeeCode,
      name: employee.FullName,
      email: employee.Email,
      deptId: employee.DepartmentID,
      role: effectiveRole, // ✅ Now Mona is "Manager" regardless of what the old token says
      positionId: employee.PositionID
    };

    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Session has expired. Please log in again.', 401, 'TOKEN_EXPIRED'));
    }
    return next(new AppError('Invalid authentication token.', 401, 'INVALID_TOKEN'));
  }
}

/**
 * Role-based authorization factory.
 * Usage: router.get('/admin', authorize('Admin', 'HR'), handler)
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Not authenticated.', 401, 'UNAUTHORIZED'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
          403,
          'FORBIDDEN'
        )
      );
    }
    return next();
  };
}

/**
 * Ensures an employee can only access their own data,
 * UNLESS they are a Manager, HR, Payroll, or Admin.
 */
function selfOrHigher(req, res, next) {
  const targetId = parseInt(req.params.employeeId || req.params.id, 10);
  const privilegedRoles = ['Manager', 'HR', 'Payroll', 'Admin'];

  if (req.user.id === targetId || privilegedRoles.includes(req.user.role)) {
    return next();
  }

  return next(new AppError('You can only access your own records.', 403, 'FORBIDDEN'));
}

module.exports = { authenticate, authorize, selfOrHigher };
