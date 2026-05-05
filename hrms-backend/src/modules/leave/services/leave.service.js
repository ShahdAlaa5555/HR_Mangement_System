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

// Months between startDate and referenceDate (defaults to now)
function monthsBetween(startDate, referenceDate) {
  if (!startDate) return 0;
  const ref = referenceDate ? dayjs(referenceDate) : dayjs();
  return ref.diff(dayjs(startDate), 'month');
}

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
  const baseWhere = {
    LeaveTypeID: leaveTypeId,
    // LeavePolicy has no IsActive column — filter by date range only
    EffectiveFrom: { lte: today },
    OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: today } }],
  };

  // 1. Try exact employment-type match first
  if (employmentType) {
    const specific = await prisma.leavePolicy.findFirst({
      where: { ...baseWhere, EmploymentType: employmentType },
      include: { SickLeaveTiers: { orderBy: { TierOrder: 'asc' } } },
      orderBy: { EffectiveFrom: 'desc' },
    });
    if (specific) return specific;
  }

  // 2. Fall back to a universal policy (EmploymentType is null — applies to all)
  const universal = await prisma.leavePolicy.findFirst({
    where: { ...baseWhere, EmploymentType: null },
    include: { SickLeaveTiers: { orderBy: { TierOrder: 'asc' } } },
    orderBy: { EffectiveFrom: 'desc' },
  });
  if (universal) return universal;

  // 3. Last resort — return ANY active policy for this leave type regardless of employment type.
  // Handles cases where HR created policies with a specific EmploymentType value that doesn't
  // exactly match what's stored on the employee record.
  return prisma.leavePolicy.findFirst({
    where: { LeaveTypeID: leaveTypeId, EffectiveFrom: { lte: today }, OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: today } }] },
    include: { SickLeaveTiers: { orderBy: { TierOrder: 'asc' } } },
    orderBy: { EffectiveFrom: 'desc' },
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
  const where = {};  // LeavePolicy has no IsActive column
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

  // Always run initializeLeaveBalances — it is fully idempotent (skips existing rows).
  // This picks up any new leave types / auto-created policies since the last load.
  try { await initializeLeaveBalances(employeeId, balanceYear); } catch (_) {}

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
      // maxDaysPerYear = the policy ceiling, used by the UI to show "X of 30 days"
      // instead of "X of 25 days" (which would show 100% for a prorated new joiner)
      maxDaysPerYear: Number(bal.EntitledDays) + Number(bal.CarryOverDays) + Number(bal.AdjustedDays),
      progressPercent, balanceYear,
    };
  });
}

async function initializeLeaveBalances(employeeId, balanceYear) {
  const employee = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId }, select: { EmployeeID: true, StartDate: true, EmploymentType: true },
  });
  if (!employee) throw new AppError('Employee not found.', 404, 'NOT_FOUND');

  // Fetch all candidate policies, then select one per LeaveType using same priority as getActivePolicy:
  // exact EmploymentType match wins over universal (null) policies.
  const allPolicies = await prisma.leavePolicy.findMany({
    where: {
      // LeavePolicy has no IsActive column — filter by date range only
      EffectiveFrom: { lte: new Date(`${balanceYear}-12-31`) },
      AND: [
        { OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: new Date(`${balanceYear}-01-01`) } }] },
        { OR: [{ EmploymentType: employee.EmploymentType }, { EmploymentType: null }] },
      ],
    },
    include: { LeaveType: true },
    orderBy: [{ EmploymentType: 'desc' }, { EffectiveFrom: 'desc' }],
  });

  // Deduplicate: one policy per LeaveTypeID — specific type wins over universal null
  const policyMap = new Map();
  for (const p of allPolicies) {
    const existing = policyMap.get(p.LeaveTypeID);
    if (!existing) { policyMap.set(p.LeaveTypeID, p); continue; }
    // Prefer specific EmploymentType match over null (universal)
    if (!existing.EmploymentType && p.EmploymentType) policyMap.set(p.LeaveTypeID, p);
  }
  const policies = Array.from(policyMap.values());

  // Use CURRENT tenure for MinTenure eligibility gates (e.g. Hajj needs 5 years now)
  // Use tenure at Jan 1 of balance year ONLY for tier calc of past/future years
  // For the CURRENT year use today's tenure so new hires get correct entitlement immediately
  const today = dayjs();
  const isCurrentYear = balanceYear === today.year();
  const tenureRefDate = isCurrentYear ? today.toDate() : new Date(`${balanceYear}-07-01`); // mid-year for past/future
  const tenureMonths  = monthsBetween(employee.StartDate, tenureRefDate);  // for tier calculation
  const tenureNow     = monthsBetween(employee.StartDate);                  // for MinTenure gates

  // Fetch extra employee details needed for annual leave tiers (disability, DOB)
  const employeeFull = await prisma.employee.findUnique({
    where: { EmployeeID: employeeId },
    select: { StartDate: true, DateOfBirth: true, HasDisability: true },
  });

  const results = [];

  for (const policy of policies) {
    // MinTenure gate — use CURRENT tenure so employees aren't blocked by future requirements
    if (policy.MinTenureMonths > tenureNow) continue;

    // ── Egyptian Labor Law entitlement calculation ─────────────────────────
    const leaveCode = (policy.LeaveType?.LeaveTypeCode || '').toUpperCase();
    const isAnnual    = leaveCode.includes('ANNUAL') || leaveCode === 'AL';
    const isEmergency = leaveCode.includes('EMERG') || leaveCode.includes('ACCID') || leaveCode.includes('CASUAL');
    const isSick      = leaveCode.includes('SICK')  || leaveCode.includes('MED');
    const isHajj      = leaveCode.includes('HAJJ');
    const isWedding   = leaveCode.includes('WEDDING') || leaveCode.includes('MARR');

    let entitledDays = policy.MaxDaysPerYear; // default = HR-configured ceiling

    if (isAnnual) {
      // Annual Leave — Egyptian Labor Law tiers based on actual service months
      if (employeeFull?.HasDisability) {
        entitledDays = 45;
      } else {
        const serviceYears = tenureMonths / 12;
        const age = employeeFull?.DateOfBirth
          ? dayjs(tenureRefDate).diff(dayjs(employeeFull.DateOfBirth), 'year') : 0;

        if (tenureMonths < 6) {
          // < 6 months: first entitlement = 15 days AFTER completing 6 months
          // Set 0 now — balance will be recalculated on next dashboard load once 6 months are reached
          entitledDays = 0;
        } else if (tenureMonths < 12) {
          // 6–12 months in first year: prorated 15 days
          // Accrual: (15 / 12) × completed_months (capped at 15)
          entitledDays = Math.min(15, Math.floor((15 / 12) * tenureMonths));
        } else if (serviceYears >= 10 || age >= 50) {
          // 10+ years service or age 50+: 30 days
          entitledDays = 30;
        } else {
          // 1–10 years: 21 days
          entitledDays = 21;
        }
      }
    }

    if (isEmergency) entitledDays = 6;   // R43: Egyptian law = 6 days/year, max 2 consecutive
    if (isWedding)   entitledDays = 7;   // law: 7 days full pay
    if (isSick) {
      // R41: 3-year cycle — max 360 days total, up to 90/year. Check prior years in cycle.
      const hireYear = dayjs(employee.StartDate).year();
      const cycleStart = balanceYear - ((balanceYear - hireYear) % 3);
      try {
        const cycleAgg = await prisma.leaveBalance.aggregate({
          where: { EmployeeID: employeeId, LeaveTypeID: policy.LeaveTypeID, BalanceYear: { gte: cycleStart, lt: balanceYear } },
          _sum: { UsedDays: true },
        });
        const usedInCycle = Number(cycleAgg._sum.UsedDays || 0);
        entitledDays = Math.max(0, Math.min(90, 360 - usedInCycle));
      } catch (_) { entitledDays = 90; }
    }

    if (isHajj) {
      // Once in lifetime — skip if already taken
      const priorHajj = await prisma.leaveRequest.findFirst({
        where: { EmployeeID: employeeId, LeaveTypeID: policy.LeaveTypeID, Status: 'APPROVED' },
      });
      if (priorHajj) continue;
      entitledDays = 30;
    }

    // ── Carry-over from previous year (only for new rows, not updates) ─────
    let carryOverDays = 0;
    const prevBalance = await prisma.leaveBalance.findUnique({
      where: { UQ_LeaveBalance: { EmployeeID: employeeId, LeaveTypeID: policy.LeaveTypeID, BalanceYear: balanceYear - 1 } },
    });
    if (prevBalance) {
      const prevRemaining = Number(prevBalance.EntitledDays) + Number(prevBalance.CarryOverDays)
        + Number(prevBalance.AdjustedDays) - Number(prevBalance.UsedDays) - Number(prevBalance.PendingDays);
      const carryCapDays = policy.CarryOverLimit > 0 ? policy.CarryOverLimit : 0;
      carryOverDays = Math.min(Math.max(0, prevRemaining), carryCapDays);
    }

    // ── Upsert: UPDATE EntitledDays on existing rows, CREATE new ones ───────
    // This ensures old employees with stale/wrong EntitledDays get corrected on
    // every dashboard load. We NEVER touch UsedDays or CarryOverDays (real data).
    const existing = await prisma.leaveBalance.findUnique({
      where: { UQ_LeaveBalance: { EmployeeID: employeeId, LeaveTypeID: policy.LeaveTypeID, BalanceYear: balanceYear } },
    });

    let balance;
    if (existing) {
      // Only update EntitledDays if it has actually changed — never touch transactional fields
      if (Number(existing.EntitledDays) !== entitledDays) {
        balance = await prisma.leaveBalance.update({
          where: { LeaveBalanceID: existing.LeaveBalanceID },
          data: { EntitledDays: entitledDays, LastUpdatedAt: new Date() },
        });
      } else {
        balance = existing;
      }
    } else {
      balance = await prisma.leaveBalance.create({
        data: {
          EmployeeID: employeeId, LeaveTypeID: policy.LeaveTypeID, BalanceYear: balanceYear,
          EntitledDays: entitledDays, UsedDays: 0, PendingDays: 0,
          CarryOverDays: carryOverDays, AdjustedDays: 0,
          CarryOverExpiryYear: carryOverDays > 0 ? balanceYear + policy.CarryOverYears : null,
        },
      });
    }
    results.push(balance);
  }
  return results;
}

async function adjustLeaveBalance(data, adjustedById) {
  const balance = await prisma.leaveBalance.findUnique({
    where: { UQ_LeaveBalance: { EmployeeID: data.EmployeeID, LeaveTypeID: data.LeaveTypeID, BalanceYear: data.BalanceYear } },
  });
  if (!balance) throw new AppError('Leave balance record not found.', 404, 'NOT_FOUND');

  const updated = await prisma.leaveBalance.update({
    where: { LeaveBalanceID: balance.LeaveBalanceID },
    data: { AdjustedDays: { increment: data.AdjustedDays }, LastUpdatedAt: new Date() },
  });

  // R17: audit trail — timestamp, HR user ID, reason
  try {
    await prisma.leaveActionLog.create({
      data: { LeaveRequestID: null, ActionBy: adjustedById, ActionType: 'BALANCE_ADJUSTED',
        PreviousStatus: null, NewStatus: null,
        Notes: `Balance adjusted ${data.AdjustedDays > 0 ? '+' : ''}${data.AdjustedDays} days (Year ${data.BalanceYear}). Reason: ${data.Reason || 'Not specified'}` },
    });
  } catch (_) {}

  return updated;
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

  let policy = await getActivePolicy(data.LeaveTypeID, employee.EmploymentType);
  if (!policy) {
    // No policy exists for this leave type — auto-create a permissive default so employees
    // are never blocked by missing HR configuration. HR can refine limits later.
    // Egyptian Labor Law 2025 — compliant defaults per leave type code
    const defaultsByCode = {
      // Annual: 21 days default (service < 10 yr) — entitlement overridden at balance init
      'ANNUAL':      { MaxDaysPerYear: 21,  CarryOverLimit: 45, NoticePeriodDays: 0,  AllowHalfDay: false, MinTenureMonths: 0,  CarryOverYears: 2 },
      // Sick: 90 days per 3-year cycle at 100% pay
      'SICK':        { MaxDaysPerYear: 90,  CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: false, MinTenureMonths: 0,  CarryOverYears: 1 },
      'MEDICAL':     { MaxDaysPerYear: 90,  CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: false, MinTenureMonths: 0,  CarryOverYears: 1 },
      // Emergency/Accidental: 7 days/year, max 2 consecutive (enforced at submit)
      'EMERGENCY':   { MaxDaysPerYear: 6,   CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: true,  MinTenureMonths: 0,  CarryOverYears: 1, MaxConsecDays: 2 },
      'ACCIDENTAL':  { MaxDaysPerYear: 6,   CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: true,  MinTenureMonths: 0,  CarryOverYears: 1, MaxConsecDays: 2 },
      'CASUAL':      { MaxDaysPerYear: 6,   CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: true,  MinTenureMonths: 0,  CarryOverYears: 1, MaxConsecDays: 2 },
      'MATERNITY':   { MaxDaysPerYear: 90,  CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: false, MinTenureMonths: 10, CarryOverYears: 1 },
      'PATERNITY':   { MaxDaysPerYear: 3,   CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: false, MinTenureMonths: 0,  CarryOverYears: 1 },
      'BEREAVEMENT': { MaxDaysPerYear: 3,   CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: false, MinTenureMonths: 0,  CarryOverYears: 1 },
      // Marriage: 7 days full pay (Egyptian law)
      'WEDDING':     { MaxDaysPerYear: 7,   CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: false, MinTenureMonths: 0,  CarryOverYears: 1 },
      'MARR':        { MaxDaysPerYear: 7,   CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: false, MinTenureMonths: 0,  CarryOverYears: 1 },
      // Hajj: once in lifetime, after 5 years (60 months)
      'HAJJ':        { MaxDaysPerYear: 30,  CarryOverLimit: 0,  NoticePeriodDays: 30, AllowHalfDay: false, MinTenureMonths: 60, CarryOverYears: 1 },
      'MILITARY':    { MaxDaysPerYear: 365, CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: false, MinTenureMonths: 0,  CarryOverYears: 1 },
      'SABBATICAL':  { MaxDaysPerYear: 180, CarryOverLimit: 0,  NoticePeriodDays: 30, AllowHalfDay: false, MinTenureMonths: 24, CarryOverYears: 1 },
      'UNPAID':      { MaxDaysPerYear: 365, CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: true,  MinTenureMonths: 0,  CarryOverYears: 1 },
      'COMPENSATORY':{ MaxDaysPerYear: 30,  CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: true,  MinTenureMonths: 0,  CarryOverYears: 1 },
      'MISSION':     { MaxDaysPerYear: 365, CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: true,  MinTenureMonths: 0,  CarryOverYears: 1 },
      'BUSINESS':    { MaxDaysPerYear: 365, CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: true,  MinTenureMonths: 0,  CarryOverYears: 1 },
      // Infected contact: up to 3 months exceptional
      'CONTACT':     { MaxDaysPerYear: 90,  CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: false, MinTenureMonths: 0,  CarryOverYears: 1 },
      'INFECT':      { MaxDaysPerYear: 90,  CarryOverLimit: 0,  NoticePeriodDays: 0,  AllowHalfDay: false, MinTenureMonths: 0,  CarryOverYears: 1 },
    };
    const leaveCode = leaveType.LeaveTypeCode?.toUpperCase() || '';
    const matchKey = Object.keys(defaultsByCode).find(k => leaveCode.includes(k));
    const defaults = matchKey ? defaultsByCode[matchKey] : { MaxDaysPerYear: 30, CarryOverLimit: 0, NoticePeriodDays: 0, AllowHalfDay: true };
    policy = await prisma.leavePolicy.create({
      data: {
        PolicyName: `Default – ${leaveType.LeaveTypeName} (Egyptian Labor Law 2025)`,
        LeaveTypeID: data.LeaveTypeID,
        EmploymentType: null,             // universal — applies to all employment types
        MaxDaysPerYear: defaults.MaxDaysPerYear,
        CarryOverLimit: defaults.CarryOverLimit,
        CarryOverYears: defaults.CarryOverYears || 1,
        MinTenureMonths: defaults.MinTenureMonths || 0,
        NoticePeriodDays: defaults.NoticePeriodDays,
        MaxConsecDays: defaults.MaxConsecDays || null,
        AllowHalfDay: defaults.AllowHalfDay,
        EffectiveFrom: new Date('2020-01-01'),
        EffectiveTo: null,
      },
      include: { SickLeaveTiers: true },
    });
  }

  const tenureMonths = monthsSince(employee.StartDate);
  if (tenureMonths < policy.MinTenureMonths) {
    throw new AppError(`You need at least ${policy.MinTenureMonths} months tenure. Current: ${tenureMonths} months.`, 400, 'INSUFFICIENT_TENURE');
  }

  const today = dayjs().startOf('day');
  const startDay = dayjs(data.StartDate).startOf('day');
  if (startDay.diff(today, 'day') < policy.NoticePeriodDays) {
    throw new AppError(`This leave requires ${policy.NoticePeriodDays} days notice. Start from: ${today.add(policy.NoticePeriodDays, 'day').format('YYYY-MM-DD')}.`, 400, 'NOTICE_PERIOD_VIOLATION');
  }

  // R3: non-deductible types (Unpaid, Business, Mission, Military) skip balance check
  const requestCode = leaveType.LeaveTypeCode?.toUpperCase() || '';
  const isNonDeductible = ['UNPAID','BUSINESS','MISSION','MILITARY','SABBAT'].some(c => requestCode.includes(c)) || !leaveType.IsPaid;

  // R37: Block annual/accidental deductions during active maternity or paternity leave
  try {
    const activeProtected = await prisma.leaveRequest.findFirst({
      where: { EmployeeID: employeeId, Status: LEAVE_REQUEST_STATUS.APPROVED, EndDate: { gte: new Date() } },
      include: { LeaveType: true },
    });
    if (activeProtected) {
      const pc = activeProtected.LeaveType.LeaveTypeCode?.toUpperCase() || '';
      if ((pc.includes('MATERN') || pc.includes('PAT')) &&
          (requestCode.includes('ANNUAL') || requestCode.includes('ACCID') || requestCode.includes('EMERG') || requestCode.includes('CASUAL'))) {
        throw new AppError(`Cannot deduct ${leaveType.LeaveTypeName} during an active ${activeProtected.LeaveType.LeaveTypeName} — protected under Egyptian Labor Law.`, 400, 'PROTECTED_PERIOD');
      }
    }
  } catch (e) { if (e.code === 'PROTECTED_PERIOD') throw e; }

  // R55: Leave block periods configured by HR
  try {
    const blocked = await prisma.leaveBlockPeriod.findFirst({
      where: { StartDate: { lte: new Date(data.EndDate) }, EndDate: { gte: new Date(data.StartDate) },
        OR: [{ LeaveTypeID: data.LeaveTypeID }, { LeaveTypeID: null }] },
    });
    if (blocked) throw new AppError(`Leaves blocked ${dayjs(blocked.StartDate).format('YYYY-MM-DD')} → ${dayjs(blocked.EndDate).format('YYYY-MM-DD')}: ${blocked.Reason || 'Organizational policy'}`, 400, 'LEAVE_BLOCKED_PERIOD');
  } catch (e) { if (e.code === 'LEAVE_BLOCKED_PERIOD') throw e; }

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

  // R54 + Egyptian Labor Law: now that totalDays is known, enforce document rules.
  // Sick leave ≤ 1 day → no document needed (self-cert accepted).
  // Sick leave > 1 day → medical certificate required.
  // Maternity / Bereavement → document always required regardless of duration.
  if (leaveType.RequiresDocument) {
    const alwaysReq    = requestCode.includes('MATERN') || requestCode.includes('BEREAV');
    const sickNeedsDoc = (requestCode.includes('SICK') || requestCode.includes('MED'))
      && !data.IsHalfDay && totalDays > 1;
    if ((alwaysReq || sickNeedsDoc) && !data.DocumentReference && !data.AttachmentURL) {
      const hint = requestCode.includes('MATERN') ? 'birth or delivery certificate'
        : requestCode.includes('BEREAV') ? 'death certificate or obituary notice'
        : 'medical certificate (required for sick leave exceeding 1 working day)';
      throw new AppError(`${leaveType.LeaveTypeName} requires: ${hint}.`, 400, 'DOCUMENT_REQUIRED');
    }
  }

  // Ensure a balance row exists — run the full initializeLeaveBalances so
  // the entitlement is correctly calculated (not just MaxDaysPerYear).
  const currentYear = new Date().getFullYear();
  try { await initializeLeaveBalances(employeeId, currentYear); } catch (_) {}

  const balance = await prisma.leaveBalance.findUnique({
    where: { UQ_LeaveBalance: { EmployeeID: employeeId, LeaveTypeID: data.LeaveTypeID, BalanceYear: currentYear } },
  });

  // R3: non-deductible types bypass all balance checks
  if (!isNonDeductible) {
    if (!balance || Number(balance.EntitledDays) === 0) {
      throw new AppError('No leave balance for this type. You may not have completed the minimum service period. Contact HR.', 400, 'NO_BALANCE');
    }
    const avail = Number(balance.EntitledDays) + Number(balance.CarryOverDays) + Number(balance.AdjustedDays) - Number(balance.UsedDays);
    if (avail < totalDays) {
      throw new AppError(`Insufficient balance. Available: ${avail} day(s), requested: ${totalDays} day(s).`, 400, 'INSUFFICIENT_BALANCE');
    }
  }
  const availableBalance = isNonDeductible ? Infinity
    : Number(balance.EntitledDays) + Number(balance.CarryOverDays) + Number(balance.AdjustedDays) - Number(balance.UsedDays);

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

    // Balance is only updated when the request is approved or rejected — not on submission.
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

  // R28: Notify employee if balance < 3 days after this request
  if (!isNonDeductible && leaveType.IsPaid && availableBalance !== Infinity) {
    const remaining = availableBalance - totalDays;
    if (remaining < 3) {
      try {
        await notify({ recipientId: employeeId, eventCode: 'LEAVE_BALANCE_LOW',
          title: `Low ${leaveType.LeaveTypeName} Balance`,
          body: `After this request your balance will be ${Math.max(0, remaining).toFixed(1)} day(s). Consider planning ahead.`,
          sourceModule: 'Leave', sourceEntityId: request.LeaveRequestID });
      } catch (_) {}
    }
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

  // R25: SUBMITTED is also approvable — when no ApprovalStep exists, status stays SUBMITTED
  const approvableStatuses = [
    LEAVE_REQUEST_STATUS.SUBMITTED, LEAVE_REQUEST_STATUS.PENDING_MANAGER,
    LEAVE_REQUEST_STATUS.PENDING_HR, LEAVE_REQUEST_STATUS.PENDING_DOCTOR,
  ];
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
          data: { LastUpdatedAt: new Date() } });  // no PendingDays to restore — balance only moves at approval
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
          data: { UsedDays: { increment: Number(request.TotalDays) }, LastUpdatedAt: new Date() } });
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

// Resolve status filter string to all DB variants for that status.
// DB stores 'PendingManager','Approved','Rejected' etc — NOT 'PENDING_MANAGER'.
function buildStatusWhere(status) {
  if (!status || status === '') return null;
  const variants = {
    'PENDING_MANAGER': ['PendingManager', 'PENDING_MANAGER', 'Pending', 'pending', 'SUBMITTED', 'Submitted'],
    'SUBMITTED':       ['Submitted', 'SUBMITTED', 'PendingManager', 'PENDING_MANAGER'],
    'APPROVED':        ['Approved', 'APPROVED', 'approved'],
    'REJECTED':        ['Rejected', 'REJECTED', 'rejected'],
    'CANCELLED':       ['Cancelled', 'Canceled', 'CANCELLED', 'CANCELED', 'cancelled'],
    'PENDING_HR':      ['PendingHR', 'PENDING_HR', 'PendingHr'],
    'DRAFT':           ['Draft', 'DRAFT', 'draft'],
  };
  const key = status.toUpperCase().replace(/ /g, '_');
  // Also try direct camelCase lookup
  const list = variants[key]
    || variants[status]
    || [status]; // fallback: exact value
  return { Status: { in: list } };
}

async function listLeaveRequests(query) {
  // Use a high default limit so the first load shows all requests without pagination
  const merged = { limit: 500, page: 1, ...query };
  const { page, limit, skip } = getPagination(merged);
  const where = {};
  if (query.employeeId) where.EmployeeID = parseInt(query.employeeId, 10);
  if (query.leaveTypeId) where.LeaveTypeID = parseInt(query.leaveTypeId, 10);
  // Only apply status filter when explicitly requested — no default hiding of any status
  if (query.status && query.status !== '') {
    const sw = buildStatusWhere(query.status);
    if (sw) Object.assign(where, sw);
  }
  // Use explicit date range filter only — never default to current year
  // so requests for future dates (next year) are always visible
  if (query.startDate || query.endDate) {
    where.StartDate = {};
    if (query.startDate) where.StartDate.gte = new Date(query.startDate);
    if (query.endDate)   where.StartDate.lte = new Date(query.endDate);
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
// ── Manual Balance Adjustment (LV-013) ─────────────────────────────────────
async function adjustLeaveBalance(data, adjustedById) {
  const balance = await prisma.leaveBalance.findUnique({
    where: { 
      UQ_LeaveBalance: { 
        EmployeeID: parseInt(data.EmployeeID), 
        LeaveTypeID: parseInt(data.LeaveTypeID), 
        BalanceYear: parseInt(data.BalanceYear) 
      }
    },
    include: { LeaveType: true }
  });

  if (!balance) throw new AppError('Leave balance record not found.', 404, 'NOT_FOUND');

  const result = await prisma.leaveBalance.update({
    where: { LeaveBalanceID: balance.LeaveBalanceID },
    data: { 
      AdjustedDays: { increment: Number(data.AdjustedDays) },
      LastUpdatedAt: new Date() 
    },
    include: { LeaveType: true }
  });

  // Log the adjustment
  await prisma.leaveActionLog.create({
    data: {
      LeaveRequestID: null,
      ActionBy: adjustedById,
      ActionType: 'BALANCE_ADJUSTED',
      Notes: `Adjusted by ${adjustedById}: ${data.AdjustedDays} days for ${result.LeaveType.LeaveTypeName}`,
    }
  });

  return result;
}

// ── Modify Leave Request (LV-017) ──────────────────────────────────────────
async function updateLeaveRequest(leaveRequestId, employeeId, updateData) {
  const request = await prisma.leaveRequest.findUnique({
    where: { LeaveRequestID: parseInt(leaveRequestId) },
    include: { LeaveType: true }
  });

  if (!request) throw new AppError('Leave request not found.', 404);
  if (request.EmployeeID !== parseInt(employeeId)) throw new AppError('Unauthorized', 403);
  if (!['DRAFT', 'SUBMITTED', 'PENDING_MANAGER'].includes(request.Status)) {
    throw new AppError('Only pending requests can be modified.', 400);
  }

  const holidays = await getHolidayDatesInRange(employeeId, updateData.StartDate, updateData.EndDate);
  const totalDays = updateData.IsHalfDay ? 0.5 : countEgyptianBusinessDays(updateData.StartDate, updateData.EndDate, holidays);

  return prisma.leaveRequest.update({
    where: { LeaveRequestID: parseInt(leaveRequestId) },
    data: {
      StartDate: new Date(updateData.StartDate),
      EndDate: new Date(updateData.EndDate),
      TotalDays: totalDays,
      Reason: updateData.Reason,
      IsHalfDay: updateData.IsHalfDay || false,
      UpdatedAt: new Date()
    }
  });
}

// ── Improved Cancel Leave Request ──────────────────────────────────────────
async function cancelLeaveRequest(leaveRequestId, cancelledById, { CancelReason }) {
  const request = await prisma.leaveRequest.findUnique({
    where: { LeaveRequestID: parseInt(leaveRequestId) },
    include: { LeaveType: true }
  });

  if (!request) throw new AppError('Leave request not found.', 404);
  if (!CancelReason?.trim()) throw new AppError('Cancel reason is required.', 400);

  const cancellable = ['DRAFT','SUBMITTED','PENDING_MANAGER','PENDING_HR','APPROVED'];
  if (!cancellable.includes(request.Status)) {
    throw new AppError(`Cannot cancel request in status: ${request.Status}`, 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { LeaveRequestID: parseInt(leaveRequestId) },
      data: {
        Status: LEAVE_REQUEST_STATUS.CANCELLED,
        CancelledBy: parseInt(cancelledById),
        CancelReason: CancelReason.trim(),
        UpdatedAt: new Date()
      }
    });

    const balance = await tx.leaveBalance.findFirst({
      where: {
        EmployeeID: request.EmployeeID,
        LeaveTypeID: request.LeaveTypeID,
        BalanceYear: dayjs(request.StartDate).year()
      }
    });

    if (balance) {
      if (request.Status === LEAVE_REQUEST_STATUS.APPROVED) {
        await tx.leaveBalance.update({
          where: { LeaveBalanceID: balance.LeaveBalanceID },
          data: { UsedDays: { decrement: Number(request.TotalDays) } }
        });
      } else {
        await tx.leaveBalance.update({
          where: { LeaveBalanceID: balance.LeaveBalanceID },
          data: { PendingDays: { decrement: Number(request.TotalDays) } }
        });
      }
    }

    await tx.leaveActionLog.create({
      data: {
        LeaveRequestID: parseInt(leaveRequestId),
        ActionBy: parseInt(cancelledById),
        ActionType: LEAVE_ACTION_TYPE.CANCELLED,
        PreviousStatus: request.Status,
        NewStatus: LEAVE_REQUEST_STATUS.CANCELLED,
        Notes: CancelReason.trim()
      }
    });
  });

  return { success: true, message: 'Leave request cancelled successfully' };
}
// Export all (updated)
module.exports = {
  listLeaveTypes, createLeaveType, listLeavePolicies, createLeavePolicy,
  getLeaveBalanceDashboard, initializeLeaveBalances, 
  adjustLeaveBalance,           // ← Added/Improved
  submitLeaveRequest, 
  updateLeaveRequest,           // ← New
  processApproval, 
  cancelLeaveRequest,           // ← Improved
  delegateApproval,
  listLeaveRequests, getLeaveRequestById, getMyLeaveRequests, getManagerInbox,
  listHolidays, createHoliday, getLeaveAnalytics,
};