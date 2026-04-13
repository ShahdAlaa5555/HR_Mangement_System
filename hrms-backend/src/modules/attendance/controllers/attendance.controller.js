/**
 * src/modules/attendance/controllers/attendance.controller.js
 */

const service = require('../services/attendance.service');
const { sendSuccess } = require('../../../middleware/validate');

async function checkIn(req, res) {
  const result = await service.checkIn(req.user.id, req.body);
  return sendSuccess(res, result, 201);
}

async function checkOut(req, res) {
  const result = await service.checkOut(req.user.id, req.body);
  return sendSuccess(res, result);
}

async function getTodayStatus(req, res) {
  const status = await service.getTodayStatus(req.user.id);
  return sendSuccess(res, status);
}

async function getDashboardKPIs(req, res) {
  const kpis = await service.getDashboardKPIs(req.user.id);
  return sendSuccess(res, kpis);
}

async function listAttendance(req, res) {
  const result = await service.listAttendance(req.query);
  return sendSuccess(res, result.records, 200, result.meta);
}

async function getAttendanceRecord(req, res) {
  const record = await service.getAttendanceRecord(parseInt(req.params.id, 10));
  return sendSuccess(res, record);
}

async function createManualAttendance(req, res) {
  const record = await service.createManualAttendance(req.body, req.user.id);
  return sendSuccess(res, record, 201);
}

async function submitCorrectionRequest(req, res) {
  const correction = await service.submitCorrectionRequest(
    parseInt(req.params.attendanceId, 10),
    req.user.id,
    req.body
  );
  return sendSuccess(res, correction, 201);
}

async function reviewCorrectionRequest(req, res) {
  const updated = await service.reviewCorrectionRequest(
    parseInt(req.params.correctionId, 10),
    req.user.id,
    req.body
  );
  return sendSuccess(res, updated);
}

async function listCorrectionRequests(req, res) {
  const result = await service.listCorrectionRequests(req.query);
  return sendSuccess(res, result.corrections, 200, result.meta);
}

async function submitOvertimeRequest(req, res) {
  const request = await service.submitOvertimeRequest(req.body, req.user.id);
  return sendSuccess(res, request, 201);
}

async function approveOvertimeRequest(req, res) {
  const updated = await service.approveOvertimeRequest(
    parseInt(req.params.id, 10),
    req.user.id,
    req.body.approved
  );
  return sendSuccess(res, updated);
}

async function listShifts(req, res) {
  const shifts = await service.listShifts();
  return sendSuccess(res, shifts);
}

async function assignShift(req, res) {
  const assignment = await service.assignShift(req.body, req.user.id);
  return sendSuccess(res, assignment, 201);
}

async function generateSummary(req, res) {
  const { employeeId, year, month } = req.params;
  const summary = await service.generateAttendanceSummary(
    parseInt(employeeId, 10),
    parseInt(year, 10),
    parseInt(month, 10)
  );
  return sendSuccess(res, summary);
}

async function getAttendanceSummary(req, res) {
  const { year, month } = req.query;
  const employeeId = req.params.employeeId
    ? parseInt(req.params.employeeId, 10)
    : req.user.id;
  const summary = await service.getAttendanceSummary(
    employeeId,
    parseInt(year, 10),
    parseInt(month, 10)
  );
  return sendSuccess(res, summary);
}

async function getRecentActivity(req, res) {
  const activity = await service.getRecentActivity(req.user.id, parseInt(req.query.limit, 10) || 10);
  return sendSuccess(res, activity);
}

async function getAttendanceCalendar(req, res) {
  const employeeId = req.params.employeeId
    ? parseInt(req.params.employeeId, 10)
    : req.user.id;
  const calendar = await service.getAttendanceCalendar(
    employeeId,
    parseInt(req.query.year, 10),
    parseInt(req.query.month, 10)
  );
  return sendSuccess(res, calendar);
}

module.exports = {
  checkIn, checkOut, getTodayStatus, getDashboardKPIs,
  listAttendance, getAttendanceRecord, createManualAttendance,
  submitCorrectionRequest, reviewCorrectionRequest, listCorrectionRequests,
  submitOvertimeRequest, approveOvertimeRequest,
  listShifts, assignShift,
  generateSummary, getAttendanceSummary,
  getRecentActivity, getAttendanceCalendar,
};
