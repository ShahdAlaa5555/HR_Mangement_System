const service = require('../services/payroll.service');
const { sendSuccess } = require('../../../middleware/validate');

async function getDashboard(req, res) { return sendSuccess(res, await service.getPayrollDashboard()); }
async function listPayGrades(req, res) { return sendSuccess(res, await service.listPayGrades()); }
async function createPayGrade(req, res) { return sendSuccess(res, await service.createPayGrade(req.body), 201); }
async function listPayTypes(req, res) { return sendSuccess(res, await service.listPayTypes()); }
async function createPayType(req, res) { return sendSuccess(res, await service.createPayType(req.body), 201); }
async function listOvertimeRules(req, res) { return sendSuccess(res, await service.listOvertimeRules()); }
async function createOvertimeRule(req, res) { return sendSuccess(res, await service.createOvertimeRule(req.body), 201); }
async function listAllowances(req, res) { return sendSuccess(res, await service.listAllowances()); }
async function listShiftDifferentials(req, res) { return sendSuccess(res, await service.listShiftDifferentials()); }
async function listPolicies(req, res) { return sendSuccess(res, await service.listPayrollPolicies()); }
async function createPolicy(req, res) { return sendSuccess(res, await service.createPayrollPolicy(req.body, req.user.id), 201); }
async function listRuns(req, res) { const r = await service.listPayrollRuns(req.query); return sendSuccess(res, r.runs, 200, r.meta); }
async function createRun(req, res) { return sendSuccess(res, await service.createPayrollRun(req.body, req.user.id), 201); }
async function getRun(req, res) { return sendSuccess(res, await service.getPayrollRunById(parseInt(req.params.id, 10))); }
async function processRun(req, res) { return sendSuccess(res, await service.processPayrollRun(parseInt(req.params.id, 10), req.body, req.user.id)); }
async function approveRun(req, res) { return sendSuccess(res, await service.approvePayrollRun(parseInt(req.params.id, 10), req.user.id)); }
async function finalizeRun(req, res) { return sendSuccess(res, await service.finalizePayrollRun(parseInt(req.params.id, 10))); }
async function generatePayslips(req, res) { return sendSuccess(res, await service.generatePayslips(parseInt(req.params.id, 10))); }
async function getMyPayslips(req, res) { const r = await service.getMyPayslips(req.user.id, req.query); return sendSuccess(res, r.payslips, 200, r.meta); }
async function getPayslip(req, res) { return sendSuccess(res, await service.getPayslipById(parseInt(req.params.id, 10), req.user.id, req.user.role)); }
async function listExceptions(req, res) { const r = await service.listExceptions(req.query); return sendSuccess(res, r.exceptions, 200, r.meta); }
async function resolveException(req, res) { return sendSuccess(res, await service.resolveException(parseInt(req.params.id, 10), req.user.id, req.body)); }
async function generateBankFile(req, res) { return sendSuccess(res, await service.generateBankFile(parseInt(req.params.runId, 10), req.user.id, req.body), 201); }
// Add this to payroll.controller.js
async function getActiveDays(req, res) {
  const { employeeId, periodStart, periodEnd } = req.query;

  if (!employeeId || !periodStart || !periodEnd) {
    return res.status(400).json({ 
      success: false, 
      error: { message: "employeeId, periodStart, and periodEnd are required query parameters" } 
    });
  }

  const data = await service.getEmployeeActiveDays(
    parseInt(employeeId, 10), 
    periodStart, 
    periodEnd
  );

  return sendSuccess(res, data);
}
async function listReimbursements(req, res) {
  const query = { ...req.query };
  // Stakeholder Rule: Employees see only theirs, Admins see all
  if (!['Admin', 'HR', 'Payroll'].includes(req.user.role)) {
    query.employeeId = req.user.id;
  }
  const result = await service.listReimbursements(query);
  return sendSuccess(res, result);
}

async function submitReimbursement(req, res) {
  const result = await service.submitReimbursement(req.user.id, req.body);
  return sendSuccess(res, result, 201);
}

async function actionReimbursement(req, res) {
  const result = await service.resolveReimbursement(
    parseInt(req.params.id, 10), 
    req.user.id, 
    req.body // Contains { status: 'Approved' }
  );
  return sendSuccess(res, result);
}
// Don't forget to export it at the bottom:
// getActiveDays
module.exports = {
  getDashboard, listPayGrades, listReimbursements, submitReimbursement, actionReimbursement,createPayGrade, listPayTypes, createPayType,
  listOvertimeRules, createOvertimeRule, listAllowances, listShiftDifferentials,
  listPolicies, createPolicy, listRuns, createRun, getRun, processRun,getActiveDays,
  approveRun, finalizeRun, generatePayslips, getMyPayslips, getPayslip,
  listExceptions, resolveException, generateBankFile,
};
