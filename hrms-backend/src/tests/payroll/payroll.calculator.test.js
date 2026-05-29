// src/tests/payroll/payroll.calculator.test.js
//
// IMPORTANT: payroll.calculator.js only exports calculateEmployeePayroll.
// The helper functions (calculateAnnualIncomeTax, calculateSocialInsurance,
// calculateOvertimePay, getSocialInsuranceConfig) are internal to that file.
// We test them indirectly through calculateEmployeePayroll, which exercises
// all internal paths. The standalone tax/SI/overtime helpers that ARE exported
// live in payroll.service.js as calculateAnnualTax and getSocialInsuranceConfig
// and are tested in payroll.service.test.js.

const {
  calculateEmployeePayroll,
} = require('../../modules/payroll/services/payroll.calculator');

// calculateAnnualTax and getSocialInsuranceConfig are exported from service.js
const {
  calculateAnnualTax,
} = require('../../modules/payroll/services/payroll.service');

const prisma = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');

jest.mock('../../config/database', () =>
  require('../mocks/prisma.mock')
);

jest.mock('../../shared/utils/date.util', () => ({
  getMonthBounds: jest.fn(() => ({
    daysInMonth: 30,
  })),
}));

// ─────────────────────────────────────────────────────────────────────────────
// SHARED SETUP for calculateEmployeePayroll tests
// ─────────────────────────────────────────────────────────────────────────────

const mockPolicy = {
  MinimumWageEGP: 6000,
  MaxMonthlyDeductionDays: 5,
  OvertimeRuleID: 1,
  WorkingDaysInMonth: 22,
  WorkingHoursPerDay: 8,
  OvertimeRule: { Multiplier: 1.5 },
};

function setupCalculatorMocks() {
  prisma.payrollRun.findUnique.mockResolvedValue({
    PayrollRunID: 1,
    PeriodYear: 2025,
    PeriodMonth: 5,
    PeriodStartDate: new Date('2025-05-01'),
    PeriodEndDate: new Date('2025-05-31'),
  });

  prisma.employee.findUnique.mockResolvedValue({
    EmployeeID: 1,
    HireDate: new Date('2020-01-01'),
    TerminationDate: null,
  });

  prisma.employeeSalary.findFirst.mockResolvedValue({
    BaseSalary: 10000,
  });

  prisma.employeeAllowance.findMany.mockResolvedValue([
    {
      OverrideAmount: null,
      Allowance: {
        AllowanceName: 'Housing',
        Amount: 2000,
      },
    },
  ]);

  prisma.overtimeRule.findUnique.mockResolvedValue({
    Multiplier: 1.5,
  });

  prisma.socialInsuranceConfig.findFirst.mockResolvedValue({
    EmployeeRatePct: 7.25,
    EmployerRatePct: 18.75,
    EffectiveFrom: new Date('2020-01-01'),
    EffectiveTo: null,
  });

  prisma.taxBracket.findMany.mockResolvedValue([
    {
      PersonalExemptionEGP: 20000,
      FromAmountEGP: 0,
      ToAmountEGP: null,
      RatePct: 10,
      BracketOrder: 1,
    },
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('Payroll Calculator Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // TAX ENGINE — tested via service export
  // (calculateAnnualIncomeTax is internal to calculator.js;
  //  the exported equivalent in service.js is calculateAnnualTax)
  // ─────────────────────────────────────────────

  describe('calculateAnnualTax (via payroll.service export)', () => {
    test('should use 15% flat rate when no tax brackets configured', async () => {
      // Code behaviour: empty brackets → return annualIncome * 0.15
      prisma.taxBracket.findMany.mockResolvedValue([]);

      const result = await calculateAnnualTax(100000, 2025);

      expect(result).toBeCloseTo(15000, 0);
    });

    test('should calculate progressive tax correctly', async () => {
      prisma.taxBracket.findMany.mockResolvedValue([
        {
          PersonalExemptionEGP: 20000,
          FromAmountEGP: 0,
          ToAmountEGP: 15000,
          RatePct: 0,
          BracketOrder: 1,
        },
        {
          PersonalExemptionEGP: 20000,
          FromAmountEGP: 15000,
          ToAmountEGP: 30000,
          RatePct: 10,
          BracketOrder: 2,
        },
        {
          PersonalExemptionEGP: 20000,
          FromAmountEGP: 30000,
          ToAmountEGP: null,
          RatePct: 20,
          BracketOrder: 3,
        },
      ]);

      const result = await calculateAnnualTax(100000, 2025);

      expect(result).toBeGreaterThan(0);
      expect(typeof result).toBe('number');
    });

    test('should return 0 tax when income is below personal exemption', async () => {
      prisma.taxBracket.findMany.mockResolvedValue([
        {
          PersonalExemptionEGP: 20000,
          FromAmountEGP: 0,
          ToAmountEGP: null,
          RatePct: 10,
          BracketOrder: 1,
        },
      ]);

      // Income 15000 < exemption 20000 → taxableIncome = 0 → tax = 0
      const result = await calculateAnnualTax(15000, 2025);

      expect(result).toBe(0);
    });

    test('should handle extremely high salaries', async () => {
      prisma.taxBracket.findMany.mockResolvedValue([
        {
          PersonalExemptionEGP: 20000,
          FromAmountEGP: 0,
          ToAmountEGP: null,
          RatePct: 27.5,
          BracketOrder: 1,
        },
      ]);

      const result = await calculateAnnualTax(10000000, 2025);

      expect(result).toBeGreaterThan(1000000);
    });

    test('should apply Math.max(0) guard on taxableIncome', async () => {
      // personalExemption > income → taxableIncome clamped to 0 → tax = 0
      prisma.taxBracket.findMany.mockResolvedValue([
        {
          PersonalExemptionEGP: 500000,
          FromAmountEGP: 0,
          ToAmountEGP: null,
          RatePct: 10,
          BracketOrder: 1,
        },
      ]);

      const result = await calculateAnnualTax(15000, 2025);

      expect(result).toBe(0);
    });

    // NOTE: When brackets array is empty the service returns income * 0.15.
    // For negative income this yields a negative result (e.g. -1000 * 0.15 = -150).
    // This is a known limitation of the fallback path — no Math.max(0) guard there.
    // The test below documents this actual behaviour rather than asserting an ideal.
    test('should document fallback behaviour for negative income (no brackets)', async () => {
      prisma.taxBracket.findMany.mockResolvedValue([]);

      const result = await calculateAnnualTax(-1000, 2025);

      // Fallback: -1000 * 0.15 = -150
      expect(result).toBe(-150);
    });
  });

  // ─────────────────────────────────────────────
  // SOCIAL INSURANCE — tested through calculateEmployeePayroll
  // ─────────────────────────────────────────────

  describe('Social Insurance (via calculateEmployeePayroll)', () => {
    test('should apply correct employee SI rate to base salary', async () => {
      setupCalculatorMocks();

      prisma.socialInsuranceConfig.findFirst.mockResolvedValue({
        EmployeeRatePct: 7.25,
        EmployerRatePct: 18.75,
        EffectiveFrom: new Date('2020-01-01'),
        EffectiveTo: null,
      });

      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 0, TotalOvertimeHrs: 0 },
        {}
      );

      const siLine = result.lines.find(l => l.type === 'SocialInsurance');

      expect(siLine).toBeDefined();
      // 10000 base * 7.25% = 725
      expect(Math.abs(siLine.amount)).toBeCloseTo(725, 0);
    });

    test('should fall back to 7.25% when no SI config in DB', async () => {
      setupCalculatorMocks();

      prisma.socialInsuranceConfig.findFirst.mockResolvedValue(null);

      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 0, TotalOvertimeHrs: 0 },
        {}
      );

      const siLine = result.lines.find(l => l.type === 'SocialInsurance');

      expect(siLine).toBeDefined();
      expect(Math.abs(siLine.amount)).toBeCloseTo(725, 0);
    });

    test('should calculate SI on base salary only (not allowances)', async () => {
      setupCalculatorMocks();

      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 0, TotalOvertimeHrs: 0 },
        {}
      );

      // totalEarnings includes allowances but SI is on baseSalary only
      const siLine = result.lines.find(l => l.type === 'SocialInsurance');

      expect(siLine).toBeDefined();
      // Base is 10000, not 12000 (base + housing allowance)
      expect(Math.abs(siLine.amount)).toBeLessThan(1000);
    });
  });

  // ─────────────────────────────────────────────
  // OVERTIME — tested through calculateEmployeePayroll
  // ─────────────────────────────────────────────

  describe('Overtime Pay (via calculateEmployeePayroll)', () => {
    test('should return no overtime line when hours are 0', async () => {
      setupCalculatorMocks();

      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 0, TotalOvertimeHrs: 0 },
        {}
      );

      const overtimeLine = result.lines.find(l => l.type === 'OvertimePay');

      expect(overtimeLine).toBeUndefined();
    });

    test('should add overtime line when hours > 0', async () => {
      setupCalculatorMocks();

      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 0, TotalOvertimeHrs: 10 },
        {}
      );

      const overtimeLine = result.lines.find(l => l.type === 'OvertimePay');

      expect(overtimeLine).toBeDefined();
      expect(overtimeLine.amount).toBeGreaterThan(0);
    });

    test('should calculate overtime using policy multiplier', async () => {
      setupCalculatorMocks();

      const policyWith2x = { ...mockPolicy, OvertimeRule: { Multiplier: 2.0 } };
      const policyWith1x = { ...mockPolicy, OvertimeRule: { Multiplier: 1.0 } };

      const result2x = await calculateEmployeePayroll(
        1, 1, policyWith2x,
        { AbsentDays: 0, TotalOvertimeHrs: 10 },
        {}
      );

      jest.clearAllMocks();
      setupCalculatorMocks();

      const result1x = await calculateEmployeePayroll(
        1, 1, policyWith1x,
        { AbsentDays: 0, TotalOvertimeHrs: 10 },
        {}
      );

      const ot2x = result2x.lines.find(l => l.type === 'OvertimePay').amount;
      const ot1x = result1x.lines.find(l => l.type === 'OvertimePay').amount;

      expect(ot2x).toBeCloseTo(ot1x * 2, 0);
    });

    test('should handle fractional overtime hours', async () => {
      setupCalculatorMocks();

      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 0, TotalOvertimeHrs: 2.5 },
        {}
      );

      const overtimeLine = result.lines.find(l => l.type === 'OvertimePay');

      expect(overtimeLine).toBeDefined();
      expect(overtimeLine.amount).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────
  // MAIN PAYROLL ENGINE — calculateEmployeePayroll
  // ─────────────────────────────────────────────

  describe('calculateEmployeePayroll', () => {
    beforeEach(() => {
      setupCalculatorMocks();
    });

    test('should calculate full payroll successfully', async () => {
      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 1, TotalOvertimeHrs: 5 },
        { unpaidLeaveDays: 1 }
      );

      expect(result.employeeId).toBe(1);
      expect(result.netPay).toBeGreaterThan(0);
      expect(result.grossIncome).toBeGreaterThan(0);
      expect(result.lines.length).toBeGreaterThan(0);
    });

    test('should throw AppError when salary record is missing', async () => {
      prisma.employeeSalary.findFirst.mockResolvedValue(null);

      await expect(
        calculateEmployeePayroll(1, 1, mockPolicy, {}, {})
      ).rejects.toThrow(AppError);
    });

    test('should throw AppError when policy is missing', async () => {
      await expect(
        calculateEmployeePayroll(1, 1, null, {}, {})
      ).rejects.toThrow(AppError);
    });

    test('should flag high absence when absent days exceed policy cap', async () => {
      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 100, TotalOvertimeHrs: 0 },
        {}
      );

      // Absent days 100 > MaxMonthlyDeductionDays 5 → highAbsence flag
      expect(result.flags.highAbsence).toBe(true);
    });

    test('should not flag high absence when absent days are within cap', async () => {
      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 2, TotalOvertimeHrs: 0 },
        {}
      );

      expect(result.flags.highAbsence).toBe(false);
    });

    test('should flag belowMinimumWage when net pay is under policy minimum', async () => {
      prisma.employeeSalary.findFirst.mockResolvedValue({
        BaseSalary: 3000,
      });

      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 5, TotalOvertimeHrs: 0 },
        { unpaidLeaveDays: 5 }
      );

      expect(result.belowMinimumWage).toBe(true);
    });

    test('should never return negative net pay', async () => {
      prisma.employeeSalary.findFirst.mockResolvedValue({
        BaseSalary: 1,
      });

      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 100, TotalOvertimeHrs: 0 },
        { unpaidLeaveDays: 100 }
      );

      expect(result.netPay).toBeGreaterThanOrEqual(0);
    });

    test('should include absence deduction line when absent days > 0', async () => {
      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 2, TotalOvertimeHrs: 0 },
        {}
      );

      const line = result.lines.find(l => l.type === 'AbsenceDeduction');

      expect(line).toBeDefined();
      expect(line.amount).toBeLessThan(0);
    });

    test('should correctly accumulate total deductions', async () => {
      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 2, TotalOvertimeHrs: 5 },
        { unpaidLeaveDays: 2 }
      );

      expect(result.totalDeductions).toBeGreaterThan(0);
    });

    test('should calculate totalEarnings as base + allowances + overtime only', async () => {
      prisma.employeeAllowance.findMany.mockResolvedValue([]);

      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 0, TotalOvertimeHrs: 0 },
        {}
      );

      // No allowances, no overtime → totalEarnings = baseSalary only
      expect(result.totalEarnings).toBe(10000);
    });

    test('should handle null attendance summary gracefully', async () => {
      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        null,
        {}
      );

      expect(result.netPay).toBeGreaterThan(0);
    });

    test('should handle null leave impact gracefully', async () => {
      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 0, TotalOvertimeHrs: 0 },
        null
      );

      expect(result.netPay).toBeGreaterThan(0);
    });

    test('should preserve financial precision (result is finite number)', async () => {
      prisma.employeeSalary.findFirst.mockResolvedValue({
        BaseSalary: 10000.99,
      });

      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 1, TotalOvertimeHrs: 2.5 },
        {}
      );

      expect(Number.isFinite(result.netPay)).toBe(true);
      expect(Number.isFinite(result.grossIncome)).toBe(true);
      expect(Number.isFinite(result.totalDeductions)).toBe(true);
    });

    test('should include social insurance line in output', async () => {
      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 0, TotalOvertimeHrs: 0 },
        {}
      );

      const siLine = result.lines.find(l => l.type === 'SocialInsurance');

      expect(siLine).toBeDefined();
    });

    test('should include income tax line in output', async () => {
      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 0, TotalOvertimeHrs: 0 },
        {}
      );

      const taxLine = result.lines.find(l => l.type === 'IncomeTax');

      expect(taxLine).toBeDefined();
    });

    test('should prorate salary for new hire joining mid-month', async () => {
      // Employee hired on the 16th of a 30-day month → ~50% proration
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
        HireDate: new Date('2025-05-16'),
        TerminationDate: null,
      });

      const result = await calculateEmployeePayroll(
        1, 1, mockPolicy,
        { AbsentDays: 0, TotalOvertimeHrs: 0 },
        {}
      );

      // Prorated salary should be less than full month
      expect(result.baseSalary).toBeLessThan(10000);
    });
  });
});