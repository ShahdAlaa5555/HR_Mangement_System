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

// ── Leave Types (lookup) ────────────────────────────────────────────────────
router.get('/types', ctrl.listLeaveTypes);
router.post('/types', authorize('HR', 'Admin'), validate(v.createLeaveTypeSchema), ctrl.createLeaveType);

// ── Leave Policies (Admin/HR) ──────────────────────────────────────────────
router.get('/policies', authorize('HR', 'Admin'), ctrl.listLeavePolicies);
router.post('/policies', authorize('HR', 'Admin'), validate(v.createLeavePolicySchema), ctrl.createLeavePolicy);

// ── My Leave Balances (Image 4 dashboard cards) ────────────────────────────
router.get('/my/balances', validate(v.balanceQuerySchema, 'query'), ctrl.getMyLeaveBalances);

// ── My Leave Requests (leave history tab) ─────────────────────────────────
router.get('/my/requests', validate(v.leaveRequestQuerySchema, 'query'), ctrl.getMyLeaveRequests);

// ── Submit Leave Request (Request Leave tab) ───────────────────────────────
router.post('/requests', validate(v.submitLeaveRequestSchema), ctrl.submitLeaveRequest);

// ── Manager Inbox (pending approvals) ─────────────────────────────────────
router.get('/inbox', authorize('Manager', 'HR', 'Admin'), ctrl.getManagerInbox);

// ── All Leave Requests (HR/Admin) ─────────────────────────────────────────
router.get('/requests', authorize('Manager', 'HR', 'Admin'), validate(v.leaveRequestQuerySchema, 'query'), ctrl.listAllLeaveRequests);

// ── Single Request ─────────────────────────────────────────────────────────
router.get('/requests/:id', ctrl.getLeaveRequest);
router.patch('/requests/:id/approve', authorize('Manager', 'HR', 'Admin'), validate(v.approveRejectSchema), ctrl.approveReject);
router.patch('/requests/:id/cancel', validate(v.cancelLeaveRequestSchema), ctrl.cancelLeave);
router.patch('/requests/:id/delegate', authorize('Manager', 'HR', 'Admin'), validate(v.delegateApprovalSchema), ctrl.delegateApproval);

// ── Balance Management (HR) ────────────────────────────────────────────────
router.post('/balances/initialize', authorize('HR', 'Admin'), validate(v.initializeBalanceSchema), ctrl.initializeBalances);
router.post('/balances/adjust', authorize('HR', 'Admin'), validate(v.adjustBalanceSchema), ctrl.adjustBalance);

// ── Holiday Calendar ───────────────────────────────────────────────────────
router.get('/holidays', ctrl.listHolidays);
router.post('/holidays', authorize('HR', 'Admin'), validate(v.createHolidaySchema), ctrl.createHoliday);

// ── Analytics (HR/Manager) ─────────────────────────────────────────────────
router.get('/analytics', authorize('Manager', 'HR', 'Admin'), ctrl.getLeaveAnalytics);

module.exports = router;
