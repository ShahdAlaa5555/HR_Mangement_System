/**
 * src/modules/payroll/services/payroll.calculator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Payroll Calculation Engine
 *
 * THESIS NOTE — This is the most critical component of the Payroll module.
 *
 * The calculation pipeline for each employee follows this exact sequence:
 *
 *  Step 1: Fetch base salary (EmployeeSalary where EffectiveTo IS NULL)
 *  Step 2: Fetch allowances (EmployeeAllowance where EffectiveTo IS NULL)
 *  Step 3: Fetch attendance summary → unpaid absence deductions
 *  Step 4: Fetch leave impact → unpaid leave deductions
 *  Step 5: Calculate overtime pay (based on OvertimeRule multiplier)
 *  Step 6: Calculate social insurance (Egyptian Law No. 148/2019)
 *           Employee contribution: 7.25% of social insurance wage
 *           Employer contribution: 18.75% of social insurance wage
 *           Social insurance wage ≠ gross salary (has its own ceiling)
 *  Step 7: Calculate gross taxable income:
 *           GrossIncome = BaseSalary + Allowances + OvertimePay - UnpaidDeductions
 *  Step 8: Apply Egyptian progressive income tax (Law No. 91/2005, 2024 amendment)
 *           Annual income tax is computed on annualized income, then divided by 12
 *           Personal exemption: EGP 20,000/year (bracket 1 threshold)
 *  Step 9: Calculate net pay:
 *           NetPay = GrossIncome - EmployeeSocialInsurance - IncomeTax
 *  Step 10: Validate against minimum wage (EGP 6,000/month per PayrollPolicy)
 *
 * TAX BRACKETS (2025, from TaxBracket table seeded in schema):
 *   0     – 15,000    → 0%
 *   15,001 – 30,000   → 2.5%
 *   30,001 – 45,000   → 10%
 *   45,001 – 60,000   → 15%
 *   60,001 – 200,000  → 20%
 *   200,001 – 400,000 → 25%
 *   400,001+           → 27.5%
 *   Personal exemption: EGP 20,000/year
 *
 * OVERTIME PAY (per OvertimeRule):
 *   Normal day OT:  BaseDailyRate × HoursOT × Multiplier (1.35 typical)
 *   Holiday OT:     BaseDailyRate × HoursOT × Multiplier (2.0 typical)
 *
 * ABSENCE DEDUCTION:
 *   DailyRate = BaseSalary / WorkingDaysInMonth
 *   AbsenceDeduction = DailyRate × MIN(AbsentDays, MaxMonthlyDeductionDays)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const prisma = require('../../../config/database');
const { AppError } = require('../../../middleware/errorHandler');
const { getMonthBounds } = require('../../../shared/utils/date.util');

// ─── Tax Calculation (Egyptian Progressive Tax) ───────────────────────────────

/**
 * Calculates annual income tax using progressive bracket system.
 * Input: annual gross taxable income in EGP
 * Returns: annual tax amount in EGP
 */
async function calculateAnnualIncomeTax(annualGrossIncome, year = new Date().getFullYear()) {
  const brackets = await prisma.taxBracket.findMany({
    where: { EffectiveYear: year },
    orderBy: { BracketOrder: 'asc' },
  });

  if (!brackets.length) {
    throw new AppError(`No tax brackets configured for year ${year}.`, 500, 'TAX_CONFIG_MISSING');
  }

  // Apply personal exemption from first bracket
  const personalExemption = Number(brackets[0].PersonalExemptionEGP) || 0;
  const taxableIncome = Math.max(0, annualGrossIncome - personalExemption);

  let totalTax = 0;
  let remaining = taxableIncome;

  for (const bracket of brackets) {
    if (remaining <= 0) break;

    const from = Number(bracket.FromAmountEGP);
    const to = bracket.ToAmountEGP ? Number(bracket.ToAmountEGP) : Infinity;
    const rate = Number(bracket.RatePct) / 100;
    const bracketSize = to - from;

    if (taxableIncome <= from) break;

    const taxableInThisBracket = Math.min(remaining, bracketSize);
    totalTax += taxableInThisBracket * rate;
    remaining -= taxableInThisBracket;
  }

  return parseFloat(totalTax.toFixed(2));
}

/**
 * Converts annual tax to monthly.
 */
async function calculateMonthlyIncomeTax(monthlyGrossIncome, year) {
  const annualIncome = monthlyGrossIncome * 12;
  const annualTax = await calculateAnnualIncomeTax(annualIncome, year);
  return parseFloat((annualTax / 12).toFixed(2));
}

// ─── Social Insurance Calculation (Egyptian Law No. 148/2019) ────────────────

/**
 * Gets the active social insurance configuration.
 * Employee rate: 7.25%, Employer rate: 18.75% (configurable via SocialInsuranceConfig)
 */
async function getSocialInsuranceConfig() {
  const today = new Date();
  const config = await prisma.socialInsuranceConfig.findFirst({
    where: {
      EffectiveFrom: { lte: today },
      OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: today } }],
    },
    orderBy: { EffectiveFrom: 'desc' },
  });

  if (!config) {
    // Default rates if not configured
    return { EmployeeRatePct: 7.25, EmployerRatePct: 18.75 };
  }

  return {
    EmployeeRatePct: Number(config.EmployeeRatePct),
    EmployerRatePct: Number(config.EmployerRatePct),
  };
}

/**
 * Calculates social insurance contributions.
 * NOTE: Social insurance is applied on the "social insurance wage"
 * which in Egyptian law has a minimum and maximum ceiling.
 * For simplification, we apply it to BaseSalary (practitioners vary).
 */
function calculateSocialInsurance(baseSalary, siConfig) {
  const siWage = baseSalary; // In production: apply SI wage ceiling from regulations
  const employeeContrib = parseFloat((siWage * (siConfig.EmployeeRatePct / 100)).toFixed(2));
  const employerContrib = parseFloat((siWage * (siConfig.EmployerRatePct / 100)).toFixed(2));

  return {
    siWage,
    employeeContrib,
    employerContrib,
  };
}

// ─── Overtime Pay Calculation ─────────────────────────────────────────────────

/**
 * Calculates overtime pay for an employee.
 *
 * Formula:
 *   HourlyRate = BaseSalary / (WorkingDaysInMonth × ShiftExpectedHours)
 *   OvertimePay = HourlyRate × OvertimeHours × OvertimeMultiplier
 */
async function calculateOvertimePay(baseSalary, overtimeHours, workingDays, overtimeRule) {
  if (!overtimeHours || overtimeHours <= 0) return 0;

  const hoursPerDay = 8; // Default; ideally from shift assignment
  const hourlyRate = baseSalary / (workingDays * hoursPerDay);
  const multiplier = overtimeRule ? Number(overtimeRule.Multiplier) : 1.35;
  const overtimePay = hourlyRate * overtimeHours * multiplier;

  return parseFloat(overtimePay.toFixed(2));
}

// ─── MAIN CALCULATION FUNCTION ────────────────────────────────────────────────

/**
 * Calculates the complete payroll for a single employee for a given period.
 *
 * @param {number} employeeId
 * @param {number} payrollRunId
 * @param {object} policy      - PayrollPolicy record
 * @param {object} [attendanceSummary] - pre-fetched or null
 * @param {object} [leaveImpact]       - {unpaidLeaveDays, paidLeaveDays}
 * @returns {object} calculation result ready to be stored as PayrollEntry
 */
async function calculateEmployeePayroll(employeeId, payrollRunId, policy, attendanceSummary, leaveImpact) {
  const today = new Date();

  // ── Step 1: Current Base Salary ───────────────────────────────────────────
  const salaryRecord = await prisma.employeeSalary.findFirst({
    where: {
      EmployeeID: employeeId,
      EffectiveFrom: { lte: today },
      OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: today } }],
    },
    orderBy: { EffectiveFrom: 'desc' },
  });

  if (!salaryRecord) {
    throw new AppError(`No active salary record found for employee ${employeeId}.`, 400, 'NO_SALARY_RECORD');
  }

  const baseSalary = Number(salaryRecord.BaseSalary);

  // ── Step 2: Active Allowances ─────────────────────────────────────────────
  const allowances = await prisma.employeeAllowance.findMany({
    where: {
      EmployeeID: employeeId,
      EffectiveFrom: { lte: today },
      OR: [{ EffectiveTo: null }, { EffectiveTo: { gte: today } }],
    },
    include: { Allowance: true },
  });

  const allowanceLines = allowances.map((ea) => ({
    description: ea.Allowance.AllowanceName,
    amount: Number(ea.OverrideAmount ?? ea.Allowance.Amount),
    type: 'Allowance',
  }));

  const totalAllowances = allowanceLines.reduce((sum, a) => sum + a.amount, 0);

  // ── Step 3: Absence Deduction ─────────────────────────────────────────────
  const payRunRecord = await prisma.payrollRun.findUnique({ where: { PayrollRunID: payrollRunId } });
  const { daysInMonth } = getMonthBounds(payRunRecord.PeriodYear, payRunRecord.PeriodMonth);
  const workingDaysInMonth = daysInMonth - 8; // ~23 days (approximation for Egyptian 5-day week + holidays)

  const maxDeductionDays = policy.MaxMonthlyDeductionDays || 5;
  const absentDays = attendanceSummary ? Math.min(Number(attendanceSummary.AbsentDays), maxDeductionDays) : 0;
  const dailyRate = baseSalary / workingDaysInMonth;
  const absenceDeduction = parseFloat((absentDays * dailyRate).toFixed(2));

  // ── Step 4: Unpaid Leave Deduction ────────────────────────────────────────
  const unpaidLeaveDays = leaveImpact?.unpaidLeaveDays || 0;
  const unpaidLeaveDeduction = parseFloat((unpaidLeaveDays * dailyRate).toFixed(2));

  // ── Step 5: Overtime Pay ──────────────────────────────────────────────────
  const overtimeHours = attendanceSummary ? Number(attendanceSummary.TotalOvertimeHrs) : 0;

  // Get overtime rule from policy
  const overtimeRule = policy.OvertimeRuleID
    ? await prisma.overtimeRule.findUnique({ where: { OvertimeRuleID: policy.OvertimeRuleID } })
    : null;

  const overtimePay = await calculateOvertimePay(baseSalary, overtimeHours, workingDaysInMonth, overtimeRule);

  // ── Step 6: Gross Income (before tax and SI) ──────────────────────────────
  const grossIncome = baseSalary + totalAllowances + overtimePay - absenceDeduction - unpaidLeaveDeduction;
  const taxableGross = Math.max(0, grossIncome);

  // ── Step 7: Social Insurance ──────────────────────────────────────────────
  const siConfig = await getSocialInsuranceConfig();
  const { siWage, employeeContrib, employerContrib } = calculateSocialInsurance(baseSalary, siConfig);

  // ── Step 8: Income Tax (on grossIncome - SI contribution) ────────────────
  const taxableAfterSI = Math.max(0, taxableGross - employeeContrib);
  const incomeTax = await calculateMonthlyIncomeTax(taxableAfterSI, payRunRecord.PeriodYear);

  // ── Step 9: Net Pay ───────────────────────────────────────────────────────
  let netPay = taxableGross - employeeContrib - incomeTax;
  netPay = parseFloat(Math.max(0, netPay).toFixed(2));

  // ── Step 10: Minimum Wage Check ───────────────────────────────────────────
  const minimumWage = Number(policy.MinimumWageEGP) || 6000;
  const belowMinimumWage = netPay < minimumWage;

  // ── Build Entry Lines (detailed breakdown) ────────────────────────────────
  const lines = [
    { description: 'Base Salary', amount: baseSalary, type: 'BaseSalary' },
    ...allowanceLines,
  ];

  if (overtimePay > 0) {
    lines.push({ description: `Overtime Pay (${overtimeHours.toFixed(1)}h)`, amount: overtimePay, type: 'OvertimePay' });
  }
  if (absenceDeduction > 0) {
    lines.push({ description: `Absence Deduction (${absentDays} days)`, amount: -absenceDeduction, type: 'AbsenceDeduction' });
  }
  if (unpaidLeaveDeduction > 0) {
    lines.push({ description: `Unpaid Leave Deduction (${unpaidLeaveDays} days)`, amount: -unpaidLeaveDeduction, type: 'UnpaidLeaveDeduction' });
  }
  lines.push({ description: 'Employee Social Insurance (7.25%)', amount: -employeeContrib, type: 'SocialInsurance' });
  lines.push({ description: 'Income Tax (Progressive)', amount: -incomeTax, type: 'IncomeTax' });

  return {
    employeeId,
    payrollRunId,
    baseSalary,
    totalEarnings: parseFloat((baseSalary + totalAllowances + overtimePay).toFixed(2)),
    totalDeductions: parseFloat((absenceDeduction + unpaidLeaveDeduction + employeeContrib + incomeTax).toFixed(2)),
    taxAmount: incomeTax,
    unpaidLeaveDeduction,
    overtimePay,
    socialInsuranceWage: siWage,
    employeeSocialInsurance: employeeContrib,
    employerSocialInsurance: employerContrib,
    netPay,
    grossIncome: parseFloat(taxableGross.toFixed(2)),
    belowMinimumWage,
    lines,
    // Metadata for PayrollException detection
    flags: {
      belowMinimumWage,
      highAbsence: absentDays >= maxDeductionDays,
      noSalaryRecord: false,
    },
  };
}

module.exports = {
  calculateEmployeePayroll,
  calculateAnnualIncomeTax,
  calculateMonthlyIncomeTax,
  calculateSocialInsurance,
  calculateOvertimePay,
  getSocialInsuranceConfig,
};
