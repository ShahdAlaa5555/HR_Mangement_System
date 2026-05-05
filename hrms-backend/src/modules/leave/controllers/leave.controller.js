/**
 * src/modules/leave/controllers/leave.controller.js
 */
const service = require('../services/leave.service');
const { sendSuccess } = require('../../../middleware/validate');

// Safely parse employee ID from JWT — handles both number and string
const uid = (req) => parseInt(req.user?.id ?? req.user?.employeeId ?? req.user?.EmployeeID, 10);

async function listLeaveTypes(req, res) {
  return sendSuccess(res, await service.listLeaveTypes());
}
async function createLeaveType(req, res) {
  return sendSuccess(res, await service.createLeaveType(req.body), 201);
}
async function listLeavePolicies(req, res) {
  return sendSuccess(res, await service.listLeavePolicies(req.query));
}
async function createLeavePolicy(req, res) {
  return sendSuccess(res, await service.createLeavePolicy(req.body), 201);
}
async function getMyLeaveBalances(req, res) {
  const year = parseInt(req.query.year, 10) || undefined;
  return sendSuccess(res, await service.getLeaveBalanceDashboard(uid(req), year));
}
async function initializeBalances(req, res) {
  return sendSuccess(res, await service.initializeLeaveBalances(parseInt(req.body.EmployeeID, 10), parseInt(req.body.BalanceYear, 10)), 201);
}
async function adjustBalance(req, res) {
  return sendSuccess(res, await service.adjustLeaveBalance(req.body, uid(req)));
}
async function submitLeaveRequest(req, res) {
  return sendSuccess(res, await service.submitLeaveRequest(uid(req), req.body), 201);
}
async function getMyLeaveRequests(req, res) {
  const employeeId = uid(req);
  console.log('[leave] getMyLeaveRequests employeeId=', employeeId, 'query=', req.query);
  const result = await service.getMyLeaveRequests(employeeId, req.query);
  console.log('[leave] getMyLeaveRequests found', result.requests?.length, 'requests');
  return sendSuccess(res, result.requests, 200, result.meta);
}
async function listAllLeaveRequests(req, res) {
  const roleStr = (req.user?.role || '').toUpperCase();
  // HR and Admin see ALL requests; Managers only see their department's requests
  const isHRorAdmin = roleStr.includes('HR') || roleStr.includes('ADMIN');
  const query = { ...req.query };
  if (!isHRorAdmin) query.managerId = uid(req);  // scope to manager's dept + subordinates
  const result = await service.listLeaveRequests(query);
  return sendSuccess(res, result.requests, 200, result.meta);
}
async function getLeaveRequest(req, res) {
  return sendSuccess(res, await service.getLeaveRequestById(parseInt(req.params.id, 10)));
}
async function approveReject(req, res) {
  return sendSuccess(res, await service.processApproval(parseInt(req.params.id, 10), uid(req), req.body));
}
async function cancelLeave(req, res) {
  return sendSuccess(res, await service.cancelLeaveRequest(parseInt(req.params.id, 10), uid(req), req.body));
}
async function delegateApproval(req, res) {
  return sendSuccess(res, await service.delegateApproval(parseInt(req.params.id, 10), uid(req), req.body));
}
async function getManagerInbox(req, res) {
  const result = await service.getManagerInbox(uid(req), req.query);
  return sendSuccess(res, result.requests, 200, result.meta);
}
async function listHolidays(req, res) {
  return sendSuccess(res, await service.listHolidays(req.query));
}
async function createHoliday(req, res) {
  return sendSuccess(res, await service.createHoliday(req.body), 201);
}
async function getLeaveAnalytics(req, res) {
  return sendSuccess(res, await service.getLeaveAnalytics(req.query));
}

module.exports = {
  listLeaveTypes, createLeaveType, listLeavePolicies, createLeavePolicy,
  getMyLeaveBalances, initializeBalances, adjustBalance,
  submitLeaveRequest, getMyLeaveRequests, listAllLeaveRequests, getLeaveRequest,
  approveReject, cancelLeave, delegateApproval, getManagerInbox,
  listHolidays, createHoliday, getLeaveAnalytics,
};