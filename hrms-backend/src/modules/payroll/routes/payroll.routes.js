/**
 * src/modules/payroll/routes/payroll.routes.js
 * Base prefix: /api/v1/payroll
 */
const router = require('express').Router();
const ctrl = require('../controllers/payroll.controller');
const { authenticate, authorize } = require('../../../middleware/auth');
const { validate } = require('../../../middleware/validate');
const v = require('../validations/payroll.validation');

router.use(authenticate);

// Dashboard (Image 3 — stats cards + recent activity)
router.get('/dashboard', authorize('Payroll', 'HR', 'Admin'), ctrl.getDashboard);

// Config
router.get('/pay-grades', ctrl.listPayGrades);
router.post('/pay-grades', authorize('HR', 'Payroll', 'Admin'), validate(v.createPayGradeSchema), ctrl.createPayGrade);
router.get('/pay-types', ctrl.listPayTypes);
router.post('/pay-types', authorize('HR', 'Payroll', 'Admin'), validate(v.createPayTypeSchema), ctrl.createPayType);
router.get('/overtime-rules', ctrl.listOvertimeRules);
router.post('/overtime-rules', authorize('HR', 'Payroll', 'Admin'), validate(v.createOvertimeRuleSchema), ctrl.createOvertimeRule);
router.get('/allowances', ctrl.listAllowances);
router.get('/shift-differentials', ctrl.listShiftDifferentials);

// Payroll Policies
router.get('/policies', authorize('Payroll', 'HR', 'Admin'), ctrl.listPolicies);
router.post('/policies', authorize('Payroll', 'HR', 'Admin'), validate(v.createPayrollPolicySchema), ctrl.createPolicy);

// Payroll Runs
router.get('/runs', authorize('Payroll', 'HR', 'Admin'), validate(v.payrollRunQuerySchema, 'query'), ctrl.listRuns);
router.post('/runs', authorize('Payroll', 'HR', 'Admin'), validate(v.createPayrollRunSchema), ctrl.createRun);
router.get('/runs/:id', authorize('Payroll', 'HR', 'Admin'), ctrl.getRun);
router.post('/runs/:id/process', authorize('Payroll', 'Admin'), validate(v.processPayrollRunSchema), ctrl.processRun);
router.post('/runs/:id/approve', authorize('HR', 'Admin'), validate(v.approvePayrollRunSchema), ctrl.approveRun);
router.post('/runs/:id/finalize', authorize('Payroll', 'Admin'), ctrl.finalizeRun);
router.post('/runs/:id/payslips', authorize('Payroll', 'Admin'), ctrl.generatePayslips);
router.post('/runs/:runId/bank-file', authorize('Payroll', 'Admin'), validate(v.generateBankFileSchema), ctrl.generateBankFile);

// Exceptions (Image 3 sidebar)
router.get('/exceptions', authorize('Payroll', 'HR', 'Admin'), ctrl.listExceptions);
router.patch('/exceptions/:id/resolve', authorize('Payroll', 'HR', 'Admin'), validate(v.resolveExceptionSchema), ctrl.resolveException);

// Payslips (Employee Portal + Finalized Payslips sidebar)
router.get('/payslips/me', ctrl.getMyPayslips);
router.get('/payslips/:id', ctrl.getPayslip);

module.exports = router;
