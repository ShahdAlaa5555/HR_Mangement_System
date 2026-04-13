/**
 * src/modules/employee/services/employee.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Employee Module — Service Layer
 *
 * THESIS NOTE — Service Layer Responsibility:
 * The service layer contains ALL business logic. Controllers are kept thin
 * (parse request → call service → send response). This separation means:
 *   1. Business logic can be unit-tested without HTTP context
 *   2. The same logic can be called from multiple controllers or cron jobs
 *   3. Database transactions are managed here, not in controllers
 *
 * Key Design Decisions:
 *   • Auto-generate FullName from FirstName + LastName on every write
 *   • EmployeeChangeRequest workflow: employees cannot directly edit sensitive
 *     fields (department, position, salary) — they submit requests reviewed by HR
 *   • EmployeeAuditLog captures every field change for compliance
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
  if (departmentId) where.DepartmentID = departmentId;
  if (positionId) where.PositionID = positionId;
  if (employmentType) where.EmploymentType = employmentType;
  if (status) where.CurrentStatus = status;
  if (workLocationId) where.WorkLocationID = workLocationId;
  if (supervisorId) where.SupervisorID = supervisorId;
  if (isActive !== undefined) where.IsActive = isActive;

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
        Email: true,
        Phone: true,
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
        where: { EffectiveTo: null }, // Current salary only
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
        select: {
          EmployeeID: true,
          FullName: true,
          Email: true,
          PhotoURL: true,
        },
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
  // Check for duplicate code/email
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

  // Validate department, position, work location existence
  const [dept, pos, loc] = await Promise.all([
    prisma.department.findUnique({ where: { DepartmentID: data.DepartmentID } }),
    prisma.position.findUnique({ where: { PositionID: data.PositionID } }),
    prisma.workLocation.findUnique({ where: { WorkLocationID: data.WorkLocationID } }),
  ]);
  if (!dept) throw new AppError('Department not found.', 400, 'INVALID_REFERENCE');
  if (!pos) throw new AppError('Position not found.', 400, 'INVALID_REFERENCE');
  if (!loc) throw new AppError('Work location not found.', 400, 'INVALID_REFERENCE');

  // Validate supervisor if provided
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

  // Audit log
  await prisma.employeeAuditLog.create({
    data: {
      EmployeeID: employee.EmployeeID,
      ChangedBy: createdByAdminId,
      ChangeType: 'Created',
      NewValue: JSON.stringify({ EmployeeCode: employee.EmployeeCode, FullName: employee.FullName }),
    },
  });

  return employee;
}

async function updateEmployee(employeeId, data, updatedById, ipAddress) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  // Rebuild full name if name fields changed
  const updatedData = { ...data };
  if (data.FirstName || data.LastName) {
    updatedData.FullName = `${data.FirstName || employee.FirstName} ${data.LastName || employee.LastName}`;
  }
  updatedData.UpdatedAt = new Date();

  // Audit log each changed field
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

// ─── Change Requests (self-service UI: "Edit Request" button) ─────────────────

async function submitChangeRequest(employeeId, requestedById, data) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  // Capture old value for audit
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

  // Notify HR about the change request
  const hrEmployees = await prisma.employee.findMany({
    where: { PositionID: { in: [] }, IsActive: true }, // Extend: filter by HR role
    select: { EmployeeID: true },
  });

  await notify({
    recipientId: employeeId, // Also notify the requester
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

async function reviewChangeRequest(changeRequestId, reviewerId, { Status, ReviewNote }) {
  const request = await prisma.employeeChangeRequest.findUnique({
    where: { ChangeRequestID: changeRequestId },
    include: { Employee: true },
  });
  if (!request) throw new AppError('Change request not found.', 404, 'NOT_FOUND');
  if (request.Status !== CHANGE_REQUEST_STATUS.PENDING) {
    throw new AppError('This request has already been reviewed.', 400, 'ALREADY_REVIEWED');
  }

  const ops = [
    prisma.employeeChangeRequest.update({
      where: { ChangeRequestID: changeRequestId },
      data: {
        Status,
        ReviewedBy: reviewerId,
        ReviewNote: ReviewNote || null,
        ReviewedAt: new Date(),
      },
    }),
  ];

  // If approved, apply the change to the employee record
  if (Status === CHANGE_REQUEST_STATUS.APPROVED) {
    const updateData = { [request.FieldName]: request.NewValue, UpdatedAt: new Date() };
    // Rebuild FullName if a name field changes
    if (request.FieldName === 'FirstName' || request.FieldName === 'LastName') {
      const emp = request.Employee;
      updateData.FullName = request.FieldName === 'FirstName'
        ? `${request.NewValue} ${emp.LastName}`
        : `${emp.FirstName} ${request.NewValue}`;
    }
    ops.push(
      prisma.employee.update({ where: { EmployeeID: request.EmployeeID }, data: updateData })
    );
    ops.push(
      prisma.employeeAuditLog.create({
        data: {
          EmployeeID: request.EmployeeID,
          ChangedBy: reviewerId,
          ChangeType: 'ChangeRequestApproved',
          FieldChanged: request.FieldName,
          OldValue: request.OldValue,
          NewValue: request.NewValue,
        },
      })
    );
  }

  const [updated] = await prisma.$transaction(ops);

  await notify({
    recipientId: request.EmployeeID,
    eventCode: Status === CHANGE_REQUEST_STATUS.APPROVED
      ? EVENT_CODE.EMP_CHANGE_APPROVED
      : EVENT_CODE.EMP_CHANGE_REQUEST,
    title: `Change Request ${Status}`,
    body: `Your request to update '${request.FieldName}' has been ${Status.toLowerCase()}.${ReviewNote ? ` Note: ${ReviewNote}` : ''}`,
    sourceModule: 'Employee',
    sourceEntityId: changeRequestId,
  });

  return updated;
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
      include: {
        ChangedByEmp: { select: { FullName: true, EmployeeCode: true } },
      },
    }),
    prisma.employeeAuditLog.count({ where: { EmployeeID: employeeId } }),
  ]);

  return { logs, meta: buildPaginationMeta(total, page, limit) };
}

// ─── Org Chart (hierarchy) ────────────────────────────────────────────────────

async function getOrgChart(rootEmployeeId) {
  // Recursive org chart: fetch employee + all direct reports (2 levels)
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

// ─── Departments & Positions ──────────────────────────────────────────────────

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

async function createDepartment(data) {
  return prisma.department.create({ data });
}

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
    include: {
      PayGrade: true,
      _count: { select: { Employees: { where: { IsActive: true } } } },
    },
    orderBy: { PositionTitle: 'asc' },
  });
}

async function createPosition(data) {
  return prisma.position.create({ data });
}

// ─── Salary History ───────────────────────────────────────────────────────────

async function getSalaryHistory(employeeId) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  return prisma.employeeSalary.findMany({
    where: { EmployeeID: employeeId },
    orderBy: { EffectiveFrom: 'desc' },
    include: {
      PayGrade: true,
      Approver: { select: { FullName: true } },
    },
  });
}

async function createSalaryRecord(employeeId, data, approvedById) {
  const employee = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  const payGrade = await prisma.payGrade.findUnique({ where: { PayGradeID: data.PayGradeID } });
  if (!payGrade) throw new AppError('Pay grade not found.', 400, 'INVALID_REFERENCE');

  // Validate salary is within pay grade bounds
  if (data.BaseSalary < Number(payGrade.MinSalary) || data.BaseSalary > Number(payGrade.MaxSalary)) {
    throw new AppError(
      `Base salary must be between ${payGrade.MinSalary} and ${payGrade.MaxSalary} for grade '${payGrade.GradeName}'.`,
      400,
      'SALARY_OUT_OF_RANGE'
    );
  }

  // Close the previous salary record
  await prisma.employeeSalary.updateMany({
    where: { EmployeeID: employeeId, EffectiveTo: null },
    data: { EffectiveTo: new Date(data.EffectiveFrom) },
  });

  return prisma.employeeSalary.create({
    data: {
      EmployeeID: employeeId,
      PayGradeID: data.PayGradeID,
      BaseSalary: data.BaseSalary,
      CurrencyCode: data.CurrencyCode || 'EGP',
      EffectiveFrom: new Date(data.EffectiveFrom),
      EffectiveTo: data.EffectiveTo ? new Date(data.EffectiveTo) : null,
      ChangeReason: data.ChangeReason || null,
      ApprovedBy: approvedById,
    },
    include: { PayGrade: true },
  });
}

// ─── Work Locations ───────────────────────────────────────────────────────────

async function listWorkLocations() {
  return prisma.workLocation.findMany({
    where: { IsActive: true },
    orderBy: { LocationName: 'asc' },
  });
}

// ─── Notifications ────────────────────────────────────────────────────────────

async function getMyNotifications(employeeId, query) {
  const { page, limit, skip } = getPagination(query);
  const where = { RecipientID: employeeId };
  if (query.unreadOnly === 'true') where.IsRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take: limit,
      orderBy: { CreatedAt: 'desc' },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { RecipientID: employeeId, IsRead: false } }),
  ]);

  return { notifications, unreadCount, meta: buildPaginationMeta(total, page, limit) };
}

async function markNotificationsRead(employeeId, notificationIds) {
  await prisma.notification.updateMany({
    where: {
      NotificationID: { in: notificationIds },
      RecipientID: employeeId,
    },
    data: { IsRead: true },
  });
}

module.exports = {
  listEmployees,
  getEmployeeById,
  getEmployeeProfile,
  createEmployee,
  updateEmployee,
  terminateEmployee,
  submitChangeRequest,
  listChangeRequests,
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
