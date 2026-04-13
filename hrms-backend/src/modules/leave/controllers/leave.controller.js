/**
 * src/modules/leave/controllers/leave.controller.js
 */
const service = require('../services/leave.service');
const { sendSuccess } = require('../../../middleware/validate');

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
  return sendSuccess(res, await service.getLeaveBalanceDashboard(req.user.id, year));
}
async function initializeBalances(req, res) {
  return sendSuccess(res, await service.initializeLeaveBalances(req.body.EmployeeID, req.body.BalanceYear), 201);
}
async function adjustBalance(req, res) {
  return sendSuccess(res, await service.adjustLeaveBalance(req.body, req.user.id));
}
async function submitLeaveRequest(req, res) {
  return sendSuccess(res, await service.submitLeaveRequest(req.user.id, req.body), 201);
}
async function getMyLeaveRequests(req, res) {
  const result = await service.getMyLeaveRequests(req.user.id, req.query);
  return sendSuccess(res, result.requests, 200, result.meta);
}
async function listAllLeaveRequests(req, res) {
  const result = await service.listLeaveRequests(req.query);
  return sendSuccess(res, result.requests, 200, result.meta);
}
async function getLeaveRequest(req, res) {
  return sendSuccess(res, await service.getLeaveRequestById(parseInt(req.params.id, 10)));
}
async function approveReject(req, res) {
  return sendSuccess(res, await service.processApproval(parseInt(req.params.id, 10), req.user.id, req.body));
}
async function cancelLeave(req, res) {
  return sendSuccess(res, await service.cancelLeaveRequest(parseInt(req.params.id, 10), req.user.id, req.body));
}
async function delegateApproval(req, res) {
  return sendSuccess(res, await service.delegateApproval(parseInt(req.params.id, 10), req.user.id, req.body));
}
async function getManagerInbox(req, res) {
  const result = await service.getManagerInbox(req.user.id, req.query);
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
