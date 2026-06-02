const prisma = require('../../../config/database');
const { AppError } = require('../../../middleware/errorHandler');
const { notify } = require('../../../shared/utils/notification.util');
const { PAYROLL_RUN_STATUS, PAYROLL_ENTRY_STATUS, PAY_TYPE_CATEGORY, PAYROLL_EXCEPTION_STATUS, EVENT_CODE } = require('../../../shared/constants');
const { dayjs } = require('../../../shared/utils/date.util');
const { getPagination, buildPaginationMeta } = require('../../../middleware/validate');

// Egyptian Tax Engine
async function calculateAnnualTax(annualTaxableIncome, year) {
  const brackets = await prisma.taxBracket.findMany({ where: { EffectiveYear: year }, orderBy: { BracketOrder: 'asc' } });
  if (!brackets.length) return annualTaxableIncome * 0.15;
  const personalExemption = Number(brackets[0]?.PersonalExemptionEGP || 0);
  const taxableAfterExemption = Math.max(0, annualTaxableIncome - personalExemption);
  let totalTax = 0;
  let remaining = taxableAfterExemption;
  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const from = Number(bracket.FromAmountEGP);
    const to = bracket.ToAmountEGP !== null ? Number(bracket.ToAmountEGP) : Infinity;
    const rate = Number(bracket.RatePct) / 100;
    const bracketSize = to - from;
    const taxableInBracket = Math.min(remaining, bracketSize);
    totalTax += taxableInBracket * rate;
    remaining -= taxableInBracket;
  }
  return Math.max(0, totalTax);
}

async function getSocialInsuranceConfig() {
  const today = new Date();
  const config = await prisma.socialInsuranceConfig.findFirst({
    where: { EffectiveFrom: { lte: today }, OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: today } }] },
    orderBy: { EffectiveFrom: 'desc' },
  });
  return { employeeRate: config ? Number(config.EmployeeRatePct) / 100 : 0.0725, employerRate: config ? Number(config.EmployerRatePct) / 100 : 0.1875 };
}

// Config lookups
async function listPayGrades() { return prisma.payGrade.findMany({ where: { IsActive: true }, orderBy: { MinSalary: 'asc' } }); }
async function createPayGrade(data) { return prisma.payGrade.create({ data }); }
async function listPayTypes() { return prisma.payType.findMany({ where: { IsActive: true }, orderBy: { PayTypeName: 'asc' } }); }
async function createPayType(data) { return prisma.payType.create({ data }); }
async function listOvertimeRules() { return prisma.overtimeRule.findMany({ where: { IsActive: true } }); }
async function createOvertimeRule(data) { return prisma.overtimeRule.create({ data }); }
async function listAllowances() { return prisma.allowance.findMany({ where: { IsActive: true }, orderBy: { AllowanceName: 'asc' } }); }
async function listShiftDifferentials() { return prisma.shiftDifferential.findMany({ where: { IsActive: true } }); }

// Payroll Policies
async function listPayrollPolicies() {
  return prisma.payrollPolicy.findMany({ where: { IsActive: true }, include: { OvertimeRule: true, ApprovedByEmp: { select: { FullName: true } } }, orderBy: { CreatedAt: 'desc' } });
}
async function createPayrollPolicy(data, createdById) {
  return prisma.payrollPolicy.create({ data: { ...data, ApprovedBy: createdById, ApprovedAt: new Date() }, include: { OvertimeRule: true } });
}
// Add this to payroll.service.js
async function getEmployeeActiveDays(employeeId, periodStart, periodEnd) {
  const employee = await prisma.employee.findUnique({ 
    where: { EmployeeID: employeeId },
    select: { HireDate: true, TerminationDate: true }
  });

  if (!employee) {
    throw new AppError(`Employee ${employeeId} not found`, 404);
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const hired = employee.HireDate ? new Date(employee.HireDate) : start;
  const terminated = employee.TerminationDate ? new Date(employee.TerminationDate) : null;

  let actualStart = hired > start ? hired : start;
  let actualEnd = (terminated && terminated < end) ? terminated : end;

  // If hired after the period, or terminated before it
  if (actualStart > end || actualEnd < start) {
    return { activeDays: 0, isActive: false };
  }

  const diffTime = Math.abs(actualEnd - actualStart);
  const activeDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  return { 
    activeDays, 
    isActive: true, 
    hireDate: employee.HireDate, 
    terminationDate: employee.TerminationDate 
  };
}

// Don't forget to export it at the bottom:
// getEmployeeActiveDays

// Payroll Runs
async function listPayrollRuns(query) {
  const { page, limit, skip } = getPagination(query);
  const where = {};
  if (query.status) where.Status = query.status;
  if (query.year) where.PeriodYear = parseInt(query.year, 10);
  if (query.policyId) where.PolicyID = parseInt(query.policyId, 10);
  const [runs, total] = await Promise.all([
    prisma.payrollRun.findMany({ where, skip, take: limit, orderBy: { CreatedAt: 'desc' },
      include: { Policy: true, Processor: { select: { FullName: true } }, Approver: { select: { FullName: true } },
        _count: { select: { Entries: true } } } }),
    prisma.payrollRun.count({ where }),
  ]);
  return { runs, meta: buildPaginationMeta(total, page, limit) };
}

async function getPayrollRunById(runId) {
  const run = await prisma.payrollRun.findUnique({
    where: { PayrollRunID: runId },
    include: { Policy: { include: { OvertimeRule: true } }, Processor: { select: { FullName: true } }, Approver: { select: { FullName: true } },
      Entries: { include: { Employee: { select: { FullName: true, EmployeeCode: true } }, Lines: { include: { PayType: true } }, Payslip: true } },
      Exceptions: { include: { Employee: { select: { FullName: true } } } } },
  });
  if (!run) throw new AppError('Payroll run not found.', 404, 'NOT_FOUND');
  return run;
}

async function createPayrollRun(data, createdById) {
  const policy = await prisma.payrollPolicy.findUnique({ where: { PolicyID: data.PolicyID } });
  if (!policy) throw new AppError('Payroll policy not found.', 404, 'NOT_FOUND');
  const existing = await prisma.payrollRun.findFirst({ where: { PolicyID: data.PolicyID, PeriodYear: data.PeriodYear, PeriodMonth: data.PeriodMonth } });
  if (existing) throw new AppError('Payroll run already exists for this period.', 409, 'DUPLICATE_ENTRY');
  return prisma.payrollRun.create({
    data: { PolicyID: data.PolicyID, PeriodYear: data.PeriodYear, PeriodMonth: data.PeriodMonth,
      PeriodStartDate: new Date(data.PeriodStartDate), PeriodEndDate: new Date(data.PeriodEndDate),
      CutoffDate: new Date(data.CutoffDate), PaymentDate: new Date(data.PaymentDate),
      Status: PAYROLL_RUN_STATUS.DRAFT, ProcessedBy: createdById },
    include: { Policy: true },
  });
}

async function ensurePayTypes() {
  const defs = [
    { code: 'BASE_SALARY', name: 'Base Salary', cat: PAY_TYPE_CATEGORY.EARNING, key: 'baseSalary' },
    { code: 'ALLOWANCE', name: 'Allowance', cat: PAY_TYPE_CATEGORY.EARNING, key: 'allowance' },
    { code: 'OVERTIME', name: 'Overtime Pay', cat: PAY_TYPE_CATEGORY.EARNING, key: 'overtime' },
    { code: 'ABSENCE_DED', name: 'Absence Deduction', cat: PAY_TYPE_CATEGORY.DEDUCTION, key: 'absenceDeduction' },
    { code: 'SOCIAL_INS', name: 'Social Insurance', cat: PAY_TYPE_CATEGORY.DEDUCTION, key: 'socialInsurance' },
    { code: 'INCOME_TAX', name: 'Income Tax', cat: PAY_TYPE_CATEGORY.DEDUCTION, key: 'incomeTax' },
  ];
  const result = {};
  for (const d of defs) {
    const existing = await prisma.payType.findUnique({ where: { PayTypeCode: d.code } });
    const pt = existing || await prisma.payType.create({ data: { PayTypeCode: d.code, PayTypeName: d.name, Category: d.cat, IsRecurring: true, IsTaxable: false, IsInsurable: false } });
    result[d.key] = pt.PayTypeID;
  }
  return result;
}

async function createOrUpdateException(runId, employeeId, exceptionType, description) {
  const existing = await prisma.payrollException.findFirst({ where: { PayrollRunID: runId, EmployeeID: employeeId, ExceptionType: exceptionType, Status: PAYROLL_EXCEPTION_STATUS.OPEN } });
  if (existing) return existing;
  const safeDescription = description ? description.substring(0, 250) : 'Unknown error';
  return prisma.payrollException.create({ data: { PayrollRunID: runId, EmployeeID: employeeId, ExceptionType: exceptionType, Description: safeDescription, Status: PAYROLL_EXCEPTION_STATUS.OPEN } });
}

async function processPayrollRun(runId, opts, processedById) {
  const run = await prisma.payrollRun.findUnique({ where: { PayrollRunID: runId }, include: { Policy: { include: { OvertimeRule: true } } } });
  if (!run) throw new AppError('Payroll run not found.', 404, 'NOT_FOUND');
  if (![PAYROLL_RUN_STATUS.DRAFT, PAYROLL_RUN_STATUS.PROCESSING].includes(run.Status)) throw new AppError('Cannot process run in current status.', 400, 'INVALID_STATUS');
  await prisma.payrollRun.update({ where: { PayrollRunID: runId }, data: { Status: PAYROLL_RUN_STATUS.PROCESSING } });

  const empWhere = { IsActive: true, CurrentStatus: { not: 'Terminated' } };
  if (opts?.includeEmployeeIds?.length) empWhere.EmployeeID = { in: opts.includeEmployeeIds };
  const employees = await prisma.employee.findMany({ where: empWhere, select: { EmployeeID: true, FullName: true, EmployeeCode: true } });

  const siConfig = await getSocialInsuranceConfig();
  const workingDaysInMonth = 26;
  let totalGross = 0, totalNet = 0, processedCount = 0;
  const payTypes = await ensurePayTypes();

  for (const emp of employees) {
    try {
      const salaryRecord = await prisma.employeeSalary.findFirst({
        where: { EmployeeID: emp.EmployeeID, EffectiveFrom: { lte: run.PeriodEndDate }, OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: run.PeriodStartDate } }] },
        orderBy: { EffectiveFrom: 'desc' },
      });
      if (!salaryRecord) { await createOrUpdateException(runId, emp.EmployeeID, 'MissingSalary', 'No active salary record.'); continue; }

      const baseSalary = Number(salaryRecord.BaseSalary);
      const allowances = await prisma.employeeAllowance.findMany({
        where: { EmployeeID: emp.EmployeeID, EffectiveFrom: { lte: run.PeriodEndDate }, OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: run.PeriodStartDate } }] },
        include: { Allowance: true },
      });

      const attSummary = await prisma.attendanceSummary.findUnique({
        where: { UQ_AttSummary_EmpPeriod: { EmployeeID: emp.EmployeeID, PeriodYear: run.PeriodYear, PeriodMonth: run.PeriodMonth } },
      });
      if (!attSummary) { await createOrUpdateException(runId, emp.EmployeeID, 'MissingAttendance', 'No attendance summary found.'); continue; }

      const unpaidLeave = await prisma.leaveRequest.findMany({
        where: { EmployeeID: emp.EmployeeID, Status: 'Approved', StartDate: { lte: run.PeriodEndDate }, EndDate: { gte: run.PeriodStartDate }, LeaveType: { IsPaid: false } },
        select: { TotalDays: true },
      });
      const unpaidDays = unpaidLeave.reduce((s, r) => s + Number(r.TotalDays), 0);
      const dailyRate = baseSalary / workingDaysInMonth;
      const absenceDeduction = Math.min((unpaidDays + Number(attSummary.AbsentDays)) * dailyRate, run.Policy.MaxMonthlyDeductionDays * dailyRate);

      const overtimeHours = Number(attSummary.TotalOvertimeHrs || 0);
      let overtimePay = 0;
      if (overtimeHours > 0 && run.Policy.OvertimeRule) {
        const hourlyRate = baseSalary / (workingDaysInMonth * 8);
        overtimePay = overtimeHours * hourlyRate * Number(run.Policy.OvertimeRule.Multiplier);
      }

      const allowancesTotal = allowances.reduce((s, ea) => s + (ea.OverrideAmount !== null ? Number(ea.OverrideAmount) : Number(ea.Allowance.Amount)), 0);
      const approvedClaims = await prisma.reimbursementClaim.findMany({
        where: { 
          EmployeeID: emp.EmployeeID, 
          Status: 'Approved',
      

        }
      });
      const claimsTotal = approvedClaims.reduce((s, c) => s + Number(c.Amount), 0);
      const grossEarnings = baseSalary + allowancesTotal + overtimePay + claimsTotal - absenceDeduction;
      const siWage = baseSalary;
      const employeeSI = siWage * siConfig.employeeRate;
      const employerSI = siWage * siConfig.employerRate;
      const annualTax = await calculateAnnualTax((grossEarnings - employeeSI) * 12, run.PeriodYear);
      const monthlyTax = annualTax / 12;
      const netPay = grossEarnings - employeeSI - monthlyTax;

      if (netPay < Number(run.Policy.MinimumWageEGP)) await createOrUpdateException(runId, emp.EmployeeID, 'BelowMinimumWage', `Net pay ${netPay.toFixed(2)} < minimum wage.`);
      // Find this section in processPayrollRun and add:

 const lines = [{ PayTypeID: payTypes.baseSalary, Description: 'Base Salary', Amount: baseSalary, Quantity: 1, SourceModule: 'Payroll' }];
// Update Gross Earnings calculation:


// Add Line items for the payslip transparency:
approvedClaims.forEach(c => {
  lines.push({
    PayTypeID: payTypes.allowance, // Or a specific CLAIM type
    Description: `Reimbursement: ${c.Category}`,
    Amount: Number(c.Amount),
    Quantity: 1,
    SourceModule: 'Expense'
  });
});
      const existingEntry = await prisma.payrollEntry.findUnique({ where: { UQ_PayrollEntry: { PayrollRunID: runId, EmployeeID: emp.EmployeeID } } });
      let entry;
      const entryData = { AttendanceSummaryID: attSummary.SummaryID, BaseSalary: baseSalary, TotalEarnings: grossEarnings, TotalDeductions: absenceDeduction + employeeSI + monthlyTax, TaxAmount: monthlyTax, UnpaidLeaveDeduction: absenceDeduction, OvertimePay: overtimePay, SocialInsuranceWage: siWage, EmployeeSocialInsurance: employeeSI, EmployerSocialInsurance: employerSI, NetPay: netPay, Status: PAYROLL_ENTRY_STATUS.DRAFT };
      if (existingEntry) { entry = await prisma.payrollEntry.update({ where: { EntryID: existingEntry.EntryID }, data: entryData }); }
      else { entry = await prisma.payrollEntry.create({ data: { PayrollRunID: runId, EmployeeID: emp.EmployeeID, ...entryData } }); }

      await prisma.payrollEntryLine.deleteMany({ where: { EntryID: entry.EntryID } });
     
      allowances.forEach((ea) => lines.push({ PayTypeID: payTypes.allowance, Description: ea.Allowance.AllowanceName, Amount: ea.OverrideAmount !== null ? Number(ea.OverrideAmount) : Number(ea.Allowance.Amount), Quantity: 1, SourceModule: 'Payroll' }));
      if (overtimePay > 0) lines.push({ PayTypeID: payTypes.overtime, Description: `Overtime (${overtimeHours}h)`, Amount: overtimePay, Quantity: overtimeHours, SourceModule: 'Attendance' });
      if (absenceDeduction > 0) lines.push({ PayTypeID: payTypes.absenceDeduction, Description: 'Absence Deduction', Amount: -absenceDeduction, Quantity: 1, SourceModule: 'Attendance' });
      if (employeeSI > 0) lines.push({ PayTypeID: payTypes.socialInsurance, Description: `Social Insurance (${(siConfig.employeeRate*100).toFixed(2)}%)`, Amount: -employeeSI, Quantity: 1, SourceModule: 'Payroll' });
      if (monthlyTax > 0) lines.push({ PayTypeID: payTypes.incomeTax, Description: 'Income Tax (Progressive)', Amount: -monthlyTax, Quantity: 1, SourceModule: 'Payroll' });
      await prisma.payrollEntryLine.createMany({ data: lines.map((l) => ({ ...l, EntryID: entry.EntryID })) });

      totalGross += grossEarnings; totalNet += netPay; processedCount++;
    } catch (err) {
      await createOrUpdateException(runId, emp.EmployeeID, 'ProcessingError', `Error: ${err.message}`);
    }
  }

  const openExceptions = await prisma.payrollException.count({ where: { PayrollRunID: runId, Status: PAYROLL_EXCEPTION_STATUS.OPEN } });
  const newStatus = openExceptions > 0 ? PAYROLL_RUN_STATUS.PROCESSING : PAYROLL_RUN_STATUS.PENDING_APPROVAL;
  await prisma.payrollRun.update({ where: { PayrollRunID: runId }, data: { Status: newStatus, TotalGrossAmount: totalGross, TotalNetAmount: totalNet, TotalEmployees: processedCount, ProcessedBy: processedById } });
  return { runId, status: newStatus, processedCount, totalGross: parseFloat(totalGross.toFixed(2)), totalNet: parseFloat(totalNet.toFixed(2)), openExceptions };
}

async function approvePayrollRun(runId, approverId) {
  const run = await prisma.payrollRun.findUnique({ where: { PayrollRunID: runId } });
  if (!run) throw new AppError('Payroll run not found.', 404, 'NOT_FOUND');
  if (run.Status !== PAYROLL_RUN_STATUS.PENDING_APPROVAL) throw new AppError('Run must be PendingApproval.', 400, 'INVALID_STATUS');
  const openExc = await prisma.payrollException.count({ where: { PayrollRunID: runId, Status: PAYROLL_EXCEPTION_STATUS.OPEN } });
  if (openExc > 0) throw new AppError(`${openExc} open exceptions must be resolved first.`, 400, 'OPEN_EXCEPTIONS');
  await prisma.payrollRun.update({ where: { PayrollRunID: runId }, data: { Status: PAYROLL_RUN_STATUS.APPROVED, ApprovedBy: approverId } });
  return { status: PAYROLL_RUN_STATUS.APPROVED };
}

async function finalizePayrollRun(runId) {
  const run = await prisma.payrollRun.findUnique({ where: { PayrollRunID: runId } });
  if (!run) throw new AppError('Payroll run not found.', 404, 'NOT_FOUND');
  if (run.Status !== PAYROLL_RUN_STATUS.APPROVED) throw new AppError('Run must be Approved before finalizing.', 400, 'INVALID_STATUS');
  await prisma.payrollEntry.updateMany({ where: { PayrollRunID: runId, Status: PAYROLL_ENTRY_STATUS.DRAFT }, data: { Status: PAYROLL_ENTRY_STATUS.FINALIZED } });
  await prisma.payrollRun.update({ where: { PayrollRunID: runId }, data: { Status: PAYROLL_RUN_STATUS.FINALIZED, FinalizedAt: new Date() } });
  return { status: PAYROLL_RUN_STATUS.FINALIZED };
}

async function generatePayslips(runId) {
  const run = await prisma.payrollRun.findUnique({ where: { PayrollRunID: runId } });
  if (!run) throw new AppError('Payroll run not found.', 404, 'NOT_FOUND');
  if (![PAYROLL_RUN_STATUS.FINALIZED, PAYROLL_RUN_STATUS.PAID].includes(run.Status)) throw new AppError('Run must be Finalized.', 400, 'INVALID_STATUS');
  const entries = await prisma.payrollEntry.findMany({ where: { PayrollRunID: runId, Status: { in: [PAYROLL_ENTRY_STATUS.FINALIZED, PAYROLL_ENTRY_STATUS.PAID] }, PayslipGenerated: false }, include: { Employee: { select: { EmployeeCode: true } } } });
  const created = [];
  for (const entry of entries) {
    const payslipNumber = `PS-${run.PeriodYear}${String(run.PeriodMonth).padStart(2, '0')}-${entry.Employee.EmployeeCode}`;
    const existing = await prisma.payslip.findFirst({ where: { EntryID: entry.EntryID } });
    if (existing) continue;
    const ps = await prisma.payslip.create({ data: { EntryID: entry.EntryID, EmployeeID: entry.EmployeeID, PayrollRunID: runId, PayslipNumber: payslipNumber, IssueDate: run.PaymentDate } });
    await prisma.payrollEntry.update({ where: { EntryID: entry.EntryID }, data: { PayslipGenerated: true } });
    await notify({ recipientId: entry.EmployeeID, eventCode: EVENT_CODE.PAY_PAYSLIP_READY, title: 'Payslip Available', body: `Payslip for ${run.PeriodYear}-${String(run.PeriodMonth).padStart(2,'0')} ready.`, sourceModule: 'Payroll', sourceEntityId: ps.PayslipID });
    created.push(ps);
  }
  return { generated: created.length };
}

async function getMyPayslips(employeeId, query) {
  const { page, limit, skip } = getPagination(query);
  const [payslips, total] = await Promise.all([
    prisma.payslip.findMany({ where: { EmployeeID: employeeId }, skip, take: limit, orderBy: { IssueDate: 'desc' },
      include: { PayrollRun: { select: { PeriodYear: true, PeriodMonth: true, PaymentDate: true } }, Entry: { select: { BaseSalary: true, TotalEarnings: true, TotalDeductions: true, TaxAmount: true, OvertimePay: true, EmployeeSocialInsurance: true, NetPay: true, Lines: { include: { PayType: true } } } } } }),
    prisma.payslip.count({ where: { EmployeeID: employeeId } }),
  ]);
  await prisma.payslip.updateMany({ where: { EmployeeID: employeeId, IsViewedByEmployee: false }, data: { IsViewedByEmployee: true } });
  return { payslips, meta: buildPaginationMeta(total, page, limit) };
}

async function getPayslipById(payslipId, requesterId, requesterRole) {
  const payslip = await prisma.payslip.findUnique({ where: { PayslipID: payslipId },
    include: { Employee: { select: { FullName: true, EmployeeCode: true, Position: { select: { PositionTitle: true } }, Department: { select: { DepartmentName: true } } } },
      PayrollRun: { select: { PeriodYear: true, PeriodMonth: true, PaymentDate: true } },
      Entry: { include: { Lines: { include: { PayType: true }, orderBy: { Amount: 'desc' } }, AttendanceSummary: true } } } });
  if (!payslip) throw new AppError('Payslip not found.', 404, 'NOT_FOUND');
  const privileged = ['HR', 'Payroll', 'Admin'];
  if (!privileged.includes(requesterRole) && payslip.EmployeeID !== requesterId) throw new AppError('You can only view your own payslips.', 403, 'FORBIDDEN');
  return payslip;
}

async function listExceptions(query) {
  const { page, limit, skip } = getPagination(query);
  const where = {};
  if (query.runId) where.PayrollRunID = parseInt(query.runId, 10);
  if (query.status) where.Status = query.status;
  if (query.employeeId) where.EmployeeID = parseInt(query.employeeId, 10);
  const [exceptions, total] = await Promise.all([
    prisma.payrollException.findMany({ where, skip, take: limit, orderBy: { CreatedAt: 'desc' }, include: { Employee: { select: { FullName: true, EmployeeCode: true } }, Resolver: { select: { FullName: true } } } }),
    prisma.payrollException.count({ where }),
  ]);
  return { exceptions, meta: buildPaginationMeta(total, page, limit) };
}

async function resolveException(exceptionId, resolverId, data) {
  const exc = await prisma.payrollException.findUnique({ where: { ExceptionID: exceptionId } });
  if (!exc) throw new AppError('Exception not found.', 404, 'NOT_FOUND');
  if (exc.Status !== PAYROLL_EXCEPTION_STATUS.OPEN) throw new AppError('Exception is not open.', 400, 'ALREADY_RESOLVED');
  return prisma.payrollException.update({ where: { ExceptionID: exceptionId }, data: { Status: data.resolution, ResolvedBy: resolverId, ResolvedAt: new Date(), ResolutionNotes: data.ResolutionNotes } });
}

async function generateBankFile(runId, generatedById, data) {
  const run = await prisma.payrollRun.findUnique({ where: { PayrollRunID: runId }, include: { Entries: true } });
  if (!run) throw new AppError('Payroll run not found.', 404, 'NOT_FOUND');
  if (![PAYROLL_RUN_STATUS.FINALIZED, PAYROLL_RUN_STATUS.PAID].includes(run.Status)) throw new AppError('Run must be Finalized.', 400, 'INVALID_STATUS');
  const eligible = run.Entries.filter((e) => e.Status !== PAYROLL_ENTRY_STATUS.EXCEPTION);
  const totalAmount = eligible.reduce((s, e) => s + Number(e.NetPay), 0);
  const bf = await prisma.bankFile.create({ data: { PayrollRunID: runId, GeneratedBy: generatedById, FileFormat: data.FileFormat, TotalAmount: totalAmount, TransactionCount: eligible.length, FileURL: `/bank-files/run-${runId}-${Date.now()}.${data.FileFormat.toLowerCase()}`, Status: 'Generated' } });
  return { bankFileId: bf.BankFileID, fileUrl: bf.FileURL, totalAmount, transactionCount: eligible.length };
}

async function getPayrollDashboard() {
  const [totalRuns, activeExceptions, latestRun] = await Promise.all([
    prisma.payrollRun.count(),
    prisma.payrollException.count({ where: { Status: PAYROLL_EXCEPTION_STATUS.OPEN } }),
    prisma.payrollRun.findFirst({ where: { Status: { in: [PAYROLL_RUN_STATUS.FINALIZED, PAYROLL_RUN_STATUS.PAID] } }, orderBy: { FinalizedAt: 'desc' }, select: { TotalNetAmount: true, TotalEmployees: true } }),
  ]);
  const recentRuns = await prisma.payrollRun.findMany({ take: 5, orderBy: { CreatedAt: 'desc' }, select: { PayrollRunID: true, PeriodYear: true, PeriodMonth: true, Status: true, CreatedAt: true, Processor: { select: { FullName: true } } } });
  return {
    totalPayrollRuns: totalRuns, activeExceptions,
    totalPayrollValue: latestRun ? Number(latestRun.TotalNetAmount) : 0,
    totalEmployees: latestRun ? latestRun.TotalEmployees : 0,
    recentActivity: recentRuns.map((r) => ({ type: 'PayrollRun', description: `${r.Status} — ${r.PeriodYear}-${String(r.PeriodMonth).padStart(2,'0')}`, by: r.Processor?.FullName || 'System', at: r.CreatedAt })),
  };
}


async function listReimbursements(query) {
  const where = {};
  if (query.employeeId) where.EmployeeID = parseInt(query.employeeId, 10);
  if (query.status) where.Status = query.status;
  return prisma.reimbursementClaim.findMany({
    where,
    include: { Employee: { select: { FullName: true } } },
    orderBy: { CreatedAt: 'desc' }
  });
}

async function submitReimbursement(employeeId, data) {
  const amount = parseFloat(data.amount);
  if (isNaN(amount)) throw new AppError("Invalid amount provided", 400);
  return prisma.reimbursementClaim.create({
    data: {
      EmployeeID: parseInt(employeeId, 10),
      Category: data.type || "Other",
      Amount: amount,
      Justification: data.reason || "",
      Status: "Pending"
    }
  });
}
async function resolveReimbursement(claimId, resolverId, data) {
  return prisma.reimbursementClaim.update({
    where: { ClaimID: claimId },
    data: { Status: data.status } // Expects 'Approved' or 'Rejected'
  });
}

// Ensure resolveReimbursement is in module.exports!
module.exports = {
  listPayGrades, submitReimbursement, listReimbursements, resolveReimbursement,
  createPayGrade, listPayTypes, createPayType, listOvertimeRules, createOvertimeRule,
  listAllowances, listShiftDifferentials, listPayrollPolicies, createPayrollPolicy,
  listPayrollRuns, getPayrollRunById, createPayrollRun, processPayrollRun,
  approvePayrollRun, finalizePayrollRun, generatePayslips, getMyPayslips, getPayslipById,
  listExceptions, resolveException, generateBankFile, getPayrollDashboard, calculateAnnualTax, getEmployeeActiveDays,
};