/**
 * src/modules/leave/services/leave.service.js
 * Leave Module — Full Service Layer with multi-step approval workflow,
 * balance management, and cross-module attendance integration.
 */

const prisma = require('../../../config/database');
const { AppError } = require('../../../middleware/errorHandler');
const { notify } = require('../../../shared/utils/notification.util');
const {
  LEAVE_REQUEST_STATUS, LEAVE_APPROVAL_DECISION, LEAVE_ACTION_TYPE,
  EMPLOYEE_STATUS, EVENT_CODE,
} = require('../../../shared/constants');
const {
  countEgyptianBusinessDays, monthsSince, dayjs,
} = require('../../../shared/utils/date.util');
const { markAttendanceAsOnLeave } = require('../../attendance/services/attendance.service');
const { getPagination, buildPaginationMeta } = require('../../../middleware/validate');

// ── Helpers ──────────────────────────────────────────────────────────────────

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

async function getActivePolicy(leaveTypeId, employmentType) {
  const today = new Date();
  return prisma.leavePolicy.findFirst({
    where: {
      LeaveTypeID: leaveTypeId, IsActive: true,
      EffectiveFrom: { lte: today },
      OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: today } }],
    },
    include: { SickLeaveTiers: { orderBy: { TierOrder: 'asc' } } },
    orderBy: [{ EmploymentType: 'desc' }, { EffectiveFrom: 'desc' }],
  });
}

// ── Leave Types & Policies ────────────────────────────────────────────────────

async function listLeaveTypes() {
  return prisma.leaveType.findMany({ where: { IsActive: true }, orderBy: { LeaveTypeName: 'asc' } });
}

async function createLeaveType(data) {
  return prisma.leaveType.create({ data });
}

async function listLeavePolicies(query = {}) {
  const where = { IsActive: true };
  if (query.leaveTypeId) where.LeaveTypeID = query.leaveTypeId;
  return prisma.leavePolicy.findMany({
    where, include: { LeaveType: true, SickLeaveTiers: { orderBy: { TierOrder: 'asc' } } },
    orderBy: { CreatedAt: 'desc' },
  });
}

async function createLeavePolicy(data) {
  return prisma.leavePolicy.create({ data, include: { LeaveType: true } });
}

// ── Leave Balance Dashboard (Image 4) ─────────────────────────────────────────

async function getLeaveBalanceDashboard(employeeId, year) {
  const balanceYear = year || new Date().getFullYear();
  const [balances, leaveTypes] = await Promise.all([
    prisma.leaveBalance.findMany({
      where: { EmployeeID: employeeId, BalanceYear: balanceYear }, include: { LeaveType: true },
    }),
    prisma.leaveType.findMany({ where: { IsActive: true } }),
  ]);

  const balanceMap = new Map(balances.map((b) => [b.LeaveTypeID, b]));
  return leaveTypes.map((lt) => {
    const bal = balanceMap.get(lt.LeaveTypeID);
    if (!bal) return {
      leaveTypeId: lt.LeaveTypeID, leaveTypeName: lt.LeaveTypeName, leaveTypeCode: lt.LeaveTypeCode,
      displayColor: lt.DisplayColor, isPaid: lt.IsPaid, entitledDays: 0, usedDays: 0,
      pendingDays: 0, carryOverDays: 0, adjustedDays: 0, remainingDays: 0, progressPercent: 0,
    };

    const entitled = Number(bal.EntitledDays) + Number(bal.CarryOverDays) + Number(bal.AdjustedDays);
    const used = Number(bal.UsedDays);
    const remaining = entitled - used - Number(bal.PendingDays);
    const progressPercent = entitled > 0 ? Math.round((used / entitled) * 100) : 0;

    return {
      leaveTypeId: lt.LeaveTypeID, leaveTypeName: lt.LeaveTypeName, leaveTypeCode: lt.LeaveTypeCode,
      displayColor: lt.DisplayColor, isPaid: lt.IsPaid,
      entitledDays: Number(bal.EntitledDays), usedDays: used,
      pendingDays: Number(bal.PendingDays), carryOverDays: Number(bal.CarryOverDays),
      adjustedDays: Number(bal.AdjustedDays), remainingDays: Math.max(0, remaining),
      progressPercent, balanceYear,
    };
  });
}

async function initializeLeaveBalances(employeeId, balanceYear) {
  const employee = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId }, select: { EmployeeID: true, StartDate: true, EmploymentType: true },
  });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  const policies = await prisma.leavePolicy.findMany({
    where: {
      IsActive: true,
      EffectiveFrom: { lte: new Date(`${balanceYear}-12-31`) },
      OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: new Date(`${balanceYear}-01-01`) } }],
    },
    include: { LeaveType: true },
  });

  const tenureMonths = monthsSince(employee.StartDate);
  const results = [];

  for (const policy of policies) {
    if (policy.MinTenureMonths > tenureMonths) continue;
    const existing = await prisma.leaveBalance.findUnique({
      where: { UQ_LeaveBalance: { EmployeeID: employeeId, LeaveTypeID: policy.LeaveTypeID, BalanceYear: balanceYear } },
    });
    if (existing) continue;

    let carryOverDays = 0;
    const prevBalance = await prisma.leaveBalance.findUnique({
      where: { UQ_LeaveBalance: { EmployeeID: employeeId, LeaveTypeID: policy.LeaveTypeID, BalanceYear: balanceYear - 1 } },
    });
    if (prevBalance) {
      const prevRemaining = Number(prevBalance.EntitledDays) + Number(prevBalance.CarryOverDays)
        + Number(prevBalance.AdjustedDays) - Number(prevBalance.UsedDays) - Number(prevBalance.PendingDays);
      carryOverDays = Math.min(Math.max(0, prevRemaining), policy.CarryOverLimit);
    }

    let entitledDays = policy.MaxDaysPerYear;
    const startYear = dayjs(employee.StartDate).year();
    if (balanceYear === startYear && policy.FirstYearEntitlementDays !== null) {
      const monthsInYear = 12 - dayjs(employee.StartDate).month();
      entitledDays = Math.round((policy.MaxDaysPerYear / 12) * monthsInYear);
      if (policy.FirstYearEntitlementDays) entitledDays = Math.min(entitledDays, policy.FirstYearEntitlementDays);
    }

    const balance = await prisma.leaveBalance.create({
      data: {
        EmployeeID: employeeId, LeaveTypeID: policy.LeaveTypeID, BalanceYear: balanceYear,
        EntitledDays: entitledDays, UsedDays: 0, PendingDays: 0,
        CarryOverDays: carryOverDays, AdjustedDays: 0,
        CarryOverExpiryYear: carryOverDays > 0 ? balanceYear + policy.CarryOverYears : null,
      },
    });
    results.push(balance);
  }
  return results;
}

async function adjustLeaveBalance(data, adjustedById) {
  const balance = await prisma.leaveBalance.findUnique({
    where: { UQ_LeaveBalance: { EmployeeID: data.EmployeeID, LeaveTypeID: data.LeaveTypeID, BalanceYear: data.BalanceYear } },
  });
  if (!balance) throw new AppError('Leave balance record not found.', 404, 'NOT_FOUND');

  return prisma.leaveBalance.update({
    where: { LeaveBalanceID: balance.LeaveBalanceID },
    data: { AdjustedDays: { increment: data.AdjustedDays }, LastUpdatedAt: new Date() },
  });
}

// ── Leave Request Submission ──────────────────────────────────────────────────

async function submitLeaveRequest(employeeId, data) {
  const employee = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId },
    select: { EmployeeID: true, StartDate: true, EmploymentType: true, SupervisorID: true, FullName: true },
  });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  const leaveType = await prisma.leaveType.findUnique({ where: { LeaveTypeID: data.LeaveTypeID } });
  if (!leaveType || !leaveType.IsActive) throw new AppError('Leave type not found or inactive.', 404, 'NOT_FOUND');

  const policy = await getActivePolicy(data.LeaveTypeID, employee.EmploymentType);
  if (!policy) throw new AppError('No active leave policy found for this leave type and your employment type.', 400, 'NO_POLICY');

  const tenureMonths = monthsSince(employee.StartDate);
  if (tenureMonths < policy.MinTenureMonths) {
    throw new AppError(`You need at least ${policy.MinTenureMonths} months tenure. Current: ${tenureMonths} months.`, 400, 'INSUFFICIENT_TENURE');
  }

  const today = dayjs().startOf('day');
  const startDay = dayjs(data.StartDate).startOf('day');
  if (startDay.diff(today, 'day') < policy.NoticePeriodDays) {
    throw new AppError(`This leave requires ${policy.NoticePeriodDays} days notice. Start from: ${today.add(policy.NoticePeriodDays, 'day').format('YYYY-MM-DD')}.`, 400, 'NOTICE_PERIOD_VIOLATION');
  }

  const overlapping = await prisma.leaveRequest.findFirst({
    where: {
      EmployeeID: employeeId,
      Status: { in: [LEAVE_REQUEST_STATUS.SUBMITTED, LEAVE_REQUEST_STATUS.PENDING_MANAGER, LEAVE_REQUEST_STATUS.PENDING_HR, LEAVE_REQUEST_STATUS.APPROVED] },
      AND: [{ StartDate: { lte: new Date(data.EndDate) } }, { EndDate: { gte: new Date(data.StartDate) } }],
    },
  });
  if (overlapping) {
    throw new AppError(`Overlapping ${overlapping.Status} request exists (ID: ${overlapping.LeaveRequestID}).`, 409, 'LEAVE_OVERLAP');
  }

  const holidays = await getHolidayDatesInRange(employeeId, data.StartDate, data.EndDate);
  let totalDays = data.IsHalfDay ? 0.5 : countEgyptianBusinessDays(data.StartDate, data.EndDate, holidays);

  if (totalDays <= 0) throw new AppError('No working days in selected range.', 400, 'NO_WORKING_DAYS');
  if (policy.MaxConsecDays && totalDays > policy.MaxConsecDays) {
    throw new AppError(`Maximum ${policy.MaxConsecDays} consecutive days allowed.`, 400, 'MAX_CONSEC_EXCEEDED');
  }

  const currentYear = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: { UQ_LeaveBalance: { EmployeeID: employeeId, LeaveTypeID: data.LeaveTypeID, BalanceYear: currentYear } },
  });
  if (!balance) throw new AppError('No leave balance found for this year. Contact HR.', 400, 'NO_BALANCE');

  const remaining = Number(balance.EntitledDays) + Number(balance.CarryOverDays)
    + Number(balance.AdjustedDays) - Number(balance.UsedDays) - Number(balance.PendingDays);
  if (remaining < totalDays) {
    throw new AppError(`Insufficient balance. Available: ${remaining.toFixed(1)} days, requested: ${totalDays} days.`, 400, 'INSUFFICIENT_BALANCE');
  }

  const needsApproval = leaveType.RequiresApproval;
  const initialStatus = needsApproval ? LEAVE_REQUEST_STATUS.PENDING_MANAGER : LEAVE_REQUEST_STATUS.APPROVED;

  const request = await prisma.$transaction(async (tx) => {
    const req = await tx.leaveRequest.create({
      data: {
        EmployeeID: employeeId, LeaveTypeID: data.LeaveTypeID,
        StartDate: new Date(data.StartDate), EndDate: new Date(data.EndDate),
        TotalDays: totalDays, IsHalfDay: data.IsHalfDay || false,
        HalfDayPortion: data.HalfDayPortion || null,
        Reason: data.Reason || null, Status: initialStatus,
      },
      include: { LeaveType: true },
    });

    await tx.leaveBalance.update({
      where: { LeaveBalanceID: balance.LeaveBalanceID },
      data: { PendingDays: { increment: totalDays }, LastUpdatedAt: new Date() },
    });

    if (needsApproval && employee.SupervisorID) {
      const firstStep = await tx.approvalStep.findFirst({ where: { LeaveTypeID: data.LeaveTypeID, StepOrder: 1 } });
      if (firstStep) {
        await tx.leaveApproval.create({
          data: {
            LeaveRequestID: req.LeaveRequestID, ApprovalStepID: firstStep.ApprovalStepID,
            ApproverID: employee.SupervisorID, Decision: LEAVE_APPROVAL_DECISION.PENDING,
          },
        });
      }
    }

    await tx.leaveActionLog.create({
      data: {
        LeaveRequestID: req.LeaveRequestID, ActionBy: employeeId,
        ActionType: LEAVE_ACTION_TYPE.SUBMITTED,
        PreviousStatus: LEAVE_REQUEST_STATUS.DRAFT, NewStatus: initialStatus,
        Notes: `Submitted for ${totalDays} days`,
      },
    });

    return req;
  });

  await notify({ recipientId: employeeId, eventCode: EVENT_CODE.LEAVE_SUBMITTED,
    title: 'Leave Request Submitted', body: `Your ${request.LeaveType.LeaveTypeName} (${totalDays}d) is submitted.`,
    sourceModule: 'Leave', sourceEntityId: request.LeaveRequestID });

  if (employee.SupervisorID && needsApproval) {
    await notify({ recipientId: employee.SupervisorID, eventCode: EVENT_CODE.LEAVE_PENDING_MANAGER,
      title: 'Leave Approval Needed', body: `${employee.FullName} requests ${totalDays}d ${leaveType.LeaveTypeName}.`,
      sourceModule: 'Leave', sourceEntityId: request.LeaveRequestID });
  }

  return request;
}

// ── Approval Processing ────────────────────────────────────────────────────────

async function processApproval(leaveRequestId, approverId, { decision, comments }) {
  const request = await prisma.leaveRequest.findUnique({
    where: { LeaveRequestID: leaveRequestId },
    include: { LeaveType: true, Employee: { select: { EmployeeID: true, FullName: true } },
      Approvals: { include: { ApprovalStep: true }, orderBy: { CreatedAt: 'desc' } } },
  });
  if (!request) throw new AppError('Leave request not found.', 404, 'NOT_FOUND');

  const approvableStatuses = [LEAVE_REQUEST_STATUS.PENDING_MANAGER, LEAVE_REQUEST_STATUS.PENDING_HR, LEAVE_REQUEST_STATUS.PENDING_DOCTOR];
  if (!approvableStatuses.includes(request.Status)) {
    throw new AppError(`Cannot process approval on status '${request.Status}'.`, 400, 'INVALID_STATUS');
  }

  const prevStatus = request.Status;
  const currentApproval = request.Approvals.find((a) => a.Decision === LEAVE_APPROVAL_DECISION.PENDING);

  if (decision === LEAVE_APPROVAL_DECISION.REJECTED) {
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({ where: { LeaveRequestID: leaveRequestId },
        data: { Status: LEAVE_REQUEST_STATUS.REJECTED, UpdatedAt: new Date() } });

      const balance = await tx.leaveBalance.findFirst({
        where: { EmployeeID: request.EmployeeID, LeaveTypeID: request.LeaveTypeID, BalanceYear: dayjs(request.StartDate).year() },
      });
      if (balance) {
        await tx.leaveBalance.update({ where: { LeaveBalanceID: balance.LeaveBalanceID },
          data: { PendingDays: { decrement: Number(request.TotalDays) }, LastUpdatedAt: new Date() } });
      }

      if (currentApproval) {
        await tx.leaveApproval.update({ where: { ApprovalID: currentApproval.ApprovalID },
          data: { Decision: LEAVE_APPROVAL_DECISION.REJECTED, ApproverID: approverId, Comments: comments || null, DecidedAt: new Date() } });
      }

      await tx.leaveActionLog.create({
        data: { LeaveRequestID: leaveRequestId, ActionBy: approverId,
          ActionType: prevStatus === LEAVE_REQUEST_STATUS.PENDING_MANAGER ? LEAVE_ACTION_TYPE.REJECTED_BY_MANAGER : LEAVE_ACTION_TYPE.REJECTED_BY_HR,
          PreviousStatus: prevStatus, NewStatus: LEAVE_REQUEST_STATUS.REJECTED, Notes: comments },
      });
    });

    await notify({ recipientId: request.EmployeeID, eventCode: EVENT_CODE.LEAVE_REJECTED,
      title: 'Leave Request Rejected',
      body: `Your ${request.LeaveType.LeaveTypeName} request was rejected.${comments ? ` Reason: ${comments}` : ''}`,
      sourceModule: 'Leave', sourceEntityId: leaveRequestId });

    return { status: LEAVE_REQUEST_STATUS.REJECTED };
  }

  // Approved — determine next step
  const allSteps = await prisma.approvalStep.findMany({ where: { LeaveTypeID: request.LeaveTypeID }, orderBy: { StepOrder: 'asc' } });
  const currentStepOrder = currentApproval?.ApprovalStep?.StepOrder || 1;
  const nextStep = allSteps.find((s) => s.StepOrder === currentStepOrder + 1);

  let newStatus = nextStep
    ? (nextStep.ApproverRole === 'HR' ? LEAVE_REQUEST_STATUS.PENDING_HR : LEAVE_REQUEST_STATUS.PENDING_DOCTOR)
    : LEAVE_REQUEST_STATUS.APPROVED;

  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({ where: { LeaveRequestID: leaveRequestId }, data: { Status: newStatus, UpdatedAt: new Date() } });

    if (currentApproval) {
      await tx.leaveApproval.update({ where: { ApprovalID: currentApproval.ApprovalID },
        data: { Decision: LEAVE_APPROVAL_DECISION.APPROVED, ApproverID: approverId, Comments: comments || null, DecidedAt: new Date() } });
    }

    if (newStatus === LEAVE_REQUEST_STATUS.APPROVED) {
      const balance = await tx.leaveBalance.findFirst({
        where: { EmployeeID: request.EmployeeID, LeaveTypeID: request.LeaveTypeID, BalanceYear: dayjs(request.StartDate).year() },
      });
      if (balance) {
        await tx.leaveBalance.update({ where: { LeaveBalanceID: balance.LeaveBalanceID },
          data: { UsedDays: { increment: Number(request.TotalDays) }, PendingDays: { decrement: Number(request.TotalDays) }, LastUpdatedAt: new Date() } });
      }

      const leaveStarted = dayjs(request.StartDate).isSameOrBefore(dayjs());
      const leaveEnded = dayjs(request.EndDate).isBefore(dayjs());
      if (leaveStarted && !leaveEnded) {
        await tx.employee.update({ where: { EmployeeID: request.EmployeeID }, data: { CurrentStatus: EMPLOYEE_STATUS.ON_LEAVE, UpdatedAt: new Date() } });
      }
    }

    await tx.leaveActionLog.create({
      data: {
        LeaveRequestID: leaveRequestId, ActionBy: approverId,
        ActionType: newStatus === LEAVE_REQUEST_STATUS.APPROVED ? LEAVE_ACTION_TYPE.APPROVED_BY_HR : LEAVE_ACTION_TYPE.APPROVED_BY_MANAGER,
        PreviousStatus: prevStatus, NewStatus: newStatus, Notes: comments,
      },
    });
  });

  if (newStatus === LEAVE_REQUEST_STATUS.APPROVED) {
    await markAttendanceAsOnLeave(request.EmployeeID, request.StartDate, request.EndDate, leaveRequestId);
    await notify({ recipientId: request.EmployeeID, eventCode: EVENT_CODE.LEAVE_APPROVED,
      title: 'Leave Approved',
      body: `Your ${request.LeaveType.LeaveTypeName} (${request.TotalDays}d) is approved.`,
      sourceModule: 'Leave', sourceEntityId: leaveRequestId });
  }

  return { status: newStatus };
}

// ── Cancel Leave Request ───────────────────────────────────────────────────────

async function cancelLeaveRequest(leaveRequestId, cancelledById, { CancelReason }) {
  const request = await prisma.leaveRequest.findUnique({ where: { LeaveRequestID: leaveRequestId }, include: { LeaveType: true } });
  if (!request) throw new AppError('Leave request not found.', 404, 'NOT_FOUND');

  const cancellableStatuses = [LEAVE_REQUEST_STATUS.DRAFT, LEAVE_REQUEST_STATUS.SUBMITTED,
    LEAVE_REQUEST_STATUS.PENDING_MANAGER, LEAVE_REQUEST_STATUS.PENDING_HR, LEAVE_REQUEST_STATUS.APPROVED];
  if (!cancellableStatuses.includes(request.Status)) {
    throw new AppError(`Cannot cancel a request with status '${request.Status}'.`, 400, 'INVALID_STATUS');
  }
  if (request.Status === LEAVE_REQUEST_STATUS.APPROVED && dayjs(request.StartDate).isBefore(dayjs())) {
    throw new AppError('Cannot cancel leave that has already started.', 400, 'LEAVE_ALREADY_STARTED');
  }

  const prevStatus = request.Status;
  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({ where: { LeaveRequestID: leaveRequestId },
      data: { Status: LEAVE_REQUEST_STATUS.CANCELLED, CancelledBy: cancelledById, CancelReason, UpdatedAt: new Date() } });

    const balance = await tx.leaveBalance.findFirst({
      where: { EmployeeID: request.EmployeeID, LeaveTypeID: request.LeaveTypeID, BalanceYear: dayjs(request.StartDate).year() },
    });
    if (balance) {
      if (prevStatus === LEAVE_REQUEST_STATUS.APPROVED) {
        await tx.leaveBalance.update({ where: { LeaveBalanceID: balance.LeaveBalanceID },
          data: { UsedDays: { decrement: Number(request.TotalDays) }, LastUpdatedAt: new Date() } });
      } else {
        await tx.leaveBalance.update({ where: { LeaveBalanceID: balance.LeaveBalanceID },
          data: { PendingDays: { decrement: Number(request.TotalDays) }, LastUpdatedAt: new Date() } });
      }
    }

    await tx.leaveActionLog.create({
      data: { LeaveRequestID: leaveRequestId, ActionBy: cancelledById, ActionType: LEAVE_ACTION_TYPE.CANCELLED,
        PreviousStatus: prevStatus, NewStatus: LEAVE_REQUEST_STATUS.CANCELLED, Notes: CancelReason },
    });
  });

  return { status: LEAVE_REQUEST_STATUS.CANCELLED };
}

// ── Delegation ────────────────────────────────────────────────────────────────

async function delegateApproval(leaveRequestId, delegatorId, { delegateTo, comments }) {
  const request = await prisma.leaveRequest.findUnique({ where: { LeaveRequestID: leaveRequestId } });
  if (!request) throw new AppError('Leave request not found.', 404, 'NOT_FOUND');

  const pendingApproval = await prisma.leaveApproval.findFirst({
    where: { LeaveRequestID: leaveRequestId, ApproverID: delegatorId, Decision: LEAVE_APPROVAL_DECISION.PENDING },
  });
  if (!pendingApproval) throw new AppError('No pending approval for you on this request.', 404, 'NOT_FOUND');

  const delegate = await prisma.employee.findUnique({ where: { EmployeeID: delegateTo } });
  if (!delegate || !delegate.IsActive) throw new AppError('Delegate not found or inactive.', 400, 'INVALID_REFERENCE');

  await prisma.leaveApproval.update({ where: { ApprovalID: pendingApproval.ApprovalID },
    data: { Decision: LEAVE_APPROVAL_DECISION.DELEGATED, DelegatedTo: delegateTo, Comments: comments || null, DecidedAt: new Date() } });

  await prisma.leaveApproval.create({
    data: { LeaveRequestID: leaveRequestId, ApprovalStepID: pendingApproval.ApprovalStepID, ApproverID: delegateTo, Decision: LEAVE_APPROVAL_DECISION.PENDING },
  });

  await notify({ recipientId: delegateTo, eventCode: EVENT_CODE.LEAVE_PENDING_MANAGER,
    title: 'Leave Approval Delegated to You', body: `Leave request #${leaveRequestId} delegated to you.`,
    sourceModule: 'Leave', sourceEntityId: leaveRequestId });

  return { delegatedTo: delegateTo };
}

// ── Query Functions ───────────────────────────────────────────────────────────

async function listLeaveRequests(query) {
  const { page, limit, skip } = getPagination(query);
  const where = {};
  if (query.employeeId) where.EmployeeID = query.employeeId;
  if (query.leaveTypeId) where.LeaveTypeID = query.leaveTypeId;
  if (query.status) where.Status = query.status;
  if (query.year) {
    where.StartDate = { gte: new Date(`${query.year}-01-01`), lte: new Date(`${query.year}-12-31`) };
  } else if (query.startDate || query.endDate) {
    where.StartDate = {};
    if (query.startDate) where.StartDate.gte = new Date(query.startDate);
    if (query.endDate) where.StartDate.lte = new Date(query.endDate);
  }
  if (query.departmentId) where.Employee = { DepartmentID: query.departmentId };

  const [requests, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where, skip, take: limit, orderBy: { CreatedAt: 'desc' },
      include: {
        Employee: { select: { FullName: true, EmployeeCode: true, PhotoURL: true } },
        LeaveType: true,
        Approvals: { include: { ApprovalStep: true, Approver: { select: { FullName: true } } }, orderBy: { CreatedAt: 'asc' } },
      },
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return { requests, meta: buildPaginationMeta(total, page, limit) };
}

async function getLeaveRequestById(leaveRequestId) {
  const request = await prisma.leaveRequest.findUnique({
    where: { LeaveRequestID: leaveRequestId },
    include: {
      Employee: { select: { FullName: true, EmployeeCode: true, PhotoURL: true } },
      LeaveType: true,
      Approvals: { include: { ApprovalStep: true, Approver: { select: { FullName: true } }, Delegate: { select: { FullName: true } } }, orderBy: { CreatedAt: 'asc' } },
      ActionLogs: { include: { ActionByEmp: { select: { FullName: true } } }, orderBy: { ActionAt: 'asc' } },
    },
  });
  if (!request) throw new AppError('Leave request not found.', 404, 'NOT_FOUND');
  return request;
}

async function getMyLeaveRequests(employeeId, query) {
  return listLeaveRequests({ ...query, employeeId });
}

async function getManagerInbox(managerId, query) {
  const { page, limit, skip } = getPagination(query);
  const pendingApprovals = await prisma.leaveApproval.findMany({
    where: { ApproverID: managerId, Decision: LEAVE_APPROVAL_DECISION.PENDING },
    select: { LeaveRequestID: true },
  });
  const requestIds = pendingApprovals.map((a) => a.LeaveRequestID);

  const [requests, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { LeaveRequestID: { in: requestIds } }, skip, take: limit, orderBy: { CreatedAt: 'asc' },
      include: { Employee: { select: { FullName: true, EmployeeCode: true, PhotoURL: true } }, LeaveType: true },
    }),
    prisma.leaveRequest.count({ where: { LeaveRequestID: { in: requestIds } } }),
  ]);

  return { requests, meta: buildPaginationMeta(total, page, limit) };
}

// ── Holidays ──────────────────────────────────────────────────────────────────

async function listHolidays(query = {}) {
  const where = {};
  if (query.year) {
    where.HolidayDate = { gte: new Date(`${query.year}-01-01`), lte: new Date(`${query.year}-12-31`) };
  }
  if (query.workLocationId) where.OR = [{ WorkLocationID: parseInt(query.workLocationId, 10) }, { WorkLocationID: null }];
  return prisma.holidayCalendar.findMany({ where, include: { WorkLocation: { select: { LocationName: true } } }, orderBy: { HolidayDate: 'asc' } });
}

async function createHoliday(data) {
  return prisma.holidayCalendar.create({
    data: { HolidayName: data.HolidayName, HolidayDate: new Date(data.HolidayDate), IsRecurringYearly: data.IsRecurringYearly || false, WorkLocationID: data.WorkLocationID || null, PayMultiplier: data.PayMultiplier || 3.0 },
  });
}

// ── Analytics ──────────────────────────────────────────────────────────────────

async function getLeaveAnalytics(query = {}) {
  const year = parseInt(query.year, 10) || new Date().getFullYear();
  const whereRequest = { StartDate: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } };
  if (query.departmentId) whereRequest.Employee = { DepartmentID: parseInt(query.departmentId, 10) };

  const [byType, byStatus] = await Promise.all([
    prisma.leaveRequest.groupBy({ by: ['LeaveTypeID'], where: whereRequest, _count: { LeaveRequestID: true }, _sum: { TotalDays: true } }),
    prisma.leaveRequest.groupBy({ by: ['Status'], where: whereRequest, _count: { LeaveRequestID: true } }),
  ]);

  const leaveTypes = await prisma.leaveType.findMany({ select: { LeaveTypeID: true, LeaveTypeName: true } });
  const typeMap = new Map(leaveTypes.map((lt) => [lt.LeaveTypeID, lt.LeaveTypeName]));

  return {
    year,
    byType: byType.map((b) => ({ leaveTypeId: b.LeaveTypeID, leaveTypeName: typeMap.get(b.LeaveTypeID) || 'Unknown', requestCount: b._count.LeaveRequestID, totalDays: Number(b._sum.TotalDays || 0) })),
    byStatus: byStatus.map((b) => ({ status: b.Status, count: b._count.LeaveRequestID })),
  };
}

module.exports = {
  listLeaveTypes, createLeaveType, listLeavePolicies, createLeavePolicy,
  getLeaveBalanceDashboard, initializeLeaveBalances, adjustLeaveBalance,
  submitLeaveRequest, processApproval, cancelLeaveRequest, delegateApproval,
  listLeaveRequests, getLeaveRequestById, getMyLeaveRequests, getManagerInbox,
  listHolidays, createHoliday, getLeaveAnalytics,
};
