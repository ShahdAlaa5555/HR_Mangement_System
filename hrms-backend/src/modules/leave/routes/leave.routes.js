/**
 * src/modules/leave/routes/leave.routes.js
 * Base prefix: /api/v1/leave
 */
const router = require('express').Router();
const ctrl = require('../controllers/leave.controller');
const { authenticate, authorize } = require('../../../middleware/auth');
const { validate } = require('../../../middleware/validate');
const v = require('../validations/leave.validation');

router.use(authenticate);

// Normalise role to uppercase so authorize() comparisons are case-insensitive.
// This handles 'HR Manager', 'hr', 'Hr Manager', 'ADMIN', etc.
router.use((req, _res, next) => {
  if (req.user && req.user.role) {
    const r = req.user.role.toUpperCase();
    // Map compound / variant roles to canonical values
    if (r.includes('HR'))      req.user.role = 'HR';
    else if (r.includes('ADMIN'))   req.user.role = 'Admin';
    else if (r.includes('MANAGER') || r.includes('SUPERVISOR')) req.user.role = 'Manager';
    else req.user.role = 'Employee';
  }
  next();
});

// ── Leave Types (lookup) ────────────────────────────────────────────────────
router.get('/types', ctrl.listLeaveTypes);
router.post('/types', authorize('HR', 'Admin'), validate(v.createLeaveTypeSchema), ctrl.createLeaveType);

// ── Leave Policies (Admin/HR) ──────────────────────────────────────────────
router.get('/policies', authorize('HR', 'Admin'), ctrl.listLeavePolicies);
router.post('/policies', authorize('HR', 'Admin'), validate(v.createLeavePolicySchema), ctrl.createLeavePolicy);

// ── My Leave Balances ──────────────────────────────────────────────────────
router.get('/my/balances', validate(v.balanceQuerySchema, 'query'), ctrl.getMyLeaveBalances);

// ── My Leave Requests ─────────────────────────────────────────────────────
router.get('/my/requests', validate(v.leaveRequestQuerySchema, 'query'), ctrl.getMyLeaveRequests);

// ── Submit Leave Request ───────────────────────────────────────────────────
router.post('/requests', validate(v.submitLeaveRequestSchema), ctrl.submitLeaveRequest);
// **NEW** - Update / Modify Leave Request (LV-017)
router.patch('/requests/:id', validate(v.updateLeaveRequestSchema), ctrl.updateLeaveRequest);
// **NEW** - Manual Leave Balance Adjustment (LV-013)
router.post('/balances/adjust', authorize('HR', 'Admin'), validate(v.adjustBalanceSchema), ctrl.adjustBalance);

// ── All Leave Requests (HR/Manager) ───────────────────────────────────────
router.get('/requests', authorize('Manager', 'HR', 'Admin'), validate(v.leaveRequestQuerySchema, 'query'), ctrl.listAllLeaveRequests);

// ── Single Request ─────────────────────────────────────────────────────────
router.get('/requests/:id', ctrl.getLeaveRequest);
router.patch('/requests/:id/approve', authorize('Manager', 'HR', 'Admin'), validate(v.approveRejectSchema), ctrl.approveReject);
router.patch('/requests/:id/cancel', validate(v.cancelLeaveRequestSchema), ctrl.cancelLeave);   // Already existed
router.patch('/requests/:id/delegate', authorize('Manager', 'HR', 'Admin'), validate(v.delegateApprovalSchema), ctrl.delegateApproval);

// ── Balance Management (HR) ────────────────────────────────────────────────
router.post('/balances/initialize', authorize('HR', 'Admin'), validate(v.initializeBalanceSchema), ctrl.initializeBalances);
router.post('/balances/adjust', authorize('HR', 'Admin'), validate(v.adjustBalanceSchema), ctrl.adjustBalance);

// ── Holiday Calendar ───────────────────────────────────────────────────────
router.get('/holidays', ctrl.listHolidays);
router.post('/holidays', authorize('HR', 'Admin'), validate(v.createHolidaySchema), ctrl.createHoliday);

// ── Analytics (HR/Manager) ─────────────────────────────────────────────────
router.get('/analytics', authorize('Manager', 'HR', 'Admin'), ctrl.getLeaveAnalytics);

// ── Manager Inbox (kept for direct inbox queries) ─────────────────────────
router.get('/inbox', authorize('Manager', 'HR', 'Admin'), ctrl.getManagerInbox);

module.exports = router;