/**
 * src/modules/employee/controllers/employee.controller.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Employee Module — Controller Layer
 *
 * THESIS NOTE — Controller Responsibility:
 * Controllers are intentionally thin. Each function:
 * 1. Extracts parameters from the request
 * 2. Calls the corresponding service function
 * 3. Returns a standardized response
 *
 * Error handling is NOT done here — all errors propagate to the
 * centralized errorHandler middleware via `express-async-errors`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const service = require('../services/employee.service');
const { sendSuccess } = require('../../../middleware/validate');
const PDFDocument = require('pdfkit');

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

async function reactivateEmployee(req, res) {
  const result = await service.reactivateEmployee(
    parseInt(req.params.id, 10),
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
// ADD THIS RIGHT BEFORE module.exports

// ─── Emergency Contacts ───────────────────────────────────────────────────────
async function getEmergencyContacts(req, res) {
  const contacts = await service.getEmergencyContacts(parseInt(req.params.id, 10));
  return sendSuccess(res, contacts);
}

async function addEmergencyContact(req, res) {
  const contact = await service.addEmergencyContact(parseInt(req.params.id, 10), req.body);
  return sendSuccess(res, contact, 201);
}

async function deleteEmergencyContact(req, res) {
  await service.deleteEmergencyContact(parseInt(req.params.contactId, 10), parseInt(req.params.id, 10));
  return sendSuccess(res, { message: 'Contact deleted successfully' });
}

// ─── Skills ───────────────────────────────────────────────────────────────────
async function getSkills(req, res) {
  const skills = await service.getSkills(parseInt(req.params.id, 10));
  return sendSuccess(res, skills);
}

async function addSkill(req, res) {
  const skill = await service.addSkill(parseInt(req.params.id, 10), req.body);
  return sendSuccess(res, skill, 201);
}

async function deleteSkill(req, res) {
  await service.deleteSkill(parseInt(req.params.skillId, 10), parseInt(req.params.id, 10));
  return sendSuccess(res, { message: 'Skill deleted successfully' });
}

async function getAllPendingChangeRequests(req, res) {
  const requests = await service.getAllPendingChangeRequests(req.query);
  return sendSuccess(res, requests);
}
// Add getAllPendingChangeRequests to module.exports
// ─── Completeness & Documents ────────────────────────────────────────────────
async function getProfileCompleteness(req, res) {
  const result = await service.getProfileCompleteness(parseInt(req.params.id, 10));
  return sendSuccess(res, result);
}

async function sendCompletenessReminder(req, res) {
  const result = await service.sendCompletenessReminder(parseInt(req.params.id, 10), req.user.id);
  return sendSuccess(res, result);
}

async function getDocuments(req, res) {
  const docs = await service.getDocuments(parseInt(req.params.id, 10));
  return sendSuccess(res, docs);
}

async function uploadDocument(req, res) {
  if (!req.file) throw new AppError('No document file uploaded', 400, 'BAD_REQUEST');
  
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/hr_documents/${req.file.filename}`;
  const doc = await service.addDocumentRecord(
    parseInt(req.params.id, 10), 
    req.body, 
    req.user.id, 
    fileUrl
  );
  return sendSuccess(res, doc, 201);
}

async function deleteDocument(req, res) {
  await service.deleteDocument(parseInt(req.params.docId, 10));
  return sendSuccess(res, { message: 'Document deleted' });
}
// ─── Epic 3 Controllers ──────────────────────────────────────────────────────

async function getMyTeam(req, res) {
  const team = await service.getMyTeam(req.user.id);
  return sendSuccess(res, team);
}

async function getEmploymentTimeline(req, res) {
  const timeline = await service.getEmploymentTimeline(parseInt(req.params.id, 10));
  return sendSuccess(res, timeline);
}

async function getEmployeeNotes(req, res) {
  const notes = await service.getEmployeeNotes(parseInt(req.params.id, 10), req.user.id, req.user.role);
  return sendSuccess(res, notes);
}

async function addEmployeeNote(req, res) {
  const note = await service.addEmployeeNote(parseInt(req.params.id, 10), req.user.id, req.body.NoteText);
  return sendSuccess(res, note, 201);
}
// Add this new controller function
async function getTeamPendingChangeRequests(req, res) {
  const requests = await service.getTeamPendingChangeRequests(req.user.id);
  return sendSuccess(res, requests);
}
async function reviewChangeRequest(req, res) {
  const changeRequestId = parseInt(req.params.requestId, 10);
  const reviewerId = req.user.id;
  const reviewerRole = req.user.role || req.user.Role; // Safely grab the role

  // Pass all 4 arguments to the service
  const result = await service.reviewChangeRequest(changeRequestId, reviewerId, reviewerRole, req.body);
  return sendSuccess(res, result);
}
async function updateProfilePhoto(req, res) {
  const empId = parseInt(req.params.id, 10);
  const result = await service.updateProfilePhoto(empId, req.body.PhotoURL);
  return sendSuccess(res, result);
}
// ─── EPIC 4: PDF Generation (Letters & Contracts) ────────────────────────────

// ─── EPIC 4: PDF Generation (Letters & Contracts) ────────────────────────────

async function generateVerificationLetter(req, res) {
  // UPDATED: Using getEmployeeForPdf
  const emp = await service.getEmployeeForPdf(parseInt(req.params.id, 10));
  if (!emp) throw new AppError('Employee not found', 404, 'NOT_FOUND');

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Verification_${emp.EmployeeCode}.pdf`);
  doc.pipe(res);

  doc.fontSize(20).fillColor('#2c3e50').text('Employment Verification Letter', { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(12).fillColor('#000000').text(`Date: ${new Date().toLocaleDateString()}`);
  doc.moveDown();
  doc.text('To Whom It May Concern,');
  doc.moveDown();
  doc.text(`This letter is to certify that ${emp.FullName} (Employee ID: ${emp.EmployeeCode}) is currently employed with us.`);
  doc.moveDown();
  doc.text(`Start Date: ${emp.StartDate ? new Date(emp.StartDate).toLocaleDateString() : 'N/A'}`);
  doc.text(`Position: ${emp.Position?.PositionTitle || 'Staff Member'}`);
  doc.text(`Department: ${emp.Department?.DepartmentName || 'University Department'}`);
  doc.text(`Employment Type: ${emp.EmploymentType || 'Full-Time'}`);
  doc.text(`Current Status: ${emp.CurrentStatus}`);
  doc.moveDown(2);
  doc.text('This document was generated automatically by the University HR System. If you require further verification, please contact the Human Resources Department.');
  doc.moveDown(3);
  doc.text('Sincerely,');
  doc.text('Human Resources Department');
  doc.end();
}

async function generateContract(req, res) {
  // UPDATED: Using getEmployeeForPdf
  const emp = await service.getEmployeeForPdf(parseInt(req.params.id, 10));
  if (!emp) throw new AppError('Employee not found', 404, 'NOT_FOUND');

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Contract_${emp.EmployeeCode}.pdf`);
  doc.pipe(res);

  doc.fontSize(20).fillColor('#2c3e50').text('Employment Offer & Contract', { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(12).fillColor('#000000').text(`This Employment Agreement is officially recorded for ${emp.FullName} as of ${emp.StartDate ? new Date(emp.StartDate).toLocaleDateString() : 'their joining date'}.`);
  doc.moveDown();
  doc.text(`1. Position: You are employed in the capacity of ${emp.Position?.PositionTitle || 'Employee'}.`);
  doc.text(`2. Department: ${emp.Department?.DepartmentName || 'N/A'}.`);
  doc.text(`3. Employment Type: ${emp.EmploymentType || 'Full-Time'}.`);
  doc.moveDown();
  doc.text('This is a system-generated digital copy of the original signed employment agreement maintained in the HR master file.');
  doc.moveDown(4);
  doc.text('_________________________', { continued: true }).text('_________________________', { align: 'right' });
  doc.text('Employer Signature', { continued: true }).text('Employee Signature', { align: 'right' });
  doc.end();
}
async function assignRole(req, res) {
  const result = await service.assignEmployeeRole(parseInt(req.params.id, 10), req.body.role, req.user.id);
  return sendSuccess(res, result);
}
async function getFieldVisibility(req, res) {
  const result = await service.getFieldVisibility();
  return sendSuccess(res, result);
}
async function updateFieldVisibility(req, res) {
  const result = await service.updateFieldVisibility(req.body, req.user.id);
  return sendSuccess(res, result);
}
async function updateEmergencyContact(req, res) {
  const result = await service.updateEmergencyContact(
    parseInt(req.params.id, 10), 
    parseInt(req.params.contactId, 10), 
    req.body
  );
  return sendSuccess(res, result);
}
module.exports = {
  listEmployees,
  updateEmergencyContact,
  assignRole,
  getFieldVisibility,
  generateVerificationLetter,
  updateFieldVisibility,
  getEmployee,
  getMyProfile,
  createEmployee,
  generateContract,
  updateEmployee,
  terminateEmployee,
  reactivateEmployee, // ← ADDED
  submitChangeRequest,
  listMyChangeRequests,
  reviewChangeRequest,
  updateProfilePhoto,
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
   getEmergencyContacts,
  addEmergencyContact,
  deleteEmergencyContact,
  getSkills,
  addSkill,
  deleteSkill,
  addEmployeeNote,
  getEmployeeNotes,
  getEmploymentTimeline,
  getMyTeam,
getTeamPendingChangeRequests,
  getAllPendingChangeRequests,getProfileCompleteness, sendCompletenessReminder, getDocuments, uploadDocument, deleteDocument,
};