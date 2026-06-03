/**
 * src/modules/employee/services/employee.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Employee Module — Service Layer
 * ─────────────────────────────────────────────────────────────────────────────
 */

const prisma = require('../../../config/database');
const { AppError } = require('../../../middleware/errorHandler');
const { notify } = require('../../../shared/utils/notification.util');
const {
  CHANGE_REQUEST_STATUS,
  EVENT_CODE,
  EMPLOYEE_STATUS,
} = require('../../../shared/constants');
const { getPagination, buildPaginationMeta } = require('../../../middleware/validate');

// ─── Employee CRUD ────────────────────────────────────────────────────────────

async function listEmployees(query) {
  const { page, limit, skip } = getPagination(query);
  const {
    search, departmentId, positionId, employmentType, status, workLocationId, supervisorId, isActive,
  } = query;

  const where = {};

  if (search) {
    where.OR = [
      { EmployeeCode: { contains: search } },
      { FullName: { contains: search } },
      { Email: { contains: search } },
    ];
  }

  if (departmentId)   where.DepartmentID   = parseInt(departmentId, 10);
  if (positionId)     where.PositionID     = parseInt(positionId, 10);
  if (workLocationId) where.WorkLocationID = parseInt(workLocationId, 10);
  if (supervisorId)   where.SupervisorID   = parseInt(supervisorId, 10);

  if (status) {
    where.CurrentStatus = status; 
  }

  if (isActive !== undefined) {
    where.IsActive = (isActive === 'true' || isActive === true);
  }

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      skip,
      take: limit,
      orderBy: { CreatedAt: 'desc' },
      select: {
        EmployeeID: true,
        EmployeeCode: true,
        FullName: true,
        FirstName: true,     // 👈 Add this
        LastName: true,      // 👈 Add this
        Email: true,
        Phone: true,
        Gender: true,        // 👈 Add this
  DateOfBirth: true,   // 👈 Add this
  Nationality: true,   // 👈 Add this
  MaritalStatus: true,
        PhotoURL: true,
        EmploymentType: true,
        CurrentStatus: true,
        StartDate: true,
        Department: { select: { DepartmentID: true, DepartmentName: true } },
        Position: { select: { PositionID: true, PositionTitle: true } },
        WorkLocation: { select: { WorkLocationID: true, LocationName: true } },
        Supervisor: { select: { EmployeeID: true, FullName: true } },
      },
    }),
    prisma.employee.count({ where }),
  ]);

  return { employees, meta: buildPaginationMeta(total, page, limit) };
}

async function getEmployeeById(employeeId) {
  const employee = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId },
    include: {
      Department: true,
      Position: { include: { PayGrade: true } },
      WorkLocation: true,
      Supervisor: {
        select: { EmployeeID: true, FullName: true, Email: true, PhotoURL: true },
      },
      Subordinates: {
        select: { EmployeeID: true, FullName: true, PositionID: true },
        where: { IsActive: true },
      },
      Salaries: {
        where: { EffectiveTo: null }, 
        take: 1,
        include: { PayGrade: true },
      },
      Allowances: {
        where: { EffectiveTo: null },
        include: { Allowance: true },
      },
      BankAccounts: { where: { IsActive: true } },
      SpecialStatuses: { where: { ActualEndDate: null } },
    },
  });

  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');
  return employee;
}

async function getEmployeeProfile(employeeId) {
  const employee = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId },
    include: {
      Department: true,
      Position: {
        include: { PayGrade: true },
      },
      WorkLocation: true,
      Supervisor: {
        select: { EmployeeID: true, FullName: true, Email: true, PhotoURL: true },
      },
      Subordinates: {
        where: { IsActive: true },
        select: { EmployeeID: true, FullName: true, PositionID: true },
      },
      Salaries: {
        where: { EffectiveTo: null },
        take: 1,
        include: { PayGrade: true },
      },
      BankAccounts: { where: { IsActive: true } },
      SpecialStatuses: { where: { ActualEndDate: null } },
    },
  });

  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');
  return employee;
}

async function createEmployee(data, createdByAdminId) {
  const existing = await prisma.employee.findFirst({
    where: {
      OR: [{ EmployeeCode: data.EmployeeCode }, { Email: data.Email }],
    },
  });
  if (existing) {
    throw new AppError(
      existing.EmployeeCode === data.EmployeeCode
        ? `Employee code '${data.EmployeeCode}' is already in use.`
        : `Email '${data.Email}' is already registered.`,
      409,
      'DUPLICATE_ENTRY'
    );
  }

  const [dept, pos, loc] = await Promise.all([
    prisma.department.findUnique({ where: { DepartmentID: data.DepartmentID } }),
    prisma.position.findUnique({ where: { PositionID: data.PositionID } }),
    prisma.workLocation.findUnique({ where: { WorkLocationID: data.WorkLocationID } }),
  ]);
  if (!dept) throw new AppError('Department not found.', 400, 'INVALID_REFERENCE');
  if (!pos) throw new AppError('Position not found.', 400, 'INVALID_REFERENCE');
  if (!loc) throw new AppError('Work location not found.', 400, 'INVALID_REFERENCE');

  if (data.SupervisorID) {
    const sup = await prisma.employee.findUnique({ where: { EmployeeID: data.SupervisorID } });
    if (!sup || !sup.IsActive) throw new AppError('Supervisor not found or inactive.', 400, 'INVALID_REFERENCE');
  }

  const fullName = `${data.FirstName} ${data.LastName}`;

  const employee = await prisma.employee.create({
    data: {
      ...data,
      FullName: fullName,
    },
    include: {
      Department: true,
      Position: true,
      WorkLocation: true,
    },
  });

  await prisma.employeeAuditLog.create({
    data: {
      EmployeeID: employee.EmployeeID,
      ChangedBy: createdByAdminId,
      ChangeType: 'Created',
      NewValue: JSON.stringify({ EmployeeCode: employee.EmployeeCode, FullName: employee.FullName }),
    },
  });
// Auto-initialize leave balances for new employee
const { initializeLeaveBalances } = require('../leave/services/leave.service');
const currentYear = new Date().getFullYear();
try {
  await initializeLeaveBalances(employee.EmployeeID, currentYear);
} catch (err) {
  console.error(`Leave balance init failed for ${employee.EmployeeCode}:`, err.message);
}
  return employee;
}

async function updateEmployee(employeeId, data, updatedById, ipAddress) {
  console.log('🔴 RAW req.body RECEIVED IN SERVICE:', JSON.stringify(data));
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');
console.log("DATA RECEIVED:", data);
  const updatedData = { ...data };
  if (data.FirstName || data.LastName) {
    updatedData.FullName = `${data.FirstName || employee.FirstName} ${data.LastName || employee.LastName}`;
  }
  updatedData.UpdatedAt = new Date();

  const auditEntries = Object.keys(data)
    .filter((k) => employee[k] !== undefined && String(employee[k]) !== String(data[k]))
    .map((k) => ({
      EmployeeID: employeeId,
      ChangedBy: updatedById,
      ChangeType: 'Updated',
      FieldChanged: k,
      OldValue: String(employee[k] ?? ''),
      NewValue: String(data[k]),
      IPAddress: ipAddress,
    }));
console.log('🟣 updatedData GOING INTO PRISMA:', JSON.stringify(updatedData));
  const [updated] = await prisma.$transaction([

    prisma.employee.update({
      where: { EmployeeID: employeeId },
      data: updatedData,
      include: { Department: true, Position: true, WorkLocation: true, Supervisor: { select: { FullName: true } } },
    }),
    ...auditEntries.map((e) => prisma.employeeAuditLog.create({ data: e })),
  ]);

  return updated;
}

async function terminateEmployee(employeeId, endDate, updatedById) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');
  if (employee.CurrentStatus === EMPLOYEE_STATUS.TERMINATED) {
    throw new AppError('Employee is already terminated.', 400, 'ALREADY_TERMINATED');
  }

  const updated = await prisma.employee.update({
    where: { EmployeeID: employeeId },
    data: {
      CurrentStatus: EMPLOYEE_STATUS.TERMINATED,
      IsActive: false,
      EndDate: endDate ? new Date(endDate) : new Date(),
      UpdatedAt: new Date(),
    },
  });

  await prisma.employeeAuditLog.create({
    data: {
      EmployeeID: employeeId,
      ChangedBy: updatedById,
      ChangeType: 'Terminated',
      FieldChanged: 'CurrentStatus',
      OldValue: employee.CurrentStatus,
      NewValue: EMPLOYEE_STATUS.TERMINATED,
    },
  });

  return updated;
}

// ── NEW: Reactivate Employee (EM-006) ──
async function reactivateEmployee(employeeId, updatedById) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');
  if (employee.CurrentStatus === EMPLOYEE_STATUS.ACTIVE) {
    throw new AppError('Employee is already active.', 400, 'ALREADY_ACTIVE');
  }

  const updated = await prisma.employee.update({
    where: { EmployeeID: employeeId },
    data: {
      CurrentStatus: EMPLOYEE_STATUS.ACTIVE,
      IsActive: true,
      EndDate: null, 
      UpdatedAt: new Date(),
    },
  });

  await prisma.employeeAuditLog.create({
    data: {
      EmployeeID: employeeId,
      ChangedBy: updatedById,
      ChangeType: 'Reactivated',
      FieldChanged: 'CurrentStatus',
      OldValue: employee.CurrentStatus,
      NewValue: EMPLOYEE_STATUS.ACTIVE,
    },
  });

  return updated;
}

// ─── Change Requests (self-service UI) ─────────────────
async function submitChangeRequest(employeeId, requestedById, data) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  const oldValue = employee[data.FieldName] !== undefined ? String(employee[data.FieldName] ?? '') : null;

  const request = await prisma.employeeChangeRequest.create({
    data: {
      EmployeeID: employeeId,
      RequestedBy: requestedById,
      FieldName: data.FieldName,
      OldValue: oldValue,
      NewValue: data.NewValue,
      Status: CHANGE_REQUEST_STATUS.PENDING,
    },
  });

  await notify({
    recipientId: employeeId,
    eventCode: EVENT_CODE.EMP_CHANGE_REQUEST,
    title: 'Change Request Submitted',
    body: `Your request to update '${data.FieldName}' has been submitted for review.`,
    sourceModule: 'Employee',
    sourceEntityId: request.ChangeRequestID,
  });

  return request;
}

async function listChangeRequests(employeeId, query) {
  const { page, limit, skip } = getPagination(query);
  const where = { EmployeeID: employeeId };
  if (query.status) where.Status = query.status;

  const [requests, total] = await Promise.all([
    prisma.employeeChangeRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { CreatedAt: 'desc' },
      include: {
        Requester: { select: { FullName: true } },
        Reviewer: { select: { FullName: true } },
      },
    }),
    prisma.employeeChangeRequest.count({ where }),
  ]);

  return { requests, meta: buildPaginationMeta(total, page, limit) };
}

async function reviewChangeRequest(changeRequestId, reviewerId, reviewerRole, data) {
  const request = await prisma.employeeChangeRequest.findUnique({
    where: { ChangeRequestID: changeRequestId },
    include: { Employee: true },
  });
  if (!request) throw new AppError('Change request not found.', 404, 'NOT_FOUND');
  
  // SECURITY CHECK: Reviewer must be HR, Admin, OR the direct Supervisor
  if (reviewerRole !== 'HR' && reviewerRole !== 'Admin' && request.Employee.SupervisorID !== reviewerId) {
    throw new AppError('Unauthorized: You can only approve requests for your direct subordinates.', 403, 'FORBIDDEN');
  }

  if (request.Status !== 'Pending') {
    throw new AppError('This request has already been reviewed.', 400, 'ALREADY_REVIEWED');
  }

  const { Status, ReviewNote } = data;

  // Apply the update to the request
  const updatedRequest = await prisma.employeeChangeRequest.update({
    where: { ChangeRequestID: changeRequestId },
    data: { Status, ReviewNote, ReviewedBy: reviewerId, ReviewedAt: new Date() }
  });

  // If approved, update the actual employee record
  if (Status === 'Approved') {
    await prisma.employee.update({
      where: { EmployeeID: request.EmployeeID },
      data: { [request.FieldName]: request.NewValue }
    });
  }

  return updatedRequest;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────
async function getAuditLog(employeeId, query) {
  const { page, limit, skip } = getPagination(query);

  const [logs, total] = await Promise.all([
    prisma.employeeAuditLog.findMany({
      where: { EmployeeID: employeeId },
      skip,
      take: limit,
      orderBy: { ChangedAt: 'desc' },
      include: { ChangedByEmp: { select: { FullName: true, EmployeeCode: true } } },
    }),
    prisma.employeeAuditLog.count({ where: { EmployeeID: employeeId } }),
  ]);

  return { logs, meta: buildPaginationMeta(total, page, limit) };
}

// ─── Org Chart ────────────────────────────────────────────────────────────────
async function getOrgChart(rootEmployeeId) {
  const employee = await prisma.employee.findUnique({
    where: { EmployeeID: rootEmployeeId },
    select: {
      EmployeeID: true, FullName: true, PhotoURL: true,
      Position: { select: { PositionTitle: true } },
      Department: { select: { DepartmentName: true } },
      Subordinates: {
        where: { IsActive: true },
        select: {
          EmployeeID: true, FullName: true, PhotoURL: true,
          Position: { select: { PositionTitle: true } },
          Subordinates: {
            where: { IsActive: true },
            select: { EmployeeID: true, FullName: true, PhotoURL: true, Position: { select: { PositionTitle: true } } },
          },
        },
      },
    },
  });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');
  return employee;
}

// ─── Lookup Data ──────────────────────────────────────────────────────────────
async function listDepartments(query = {}) {
  const where = {};
  if (query.isActive !== undefined) where.IsActive = query.isActive;

  return prisma.department.findMany({
    where,
    include: {
      Manager: { select: { FullName: true } },
      _count: { select: { Employees: { where: { IsActive: true } } } },
    },
    orderBy: { DepartmentName: 'asc' },
  });
}

async function createDepartment(data) { return prisma.department.create({ data }); }

async function updateDepartment(id, data) {
  const dept = await prisma.department.findUnique({ where: { DepartmentID: id } });
  if (!dept) throw new AppError('Department not found.', 404, 'NOT_FOUND');
  return prisma.department.update({ where: { DepartmentID: id }, data: { ...data, UpdatedAt: new Date() } });
}

async function listPositions(query = {}) {
  const where = {};
  if (query.isActive !== undefined) where.IsActive = query.isActive;
  return prisma.position.findMany({
    where,
    include: { PayGrade: true, _count: { select: { Employees: { where: { IsActive: true } } } } },
    orderBy: { PositionTitle: 'asc' },
  });
}

async function createPosition(data) { return prisma.position.create({ data }); }

// ─── Salary History ───────────────────────────────────────────────────────────
async function getSalaryHistory(employeeId) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  return prisma.employeeSalary.findMany({
    where: { EmployeeID: employeeId },
    orderBy: { EffectiveFrom: 'desc' },
    include: { PayGrade: true, Approver: { select: { FullName: true } } },
  });
}

async function createSalaryRecord(employeeId, data, approvedById) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  const payGrade = await prisma.payGrade.findUnique({ where: { PayGradeID: data.PayGradeID } });
  if (!payGrade) throw new AppError('Pay grade not found.', 400, 'INVALID_REFERENCE');

  if (data.BaseSalary < Number(payGrade.MinSalary) || data.BaseSalary > Number(payGrade.MaxSalary)) {
    throw new AppError(`Base salary must be between ${payGrade.MinSalary} and ${payGrade.MaxSalary} for grade '${payGrade.GradeName}'.`, 400, 'SALARY_OUT_OF_RANGE');
  }

  await prisma.employeeSalary.updateMany({
    where: { EmployeeID: employeeId, EffectiveTo: null },
    data: { EffectiveTo: new Date(data.EffectiveFrom) },
  });

  return prisma.employeeSalary.create({
    data: {
      EmployeeID: employeeId, PayGradeID: data.PayGradeID, BaseSalary: data.BaseSalary, CurrencyCode: data.CurrencyCode || 'EGP', EffectiveFrom: new Date(data.EffectiveFrom), EffectiveTo: data.EffectiveTo ? new Date(data.EffectiveTo) : null, ChangeReason: data.ChangeReason || null, ApprovedBy: approvedById,
    },
    include: { PayGrade: true },
  });
}

async function listWorkLocations() {
  return prisma.workLocation.findMany({ where: { IsActive: true }, orderBy: { LocationName: 'asc' } });
}

// ─── Notifications ────────────────────────────────────────────────────────────
async function getMyNotifications(employeeId, query) {
  const { page, limit, skip } = getPagination(query);
  const where = { RecipientID: employeeId };
  if (query.unreadOnly === 'true') where.IsRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, skip, take: limit, orderBy: { CreatedAt: 'desc' } }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { RecipientID: employeeId, IsRead: false } }),
  ]);

  return { notifications, unreadCount, meta: buildPaginationMeta(total, page, limit) };
}

async function markNotificationsRead(employeeId, notificationIds) {
  await prisma.notification.updateMany({
    where: { NotificationID: { in: notificationIds }, RecipientID: employeeId },
    data: { IsRead: true },
  });
}

// ADD THIS RIGHT BEFORE module.exports

// ─── Emergency Contacts (Epic 1) ──────────────────────────────────────────────
async function getEmergencyContacts(employeeId) {
  return prisma.emergencyContact.findMany({
    where: { EmployeeID: employeeId },
    orderBy: [{ IsPrimary: 'desc' }, { CreatedAt: 'asc' }],
  });
}

async function addEmergencyContact(employeeId, data) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  // If new contact is primary, unset existing primary contacts
  if (data.IsPrimary) {
    await prisma.emergencyContact.updateMany({
      where: { EmployeeID: employeeId, IsPrimary: true },
      data: { IsPrimary: false },
    });
  }

  return prisma.emergencyContact.create({
    data: { ...data, EmployeeID: employeeId },
  });
}

async function deleteEmergencyContact(contactId, employeeId) {
  const contact = await prisma.emergencyContact.findFirst({
    where: { ContactID: contactId, EmployeeID: employeeId },
  });
  if (!contact) throw new AppError('Contact not found or unauthorized.', 404, 'NOT_FOUND');

  return prisma.emergencyContact.delete({ where: { ContactID: contactId } });
}

// ─── Skills & Certifications (Epic 1) ─────────────────────────────────────────
async function getSkills(employeeId) {
  return prisma.employeeSkill.findMany({
    where: { EmployeeID: employeeId },
    orderBy: { ProficiencyLevel: 'desc' },
  });
}

async function addSkill(employeeId, data) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  // Check for duplicate skill
  const existing = await prisma.employeeSkill.findFirst({
    where: { EmployeeID: employeeId, SkillName: data.SkillName },
  });
  if (existing) throw new AppError('Skill already exists for this employee.', 400, 'DUPLICATE_SKILL');

  return prisma.employeeSkill.create({
    data: { ...data, EmployeeID: employeeId },
  });
}

async function deleteSkill(skillId, employeeId) {
  const skill = await prisma.employeeSkill.findFirst({
    where: { SkillID: skillId, EmployeeID: employeeId },
  });
  if (!skill) throw new AppError('Skill not found or unauthorized.', 404, 'NOT_FOUND');

  return prisma.employeeSkill.delete({ where: { SkillID: skillId } });
}

// Add this right above module.exports
async function getAllPendingChangeRequests(query) {
  const requests = await prisma.employeeChangeRequest.findMany({
    // REMOVED the 'where: { Status: "Pending" }' so it returns ALL history
    orderBy: { CreatedAt: 'desc' }, // Shows newest requests at the top
    include: {
      Employee: { select: { FullName: true, EmployeeCode: true, PhotoURL: true } }
    }
  });
  return requests;
}
// ─── Profile Completeness & Reminders (EM-002) ──────────────────────────────
async function getProfileCompleteness(employeeId) {
  const emp = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId },
    include: { EmergencyContacts: true, Skills: true }
  });
  if (!emp) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  // Define 10 criteria for a 100% complete profile (10% each)
  const criteria = [
    !!emp.FirstName, !!emp.LastName, !!emp.Email, !!emp.Phone,
    !!emp.Address, !!emp.DateOfBirth, !!emp.Nationality, !!emp.PhotoURL,
    emp.EmergencyContacts.length > 0,
    emp.Skills.length > 0
  ];

  const score = criteria.filter(Boolean).length * 10;
  return { score, isComplete: score === 100 };
}

async function sendCompletenessReminder(employeeId, hrId) {
  const { score } = await getProfileCompleteness(employeeId);
  if (score === 100) throw new AppError('Profile is already 100% complete.', 400, 'BAD_REQUEST');

  await notify({
    recipientId: employeeId,
    eventCode: 'SYSTEM_ALERT', // Using generic event code
    title: 'Action Required: Complete Your Profile',
    body: `Your HR profile is currently only ${score}% complete. Please log in and update your missing information (Photo, Skills, Contacts, etc.).`,
    sourceModule: 'Employee',
    sourceEntityId: hrId,
  });

  return { message: 'Reminder sent successfully', score };
}

// ─── Official Documents (EM-003, EM-013) ──────────────────────────────────────
async function getDocuments(employeeId) {
  return prisma.employeeDocument.findMany({
    where: { EmployeeID: employeeId },
    orderBy: { UploadDate: 'desc' },
  });
}

async function addDocumentRecord(employeeId, data, uploadedById, fileUrl) {
  return prisma.employeeDocument.create({
    data: {
      EmployeeID: employeeId,
      DocumentTitle: data.DocumentTitle,
      DocumentType: data.DocumentType,
      ExpiryDate: data.ExpiryDate ? new Date(data.ExpiryDate) : null,
      FileURL: fileUrl,
      UploadedBy: uploadedById,
    },
  });
}

async function deleteDocument(documentId) {
  return prisma.employeeDocument.delete({ where: { DocumentID: documentId } });
}
// ─── Epic 3: Manager Features & Timeline ──────────────────────────────────────

async function getMyTeam(managerId) {
  // Fetch employees who report to this manager
  const team = await prisma.employee.findMany({
    where: { SupervisorID: managerId, IsActive: true },
    select: {
      EmployeeID: true, EmployeeCode: true, FullName: true, Email: true, Phone: true, PhotoURL: true,
      Position: { select: { PositionTitle: true } },
      Department: { select: { DepartmentName: true } },
      StartDate: true, CurrentStatus: true,
      // We explicitly DO NOT select sensitive fields like BaseSalary, NationalID, etc. here!
    },
    orderBy: { FullName: 'asc' }
  });
  return team;
}

// ─── Epic 3 & 4: Timeline and PDF Helpers ────────────────────────────────────

async function getEmploymentTimeline(employeeId) {
  // 1. Fetch the employee to get their Start Date
  const emp = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId },
    include: { Position: true, Department: true }
  });

  // 2. Fetch actual changes from the Audit Log (Removed strict filters so ALL changes show)
  const events = await prisma.employeeAuditLog.findMany({
    where: { EmployeeID: employeeId },
    orderBy: { ChangedAt: 'desc' },
    include: { ChangedByEmp: { select: { FullName: true } } }
  });

  const timeline = [...events];

  // 3. Always synthesize a "Hired" event so the timeline is never empty!
  if (emp && emp.StartDate) {
    timeline.push({
      ChangedAt: emp.StartDate,
      FieldChanged: 'Hired / Joined',
      OldValue: 'Candidate',
      NewValue: emp.Position?.PositionTitle || 'Employee',
      ChangedByEmp: { FullName: 'System HR' }
    });
  }

  // Sort newest to oldest
  return timeline.sort((a, b) => new Date(b.ChangedAt) - new Date(a.ChangedAt));
}

// Dedicated fetcher for PDFs
async function getEmployeeForPdf(employeeId) {
  return prisma.employee.findUnique({
    where: { EmployeeID: employeeId },
    include: { Position: true, Department: true }
  });
}

async function getEmployeeNotes(employeeId, requestorId, requestorRole) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  // Security Check: Only HR, Admin, or the direct Supervisor can read these notes
  if (requestorRole !== 'Admin' && requestorRole !== 'HR' && employee.SupervisorID !== requestorId) {
    throw new AppError('Unauthorized to view private notes for this employee.', 403, 'FORBIDDEN');
  }

  return prisma.employeeNote.findMany({
    where: { EmployeeID: employeeId },
    orderBy: { CreatedAt: 'desc' },
    include: { Author: { select: { FullName: true, PhotoURL: true } } }
  });
}

async function addEmployeeNote(employeeId, authorId, text) {
  return prisma.employeeNote.create({
    data: {
      EmployeeID: employeeId,
      AuthorID: authorId,
      NoteText: text,
    },
    include: { Author: { select: { FullName: true, PhotoURL: true } } }
  });
}
async function getTeamPendingChangeRequests(managerId) {
  return prisma.employeeChangeRequest.findMany({
    where: { 
      Employee: { SupervisorID: managerId } // Security: Only their direct reports
    },
    orderBy: { CreatedAt: 'desc' },
    include: {
      Employee: { select: { FullName: true, EmployeeCode: true, PhotoURL: true } }
    }
  });
}
async function updateProfilePhoto(employeeId, photoUrl) {
  return prisma.employee.update({
    where: { EmployeeID: employeeId },
    data: { PhotoURL: photoUrl }
  });
}
// ─── Epic 5: Access Control & Permissions ──────────────────────────────────────

async function assignEmployeeRole(employeeId, newRole, hrAdminId) {
  // Assuming roles are stored either on the Employee or an associated UserAccount table.
  // We will update the Employee table directly, or the UserAccount if separated.
  
  // 1. Update the UserAccount linked to the employee
  await prisma.userAccount.updateMany({
    where: { EmployeeID: employeeId },
    data: { Role: newRole }
  });

  // 2. Log the administrative change
  await prisma.employeeAuditLog.create({
    data: {
      EmployeeID: employeeId,
      ChangedBy: hrAdminId,
      ChangeType: 'Role Assignment',
      FieldChanged: 'SystemRole',
      OldValue: 'Previous Role',
      NewValue: newRole,
    },
  });

  return { message: `Role updated to ${newRole} successfully.` };
}

async function getFieldVisibility() {
  // Fetch from a configuration table, or return a default strict matrix
  const config = await prisma.systemConfig.findUnique({
    where: { Key: 'FIELD_VISIBILITY_MATRIX' }
  });
  
  if (config) return JSON.parse(config.Value);

  // Default Fallback Matrix if not set in DB yet
  return {
    EmployeeCode:   { view: ['Admin', 'HR', 'Manager', 'Employee'], edit: ['Admin'] },
    FirstName:      { view: ['Admin', 'HR', 'Manager', 'Employee'], edit: ['Admin', 'HR', 'Employee'] },
    LastName:       { view: ['Admin', 'HR', 'Manager', 'Employee'], edit: ['Admin', 'HR', 'Employee'] },
    Email:          { view: ['Admin', 'HR', 'Manager', 'Employee'], edit: ['Admin', 'HR'] },
    Phone:          { view: ['Admin', 'HR', 'Manager', 'Employee'], edit: ['Admin', 'HR', 'Employee'] },
    DepartmentID:   { view: ['Admin', 'HR', 'Manager', 'Employee'], edit: ['Admin', 'HR'] },
    PositionID:     { view: ['Admin', 'HR', 'Manager', 'Employee'], edit: ['Admin', 'HR'] },
    SupervisorID:   { view: ['Admin', 'HR', 'Manager', 'Employee'], edit: ['Admin', 'HR'] },
    StartDate:      { view: ['Admin', 'HR', 'Manager', 'Employee'], edit: ['Admin', 'HR'] },
    CurrentStatus:  { view: ['Admin', 'HR', 'Manager', 'Employee'], edit: ['Admin', 'HR'] },
  };
}

async function updateFieldVisibility(matrixData, adminId) {
  // Upsert the configuration into the database
  const updated = await prisma.systemConfig.upsert({
    where: { Key: 'FIELD_VISIBILITY_MATRIX' },
    update: { Value: JSON.stringify(matrixData), UpdatedAt: new Date() },
    create: { Key: 'FIELD_VISIBILITY_MATRIX', Value: JSON.stringify(matrixData) }
  });

  // Log the security change
  await prisma.employeeAuditLog.create({
    data: {
      EmployeeID: adminId, // Using admin's ID as the target for system logs
      ChangedBy: adminId,
      ChangeType: 'Security Configuration',
      FieldChanged: 'Field Visibility Matrix',
      OldValue: '',
      NewValue: 'Updated configuration',
    },
  });

  return JSON.parse(updated.Value);
}
async function updateEmergencyContact(employeeId, contactId, data) {
  // If setting as primary, unset others first
  if (data.IsPrimary) {
    await prisma.emergencyContact.updateMany({
      where: { EmployeeID: employeeId, IsPrimary: true },
      data: { IsPrimary: false },
    });
  }

  return prisma.emergencyContact.update({
    where: { ContactID: contactId },
    data: {
      ContactName: data.ContactName,
      Relationship: data.Relationship,
      Phone: data.Phone,
      AltPhone: data.AltPhone,
      IsPrimary: data.IsPrimary
    }
  });
}
// ⚠️ Add updateEmergencyContact to your module.exports!

// ⚠️ IMPORTANT: ADD THESE TO YOUR module.exports AT THE BOTTOM!
// assignEmployeeRole, getFieldVisibility, updateFieldVisibility
module.exports = {
  listEmployees,updateProfilePhoto,updateEmergencyContact,getFieldVisibility,updateFieldVisibility, assignEmployeeRole,getEmployeeForPdf,getProfileCompleteness, getTeamPendingChangeRequests, sendCompletenessReminder, getDocuments, addDocumentRecord, deleteDocument,getAllPendingChangeRequests,
  getEmployeeById,addEmployeeNote,getEmployeeNotes,getEmploymentTimeline,getMyTeam,getAllPendingChangeRequests, getEmployeeProfile, createEmployee, updateEmployee, getEmergencyContacts, addEmergencyContact, deleteEmergencyContact, getSkills, addSkill, deleteSkill, terminateEmployee, reactivateEmployee, submitChangeRequest, listChangeRequests, reviewChangeRequest, getAuditLog, getOrgChart, listDepartments, createDepartment, updateDepartment, listPositions, createPosition, getSalaryHistory, createSalaryRecord, listWorkLocations, getMyNotifications, markNotificationsRead,
};