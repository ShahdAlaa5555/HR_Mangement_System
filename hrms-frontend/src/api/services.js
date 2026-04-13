// src/api/services.js helper — unwrap { success, data: {...} } envelope
// Used by pages to safely extract the inner payload

/**
 * Unwrap the backend envelope.
 * Backend always returns: { success: true, data: <actual payload> }
 * Axios adds its own .data, so res.data = { success, data: payload }
 * Call unwrap(res) to get the actual payload directly.
 */
export function unwrap(res) {
  const outer = res?.data;
  // If the response has a "data" key that is the real payload, use it
  if (outer && typeof outer === 'object' && 'data' in outer) return outer.data;
  return outer;
}

/**
 * Safely get an array from a response, trying multiple possible keys.
 * e.g. safeArray(res, ['balances','items','data']) → first array found
 */
export function safeArray(res, keys = []) {
  const payload = unwrap(res);
  if (Array.isArray(payload)) return payload;
  for (const k of keys) {
    if (Array.isArray(payload?.[k])) return payload[k];
  }
  return [];
}

import api from './axios';

// ─── AUTH ──────────────────────────────────────────────────────────────────
export const authAPI = {
  login:          (data) => api.post('/auth/login', data),
  refresh:        (data) => api.post('/auth/refresh', data),
  me:             ()     => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
};

// ─── EMPLOYEES ─────────────────────────────────────────────────────────────
export const employeeAPI = {
  list:               (params) => api.get('/employees', { params }),
  get:                (id)     => api.get(`/employees/${id}`),
  getMe:              ()       => api.get('/employees/me'),
  create:             (data)   => api.post('/employees', data),
  update:             (id, data) => api.patch(`/employees/${id}`, data),
  terminate:          (id, data) => api.post(`/employees/${id}/terminate`, data),
  getDepartments:     ()       => api.get('/employees/departments'),
  createDepartment:   (data)   => api.post('/employees/departments', data),
  getPositions:       ()       => api.get('/employees/positions'),
  createPosition:     (data)   => api.post('/employees/positions', data),
  getWorkLocations:   ()       => api.get('/employees/work-locations'),
  getSalaryHistory:   (id)     => api.get(`/employees/${id}/salary`),
  createSalaryRecord: (id, d)  => api.post(`/employees/${id}/salary`, d),
  getAuditLog:        (id)     => api.get(`/employees/${id}/audit`),
  getOrgChart:        (id)     => api.get(`/employees/${id}/org-chart`),
  submitChangeRequest:(id, d)  => api.post(`/employees/${id}/change-requests`, d),
  listMyChangeRequests:()      => api.get('/employees/me/change-requests'),
  reviewChangeRequest:(rId, d) => api.patch(`/employees/change-requests/${rId}`, d),
  getNotifications:   (p)      => api.get('/employees/me/notifications', { params: p }),
  markNotificationsRead:(data) => api.patch('/employees/me/notifications/read', data),
};

// ─── ATTENDANCE ─────────────────────────────────────────────────────────────
export const attendanceAPI = {
  getDashboardKPIs:       ()       => api.get('/attendance/dashboard/kpis'),
  getTodayStatus:         ()       => api.get('/attendance/dashboard/today'),
  getRecentActivity:      ()       => api.get('/attendance/dashboard/recent-activity'),
  checkIn:                (data)   => api.post('/attendance/check-in', data),
  checkOut:               (data)   => api.post('/attendance/check-out', data),
  list:                   (params) => api.get('/attendance', { params }),
  createManual:           (data)   => api.post('/attendance/manual', data),
  getCalendarMe:          (params) => api.get('/attendance/calendar/me', { params }),
  getCalendar:            (id, p)  => api.get(`/attendance/calendar/${id}`, { params: p }),
  getRecord:              (id)     => api.get(`/attendance/${id}`),
  submitCorrection:       (id, d)  => api.post(`/attendance/${id}/corrections`, d),
  listCorrections:        (p)      => api.get('/attendance/corrections', { params: p }),
  reviewCorrection:       (id, d)  => api.patch(`/attendance/corrections/${id}`, d),
  submitOvertime:         (data)   => api.post('/attendance/overtime', data),
  approveOvertime:        (id, d)  => api.patch(`/attendance/overtime/${id}/decision`, d),
  listShifts:             ()       => api.get('/attendance/shifts'),
  assignShift:            (data)   => api.post('/attendance/shifts/assign', data),
  getSummaryMe:           ()       => api.get('/attendance/summary/me'),
  getSummary:             (id)     => api.get(`/attendance/summary/${id}`),
  generateSummary:        (id,y,m) => api.post(`/attendance/summary/${id}/${y}/${m}/generate`),
};

// ─── LEAVE ──────────────────────────────────────────────────────────────────
export const leaveAPI = {
  getTypes:           ()       => api.get('/leave/types'),
  createType:         (data)   => api.post('/leave/types', data),
  getPolicies:        ()       => api.get('/leave/policies'),
  getMyBalances:      (params) => api.get('/leave/my/balances', { params }),
  getMyRequests:      (params) => api.get('/leave/my/requests', { params }),
  submit:             (data)   => api.post('/leave/requests', data),
  getManagerInbox:    ()       => api.get('/leave/inbox'),
  listAll:            (params) => api.get('/leave/requests', { params }),
  getRequest:         (id)     => api.get(`/leave/requests/${id}`),
  approveReject:      (id, d)  => api.patch(`/leave/requests/${id}/approve`, d),
  cancel:             (id, d)  => api.patch(`/leave/requests/${id}/cancel`, d),
  delegate:           (id, d)  => api.patch(`/leave/requests/${id}/delegate`, d),
  initializeBalances: (data)   => api.post('/leave/balances/initialize', data),
  adjustBalance:      (data)   => api.post('/leave/balances/adjust', data),
  getHolidays:        ()       => api.get('/leave/holidays'),
  createHoliday:      (data)   => api.post('/leave/holidays', data),
  getAnalytics:       ()       => api.get('/leave/analytics'),
};

// ─── PAYROLL ─────────────────────────────────────────────────────────────────
export const payrollAPI = {
  getDashboard:       ()       => api.get('/payroll/dashboard'),
  getPayGrades:       ()       => api.get('/payroll/pay-grades'),
  createPayGrade:     (data)   => api.post('/payroll/pay-grades', data),
  getPayTypes:        ()       => api.get('/payroll/pay-types'),
  getOvertimeRules:   ()       => api.get('/payroll/overtime-rules'),
  getAllowances:       ()       => api.get('/payroll/allowances'),
  getShiftDiffs:      ()       => api.get('/payroll/shift-differentials'),
  getPolicies:        ()       => api.get('/payroll/policies'),
  createPolicy:       (data)   => api.post('/payroll/policies', data),
  listRuns:           (params) => api.get('/payroll/runs', { params }),
  createRun:          (data)   => api.post('/payroll/runs', data),
  getRun:             (id)     => api.get(`/payroll/runs/${id}`),
  processRun:         (id, d)  => api.post(`/payroll/runs/${id}/process`, d),
  approveRun:         (id, d)  => api.post(`/payroll/runs/${id}/approve`, d),
  finalizeRun:        (id)     => api.post(`/payroll/runs/${id}/finalize`),
  generatePayslips:   (id)     => api.post(`/payroll/runs/${id}/payslips`),
  generateBankFile:   (id, d)  => api.post(`/payroll/runs/${id}/bank-file`, d),
  listExceptions:     ()       => api.get('/payroll/exceptions'),
  resolveException:   (id, d)  => api.patch(`/payroll/exceptions/${id}/resolve`, d),
  getMyPayslips:      ()       => api.get('/payroll/payslips/me'),
  getPayslip:         (id)     => api.get(`/payroll/payslips/${id}`),
};