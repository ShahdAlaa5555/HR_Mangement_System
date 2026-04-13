/**
 * src/modules/attendance/routes/attendance.routes.js
 * Base prefix: /api/v1/attendance
 */

const router = require('express').Router();
const ctrl = require('../controllers/attendance.controller');
const { authenticate, authorize } = require('../../../middleware/auth');
const { validate } = require('../../../middleware/validate');
const v = require('../validations/attendance.validation');

router.use(authenticate);

// Dashboard (Image 2)
router.get('/dashboard/kpis', ctrl.getDashboardKPIs);
router.get('/dashboard/today', ctrl.getTodayStatus);
router.get('/dashboard/recent-activity', ctrl.getRecentActivity);

// Clock In/Out
router.post('/check-in', validate(v.checkInSchema), ctrl.checkIn);
router.post('/check-out', validate(v.checkOutSchema), ctrl.checkOut);

// Attendance Records
router.get('/', authorize('Manager', 'HR', 'Payroll', 'Admin'), validate(v.attendanceQuerySchema, 'query'), ctrl.listAttendance);
router.post('/manual', authorize('HR', 'Admin'), validate(v.manualAttendanceSchema), ctrl.createManualAttendance);

// Calendar View
router.get('/calendar/me', ctrl.getAttendanceCalendar);
router.get('/calendar/:employeeId', authorize('Manager', 'HR', 'Admin'), ctrl.getAttendanceCalendar);

// Correction Requests
router.post('/:attendanceId/corrections', validate(v.correctionRequestSchema), ctrl.submitCorrectionRequest);
router.get('/corrections', authorize('Manager', 'HR', 'Admin'), ctrl.listCorrectionRequests);
router.patch('/corrections/:correctionId', authorize('Manager', 'HR', 'Admin'), validate(v.reviewCorrectionSchema), ctrl.reviewCorrectionRequest);

// Overtime Requests
router.post('/overtime', authorize('Manager', 'HR', 'Admin'), validate(v.overtimeRequestSchema), ctrl.submitOvertimeRequest);
router.patch('/overtime/:id/decision', authorize('Manager', 'HR', 'Admin'), ctrl.approveOvertimeRequest);

// Shifts & Schedules
router.get('/shifts', ctrl.listShifts);
router.post('/shifts/assign', authorize('HR', 'Admin'), validate(v.shiftAssignmentSchema), ctrl.assignShift);

// Attendance Summary
router.get('/summary/me', ctrl.getAttendanceSummary);
router.get('/summary/:employeeId', authorize('Manager', 'HR', 'Payroll', 'Admin'), ctrl.getAttendanceSummary);
router.post('/summary/:employeeId/:year/:month/generate', authorize('HR', 'Payroll', 'Admin'), ctrl.generateSummary);

// Single record (must be after named routes)
router.get('/:id', ctrl.getAttendanceRecord);

module.exports = router;
