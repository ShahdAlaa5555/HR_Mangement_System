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

module.exports = {
  getDashboard, listPayGrades, createPayGrade, listPayTypes, createPayType,
  listOvertimeRules, createOvertimeRule, listAllowances, listShiftDifferentials,
  listPolicies, createPolicy, listRuns, createRun, getRun, processRun,
  approveRun, finalizeRun, generatePayslips, getMyPayslips, getPayslip,
  listExceptions, resolveException, generateBankFile,
};
