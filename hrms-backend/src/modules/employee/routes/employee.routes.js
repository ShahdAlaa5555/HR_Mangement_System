/**
 * src/modules/employee/routes/employee.routes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Employee Module — Route Definitions
 *
 * THESIS NOTE — Route Design:
 * Routes follow RESTful conventions:
 * GET    /resource       → list/search
 * POST   /resource       → create
 * GET    /resource/:id   → get one
 * PUT    /resource/:id   → full update
 * PATCH  /resource/:id   → partial update
 * DELETE /resource/:id   → delete (soft delete preferred)
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
const { uploadProfile,uploadDocument } = require('../../../middleware/multer');

// All routes require authentication
router.use(authenticate);


// ─── My Profile (Employee Self-Service — Image 1) ─────────────────────────────
// GET /api/v1/employees/me
// Returns the logged-in employee's own profile card
router.get('/me', ctrl.getMyProfile);
// GET /api/v1/employees/me/team (Manager Self-Service)
router.get('/me/team', authorize('Manager', 'Admin', 'HR'), ctrl.getMyTeam);

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
// GET /api/v1/employees/change-requests/pending  (HR Inbox)
// ─── Change Requests (per employee) ──────────────────────────────────────────

// POST /api/v1/employees/:id/change-requests
// Employee submits a request to change their own data
router.post('/:id/change-requests', selfOrHigher, validate(v.createChangeRequestSchema), ctrl.submitChangeRequest);

// ADD THIS MISSING ROUTE HERE:
// GET /api/v1/employees/change-requests/pending  (HR Inbox)
router.get('/change-requests/pending', authorize('HR', 'Admin'), ctrl.getAllPendingChangeRequests);

// PATCH /api/v1/employees/change-requests/:requestId  (HR reviews)
// ADD THIS NEW ROUTE (Above the /:id block):
// GET /api/v1/employees/me/team/change-requests
router.get('/me/team/change-requests', authorize('Manager', 'HR', 'Admin'), ctrl.getTeamPendingChangeRequests);

// FIND THIS EXISTING ROUTE and ADD 'Manager' to the authorize list:
// PATCH /api/v1/employees/change-requests/:requestId
router.patch('/change-requests/:requestId', authorize('Manager', 'HR', 'Admin'), validate(v.reviewChangeRequestSchema), ctrl.reviewChangeRequest);
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

// ─── Terminate & Reactivate ──────────────────────────────────────────────────
// POST /api/v1/employees/:id/terminate
router.post('/:id/terminate', authorize('HR', 'Admin'), ctrl.terminateEmployee);

// POST /api/v1/employees/:id/reactivate (NEW - EM-006)
router.post('/:id/reactivate', authorize('HR', 'Admin'), ctrl.reactivateEmployee);

// ─── Emergency Contacts (Epic 1) ─────────────────────────────────────────────
// GET    /api/v1/employees/:id/emergency-contacts
router.get('/:id/emergency-contacts', selfOrHigher, ctrl.getEmergencyContacts);
// POST   /api/v1/employees/:id/emergency-contacts
router.post('/:id/emergency-contacts', selfOrHigher, validate(v.createEmergencyContactSchema), ctrl.addEmergencyContact);
// DELETE /api/v1/employees/:id/emergency-contacts/:contactId
router.delete('/:id/emergency-contacts/:contactId', selfOrHigher, ctrl.deleteEmergencyContact);
// Add this right below your existing POST and DELETE contact routes:
router.patch('/:id/contacts/:contactId', selfOrHigher, validate(v.createEmergencyContactSchema), ctrl.updateEmergencyContact);

// ─── Skills (Epic 1) ─────────────────────────────────────────────────────────
// GET    /api/v1/employees/:id/skills
router.get('/:id/skills', selfOrHigher, ctrl.getSkills);
// POST   /api/v1/employees/:id/skills
router.post('/:id/skills', selfOrHigher, validate(v.createSkillSchema), ctrl.addSkill);
// DELETE /api/v1/employees/:id/skills/:skillId
router.delete('/:id/skills/:skillId', selfOrHigher, ctrl.deleteSkill);

// ─── Photo Upload ────────────────────────────────────────────────────────────
// POST /api/v1/employees/upload-photo
router.post('/upload-photo', uploadProfile.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: { message: 'No file uploaded' } });
  }
  
  // Construct the URL to the newly saved photo so the frontend can display it
  const photoUrl = `${req.protocol}://${req.get('host')}/uploads/profiles/${req.file.filename}`;
  res.status(200).json({ data: { url: photoUrl } });
});
// ─── Profile Completeness & Reminders ────────────────────────────────────────
router.get('/:id/completeness', authorize('HR', 'Admin', 'Manager'), ctrl.getProfileCompleteness);
router.post('/:id/remind-completeness', authorize('HR', 'Admin'), ctrl.sendCompletenessReminder);
router.patch('/:id/role', authorize('HR', 'Admin'), ctrl.assignRole);
router.get('/settings/field-visibility', authenticate, ctrl.getFieldVisibility);
router.put('/settings/field-visibility', authorize('Admin'), ctrl.updateFieldVisibility);
// ─── Official Documents ──────────────────────────────────────────────────────
// ─── Timeline, Documents & Letters ──────────────────────────────────────────
// Changed to selfOrHigher so employees can access their own data
router.get('/:id/timeline', selfOrHigher, ctrl.getEmploymentTimeline);
router.get('/:id/documents', selfOrHigher, ctrl.getDocuments);
router.post('/:id/documents', selfOrHigher, uploadDocument.single('document'), ctrl.uploadDocument);
router.delete('/:id/documents/:docId', selfOrHigher, ctrl.deleteDocument);

// New PDF endpoints
router.get('/:id/letters/verification', selfOrHigher, ctrl.generateVerificationLetter);
router.get('/:id/letters/contract', selfOrHigher, ctrl.generateContract);
// GET  /api/v1/employees/:id/notes
router.get('/:id/notes', authorize('HR', 'Admin', 'Manager'), ctrl.getEmployeeNotes);
// POST /api/v1/employees/:id/notes
router.post('/:id/notes', authorize('HR', 'Admin', 'Manager'), validate(v.createNoteSchema), ctrl.addEmployeeNote);
// ─── Single Employee (must come after named sub-routes) ──────────────────────
// GET    /api/v1/employees/:id

router.get('/:id', selfOrHigher, ctrl.getEmployee);
// Employee updates their own photo (Bypasses HR check, uses selfOrHigher)
router.patch('/:id/photo', selfOrHigher, ctrl.updateProfilePhoto);
// PATCH  /api/v1/employees/:id
router.patch('/:id', authorize('HR', 'Admin'), validate(v.updateEmployeeSchema), ctrl.updateEmployee);

module.exports = router;