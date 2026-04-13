/**
 * src/modules/employee/controllers/employee.controller.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Employee Module — Controller Layer
 *
 * THESIS NOTE — Controller Responsibility:
 * Controllers are intentionally thin. Each function:
 *   1. Extracts parameters from the request
 *   2. Calls the corresponding service function
 *   3. Returns a standardized response
 *
 * Error handling is NOT done here — all errors propagate to the
 * centralized errorHandler middleware via `express-async-errors`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const service = require('../services/employee.service');
const { sendSuccess } = require('../../../middleware/validate');

// ─── Employee CRUD ────────────────────────────────────────────────────────────

async function listEmployees(req, res) {
  const result = await service.listEmployees(req.query);
  return sendSuccess(res, result.employees, 200, result.meta);
}

async function getEmployee(req, res) {
  const employee = await service.getEmployeeById(parseInt(req.params.id, 10));
  return sendSuccess(res, employee);
}

async function getMyProfile(req, res) {
  const profile = await service.getEmployeeProfile(req.user.id);
  return sendSuccess(res, profile);
}
 // ← add at TOP of file with other requires

async function createEmployee(req, res) {
  const { password, ...employeeData } = req.body;

  // Use the service layer (handles validation, audit log, etc.)
  const employee = await service.createEmployee(employeeData, req.user.id);

  // Create login credential separately using the same prisma instance as the service
  if (password) {
    const bcrypt    = require('bcryptjs');
    const prisma    = require('../../../config/database');  // ← same as service.js
    const hash      = await bcrypt.hash(password, 10);
    await prisma.userCredential.create({
      data: {
        EmployeeID:   employee.EmployeeID,
        PasswordHash: hash,
        IsActive:     true,
      },
    });
  }

  return sendSuccess(res, employee, 201);
}
async function updateEmployee(req, res) {
  const employee = await service.updateEmployee(
    parseInt(req.params.id, 10),
    req.body,
    req.user.id,
    req.ip
  );
  return sendSuccess(res, employee);
}

async function terminateEmployee(req, res) {
  const result = await service.terminateEmployee(
    parseInt(req.params.id, 10),
    req.body.endDate,
    req.user.id
  );
  return sendSuccess(res, result);
}

// ─── Change Requests ──────────────────────────────────────────────────────────

async function submitChangeRequest(req, res) {
  const employeeId = parseInt(req.params.id, 10);
  const request = await service.submitChangeRequest(employeeId, req.user.id, req.body);
  return sendSuccess(res, request, 201);
}

async function listMyChangeRequests(req, res) {
  const result = await service.listChangeRequests(req.user.id, req.query);
  return sendSuccess(res, result.requests, 200, result.meta);
}

async function reviewChangeRequest(req, res) {
  const updated = await service.reviewChangeRequest(
    parseInt(req.params.requestId, 10),
    req.user.id,
    req.body
  );
  return sendSuccess(res, updated);
}

// ─── Audit ────────────────────────────────────────────────────────────────────

async function getAuditLog(req, res) {
  const result = await service.getAuditLog(parseInt(req.params.id, 10), req.query);
  return sendSuccess(res, result.logs, 200, result.meta);
}

// ─── Org Chart ────────────────────────────────────────────────────────────────

async function getOrgChart(req, res) {
  const rootId = req.params.id ? parseInt(req.params.id, 10) : req.user.id;
  const chart = await service.getOrgChart(rootId);
  return sendSuccess(res, chart);
}

// ─── Departments ──────────────────────────────────────────────────────────────

async function listDepartments(req, res) {
  const depts = await service.listDepartments(req.query);
  return sendSuccess(res, depts);
}

async function createDepartment(req, res) {
  const dept = await service.createDepartment(req.body);
  return sendSuccess(res, dept, 201);
}

async function updateDepartment(req, res) {
  const dept = await service.updateDepartment(parseInt(req.params.id, 10), req.body);
  return sendSuccess(res, dept);
}

// ─── Positions ────────────────────────────────────────────────────────────────

async function listPositions(req, res) {
  const positions = await service.listPositions(req.query);
  return sendSuccess(res, positions);
}

async function createPosition(req, res) {
  const position = await service.createPosition(req.body);
  return sendSuccess(res, position, 201);
}

// ─── Salary ──────────────────────────────────────────────────────────────────

async function getSalaryHistory(req, res) {
  const history = await service.getSalaryHistory(parseInt(req.params.id, 10));
  return sendSuccess(res, history);
}

async function createSalaryRecord(req, res) {
  const record = await service.createSalaryRecord(
    parseInt(req.params.id, 10),
    req.body,
    req.user.id
  );
  return sendSuccess(res, record, 201);
}

// ─── Work Locations ───────────────────────────────────────────────────────────

async function listWorkLocations(req, res) {
  const locations = await service.listWorkLocations();
  return sendSuccess(res, locations);
}

// ─── Notifications ────────────────────────────────────────────────────────────

async function getMyNotifications(req, res) {
  const result = await service.getMyNotifications(req.user.id, req.query);
  return sendSuccess(res, result.notifications, 200, {
    ...result.meta,
    unreadCount: result.unreadCount,
  });
}

async function markNotificationsRead(req, res) {
  const ids = req.body.ids; // array of NotificationIDs
  await service.markNotificationsRead(req.user.id, ids);
  return sendSuccess(res, { message: 'Notifications marked as read.' });
}

module.exports = {
  listEmployees,
  getEmployee,
  getMyProfile,
  createEmployee,
  updateEmployee,
  terminateEmployee,
  submitChangeRequest,
  listMyChangeRequests,
  reviewChangeRequest,
  getAuditLog,
  getOrgChart,
  listDepartments,
  createDepartment,
  updateDepartment,
  listPositions,
  createPosition,
  getSalaryHistory,
  createSalaryRecord,
  listWorkLocations,
  getMyNotifications,
  markNotificationsRead,
};
