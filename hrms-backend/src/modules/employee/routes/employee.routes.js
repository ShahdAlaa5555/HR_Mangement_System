/**
 * src/modules/employee/routes/employee.routes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Employee Module — Route Definitions
 *
 * THESIS NOTE — Route Design:
 * Routes follow RESTful conventions:
 *   GET    /resource       → list/search
 *   POST   /resource       → create
 *   GET    /resource/:id   → get one
 *   PUT    /resource/:id   → full update
 *   PATCH  /resource/:id   → partial update
 *   DELETE /resource/:id   → delete (soft delete preferred)
 *
 * All routes are protected by `authenticate` middleware.
 * Role-specific routes use `authorize(role...)`.
 * Employee self-access uses `selfOrHigher` middleware.
 *
 * Base prefix: /api/v1/employees  (mounted in app.js)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const router = require('express').Router();
const ctrl = require('../controllers/employee.controller');
const { authenticate, authorize, selfOrHigher } = require('../../../middleware/auth');
const { validate } = require('../../../middleware/validate');
const v = require('../validations/employee.validation');

// All routes require authentication
router.use(authenticate);

// ─── My Profile (Employee Self-Service — Image 1) ─────────────────────────────
// GET /api/v1/employees/me
// Returns the logged-in employee's own profile card
router.get('/me', ctrl.getMyProfile);

// ─── My Notifications ────────────────────────────────────────────────────────
// GET  /api/v1/employees/me/notifications?unreadOnly=true
router.get('/me/notifications', ctrl.getMyNotifications);
// PATCH /api/v1/employees/me/notifications/read
router.patch('/me/notifications/read', ctrl.markNotificationsRead);

// ─── My Change Requests (Requests tab in Image 1) ────────────────────────────
// GET /api/v1/employees/me/change-requests
router.get('/me/change-requests', ctrl.listMyChangeRequests);

// ─── Departments (Lookup) ─────────────────────────────────────────────────────
// GET  /api/v1/employees/departments
router.get('/departments', ctrl.listDepartments);
// POST /api/v1/employees/departments  (Admin/HR only)
router.post('/departments', authorize('Admin', 'HR'), validate(v.createDepartmentSchema), ctrl.createDepartment);
// PATCH /api/v1/employees/departments/:id
router.patch('/departments/:id', authorize('Admin', 'HR'), validate(v.updateDepartmentSchema), ctrl.updateDepartment);

// ─── Positions (Lookup) ───────────────────────────────────────────────────────
// GET  /api/v1/employees/positions
router.get('/positions', ctrl.listPositions);
// POST /api/v1/employees/positions  (Admin/HR only)
router.post('/positions', authorize('Admin', 'HR'), validate(v.createPositionSchema), ctrl.createPosition);

// ─── Work Locations (Lookup) ──────────────────────────────────────────────────
// GET /api/v1/employees/work-locations
router.get('/work-locations', ctrl.listWorkLocations);

// ─── Employee List & Create ───────────────────────────────────────────────────
// GET  /api/v1/employees?search=&departmentId=&status=&page=&limit=
router.get('/', authorize('Manager', 'HR', 'Payroll', 'Admin'), validate(v.employeeListQuerySchema, 'query'), ctrl.listEmployees);
// POST /api/v1/employees
router.post('/', authorize('HR', 'Admin'), validate(v.createEmployeeSchema), ctrl.createEmployee);

// ─── Org Chart ────────────────────────────────────────────────────────────────
// GET /api/v1/employees/:id/org-chart
router.get('/:id/org-chart', ctrl.getOrgChart);

// ─── Change Requests (per employee) ──────────────────────────────────────────
// POST /api/v1/employees/:id/change-requests
// Employee submits a request to change their own data
router.post('/:id/change-requests', selfOrHigher, validate(v.createChangeRequestSchema), ctrl.submitChangeRequest);

// PATCH /api/v1/employees/change-requests/:requestId  (HR reviews)
router.patch('/change-requests/:requestId', authorize('HR', 'Admin'), validate(v.reviewChangeRequestSchema), ctrl.reviewChangeRequest);

// ─── Salary Management ───────────────────────────────────────────────────────
// GET  /api/v1/employees/:id/salary
router.get('/:id/salary', authorize('HR', 'Payroll', 'Admin'), ctrl.getSalaryHistory);
// POST /api/v1/employees/:id/salary
router.post('/:id/salary', authorize('HR', 'Payroll', 'Admin'), validate(v.createSalarySchema), ctrl.createSalaryRecord);

// ─── Audit Log ────────────────────────────────────────────────────────────────
// GET /api/v1/employees/:id/audit
router.get('/:id/audit', authorize('HR', 'Admin'), ctrl.getAuditLog);

// ─── Terminate ───────────────────────────────────────────────────────────────
// POST /api/v1/employees/:id/terminate
router.post('/:id/terminate', authorize('HR', 'Admin'), ctrl.terminateEmployee);

// ─── Single Employee (must come after named sub-routes) ──────────────────────
// GET    /api/v1/employees/:id
router.get('/:id', selfOrHigher, ctrl.getEmployee);
// PATCH  /api/v1/employees/:id
router.patch('/:id', authorize('HR', 'Admin'), validate(v.updateEmployeeSchema), ctrl.updateEmployee);

module.exports = router;
