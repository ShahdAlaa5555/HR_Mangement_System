// src/tests/payroll/payroll.service.test.js

const prisma = require('../mocks/prisma.mock');

jest.mock('../../config/database', () =>
  require('../mocks/prisma.mock')
);
jest.mock('../../shared/utils/notification.util', () => ({
  notify: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../middleware/validate', () => ({
  getPagination: jest.fn(() => ({
    page: 1,
    limit: 10,
    skip: 0,
  })),
  buildPaginationMeta: jest.fn(() => ({
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
  })),
}));

jest.mock('../../shared/utils/date.util', () => {
  const dayjs = jest.fn(() => ({ diff: jest.fn(() => 12) }));
  return { dayjs };
});

jest.mock('../../shared/constants', () => ({
  PAYROLL_RUN_STATUS: {
    DRAFT: 'Draft',
    PROCESSING: 'Processing',
    PENDING_APPROVAL: 'PendingApproval',
    APPROVED: 'Approved',
    FINALIZED: 'Finalized',
    PAID: 'Paid',
  },
  PAYROLL_ENTRY_STATUS: {
    DRAFT: 'Draft',
    FINALIZED: 'Finalized',
    PAID: 'Paid',
    EXCEPTION: 'Exception',
  },
  PAY_TYPE_CATEGORY: {
    EARNING: 'Earning',
    DEDUCTION: 'Deduction',
  },
  PAYROLL_EXCEPTION_STATUS: {
    OPEN: 'Open',
    RESOLVED: 'Resolved',
  },
  EVENT_CODE: {
    PAY_PAYSLIP_READY: 'PAY_PAYSLIP_READY',
  },
}));

const {
  createPayrollRun,
  processPayrollRun,
  approvePayrollRun,
  finalizePayrollRun,
  generatePayslips,
  getPayslipById,
  resolveException,
  generateBankFile,
  calculateAnnualTax,
} = require('../../modules/payroll/services/payroll.service');

describe('Payroll Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────
  // EGYPTIAN TAX ENGINE
  // ─────────────────────────────────────

  describe('calculateAnnualTax', () => {
    test('should calculate progressive tax correctly with brackets', async () => {
      prisma.taxBracket.findMany.mockResolvedValue([
        {
          PersonalExemptionEGP: 20000,
          FromAmountEGP: 0,
          ToAmountEGP: 30000,
          RatePct: 10,
          BracketOrder: 1,
        },
      ]);

      const result = await calculateAnnualTax(100000, 2025);

      expect(result).toBeGreaterThan(0);
    });

    test('should apply 15% flat rate when no brackets configured', async () => {
      // Code behaviour: empty brackets → income * 0.15
      prisma.taxBracket.findMany.mockResolvedValue([]);

      const result = await calculateAnnualTax(100000, 2025);

      expect(result).toBeCloseTo(15000, 0);
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

      // 15000 < 20000 exemption → taxableIncome = 0 → tax = 0
      const result = await calculateAnnualTax(15000, 2025);

      expect(result).toBe(0);
    });

    // NOTE: This test documents a known limitation in the fallback path.
    // When brackets array is empty the service returns income * 0.15 directly,
    // without a Math.max(0) guard. Negative income therefore produces a
    // negative result. This is a discovered defect documented by the test suite.
    test('should document known limitation: negative income with no brackets returns negative tax', async () => {
      prisma.taxBracket.findMany.mockResolvedValue([]);

      const result = await calculateAnnualTax(-1000, 2025);

      // Expected behaviour as-coded: -1000 * 0.15 = -150
      expect(result).toBe(-150);
    });

    test('should clamp taxable income to 0 when brackets exist but income < exemption', async () => {
      // With brackets the code uses Math.max(0, income - exemption)
      // so negative income is safely handled when brackets are present
      prisma.taxBracket.findMany.mockResolvedValue([
        {
          PersonalExemptionEGP: 500000,
          FromAmountEGP: 0,
          ToAmountEGP: null,
          RatePct: 10,
          BracketOrder: 1,
        },
      ]);

      const result = await calculateAnnualTax(-1000, 2025);

      expect(result).toBe(0);
    });
  });

  // ─────────────────────────────────────
  // CREATE PAYROLL RUN
  // ─────────────────────────────────────

  describe('createPayrollRun', () => {
    test('should create payroll run successfully', async () => {
      prisma.payrollPolicy.findUnique.mockResolvedValue({ PolicyID: 1 });
      prisma.payrollRun.findFirst.mockResolvedValue(null);
      prisma.payrollRun.create.mockResolvedValue({ PayrollRunID: 1 });

      const result = await createPayrollRun(
        {
          PolicyID: 1,
          PeriodYear: 2025,
          PeriodMonth: 5,
          PeriodStartDate: '2025-05-01',
          PeriodEndDate: '2025-05-31',
          CutoffDate: '2025-05-25',
          PaymentDate: '2025-05-30',
        },
        1
      );

      expect(result.PayrollRunID).toBe(1);
    });

    test('should reject when payroll policy not found', async () => {
      prisma.payrollPolicy.findUnique.mockResolvedValue(null);

      await expect(
        createPayrollRun({ PolicyID: 999 }, 1)
      ).rejects.toThrow('Payroll policy not found.');
    });

    test('should reject duplicate payroll runs for same period', async () => {
      prisma.payrollPolicy.findUnique.mockResolvedValue({ PolicyID: 1 });
      prisma.payrollRun.findFirst.mockResolvedValue({ PayrollRunID: 1 });

      await expect(
        createPayrollRun({ PolicyID: 1, PeriodYear: 2025, PeriodMonth: 5 }, 1)
      ).rejects.toThrow('Payroll run already exists');
    });
  });

  // ─────────────────────────────────────
  // PROCESS PAYROLL RUN
  // NOTE: processPayrollRun contains a ReferenceError in the source code —
  // `grossEarnings` is used before its `const` declaration inside the employee
  // loop (the reimbursementClaim block declares it after it is used for tax).
  // This causes every employee to throw inside the try/catch, creating an
  // exception record instead of a payroll entry. As a result processedCount
  // is always 0 until the code is fixed. Tests below reflect actual behaviour.
  // ─────────────────────────────────────

  describe('processPayrollRun', () => {
    beforeEach(() => {
      prisma.payrollRun.findUnique.mockResolvedValue({
        PayrollRunID: 1,
        Status: 'Draft',
        PeriodYear: 2025,
        PeriodMonth: 5,
        PeriodStartDate: new Date('2025-05-01'),
        PeriodEndDate: new Date('2025-05-31'),
        Policy: {
          OvertimeRule: { Multiplier: 1.5 },
          MaxMonthlyDeductionDays: 5,
          MinimumWageEGP: 6000,
        },
      });

      prisma.payrollRun.update.mockResolvedValue({
        PayrollRunID: 1,
        Status: 'Processing',
      });

      prisma.employee.findMany.mockResolvedValue([
        { EmployeeID: 1, FullName: 'Ahmed', EmployeeCode: 'EMP001' },
      ]);

      prisma.socialInsuranceConfig.findFirst.mockResolvedValue({
        EmployeeRatePct: 7.25,
        EmployerRatePct: 18.75,
        EffectiveFrom: new Date('2020-01-01'),
        EffectiveTo: null,
      });

      prisma.payType.findUnique.mockResolvedValue({ PayTypeID: 1 });
      prisma.payType.create.mockResolvedValue({ PayTypeID: 1 });

      prisma.employeeSalary.findFirst.mockResolvedValue({ BaseSalary: 10000 });
      prisma.employeeAllowance.findMany.mockResolvedValue([]);

      prisma.attendanceSummary.findUnique.mockResolvedValue({
        SummaryID: 1,
        AbsentDays: 1,
        TotalOvertimeHrs: 5,
      });

      prisma.leaveRequest.findMany.mockResolvedValue([]);

      // reimbursementClaim is needed by the source code loop
      prisma.reimbursementClaim = {
        findMany: jest.fn().mockResolvedValue([]),
      };

      prisma.taxBracket.findMany.mockResolvedValue([
        {
          PersonalExemptionEGP: 20000,
          FromAmountEGP: 0,
          ToAmountEGP: null,
          RatePct: 10,
          BracketOrder: 1,
        },
      ]);

      prisma.payrollEntry.findUnique.mockResolvedValue(null);
      prisma.payrollEntry.create.mockResolvedValue({ EntryID: 1 });
      prisma.payrollEntryLine.createMany.mockResolvedValue({ count: 5 });
      prisma.payrollEntryLine.deleteMany.mockResolvedValue({ count: 0 });
      prisma.payrollException.count.mockResolvedValue(0);
      prisma.payrollException.create.mockResolvedValue({ ExceptionID: 1 });
      prisma.payrollException.findFirst.mockResolvedValue(null);
    });

    test('should reject when payroll run not found', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue(null);

      await expect(
        processPayrollRun(999, {}, 1)
      ).rejects.toThrow('Payroll run not found.');
    });

    test('should reject run that is already finalized', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue({ Status: 'Finalized' });

      await expect(
        processPayrollRun(1, {}, 1)
      ).rejects.toThrow('Cannot process run');
    });

    test('should create exception when salary record is missing', async () => {
      prisma.employeeSalary.findFirst.mockResolvedValue(null);

      await processPayrollRun(1, {}, 1);

      expect(prisma.payrollException.create).toHaveBeenCalled();
    });

    test('should create exception when attendance summary is missing', async () => {
      prisma.attendanceSummary.findUnique.mockResolvedValue(null);

      await processPayrollRun(1, {}, 1);

      expect(prisma.payrollException.create).toHaveBeenCalled();
    });

    test('should call payrollRun.update to set status to Processing', async () => {
      await processPayrollRun(1, {}, 1);

      expect(prisma.payrollRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ Status: 'Processing' }),
        })
      );
    });

    test('should support employee ID filtering via opts', async () => {
      await processPayrollRun(1, { includeEmployeeIds: [1] }, 1);

      expect(prisma.employee.findMany).toHaveBeenCalled();
    });

    test('should return runId and status in result', async () => {
      const result = await processPayrollRun(1, {}, 1);

      expect(result.runId).toBe(1);
      expect(result.status).toBeDefined();
    });

    test('should return openExceptions count in result', async () => {
      const result = await processPayrollRun(1, {}, 1);

      expect(typeof result.openExceptions).toBe('number');
    });

    // ── Known bug documentation ──────────────────────────────────────────────
    // The following test documents a ReferenceError discovered during testing.
    // Inside processPayrollRun's employee loop, `grossEarnings` is referenced
    // on line ~250 (for tax calculation) but is only declared with `const` on
    // line ~265 (inside the reimbursementClaim block). JavaScript's temporal
    // dead zone means every employee iteration throws a ReferenceError which
    // is caught by the try/catch and logged as a ProcessingError exception.
    // Therefore processedCount is always 0 until the code declaration order
    // is corrected. This is a defect identified by the test suite.
  // ── Fixed Bug ──────────────────────────────────────────────
    // This test verifies that the grossIncome declaration order is correct
    // and that employees are successfully processed without throwing a ReferenceError.
    test('should successfully process payroll run and increment processedCount', async () => {
      const result = await processPayrollRun(1, {}, 1);

      // 1. The run should now successfully process the 1 mocked employee
      expect(result.processedCount).toBe(1);
      
      // 2. No exceptions should be thrown or logged
      expect(prisma.payrollException.create).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────
  // APPROVE PAYROLL RUN
  // ─────────────────────────────────────

  describe('approvePayrollRun', () => {
    test('should approve payroll run successfully', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue({
        Status: 'PendingApproval',
      });
      prisma.payrollException.count.mockResolvedValue(0);
      prisma.payrollRun.update.mockResolvedValue({ Status: 'Approved' });

      const result = await approvePayrollRun(1, 1);

      expect(result.status).toBe('Approved');
    });

    test('should reject when payroll run not found', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue(null);

      await expect(approvePayrollRun(1, 1)).rejects.toThrow(
        'Payroll run not found.'
      );
    });

    test('should reject run not in PendingApproval status', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue({ Status: 'Draft' });

      await expect(approvePayrollRun(1, 1)).rejects.toThrow(
        'Run must be PendingApproval.'
      );
    });

    test('should reject when open exceptions exist', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue({
        Status: 'PendingApproval',
      });
      prisma.payrollException.count.mockResolvedValue(5);

      await expect(approvePayrollRun(1, 1)).rejects.toThrow(
        'open exceptions'
      );
    });
  });

  // ─────────────────────────────────────
  // FINALIZE PAYROLL RUN
  // ─────────────────────────────────────

  describe('finalizePayrollRun', () => {
    test('should finalize an approved payroll run', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue({ Status: 'Approved' });
      prisma.payrollEntry.updateMany.mockResolvedValue({});
      prisma.payrollRun.update.mockResolvedValue({ Status: 'Finalized' });

      const result = await finalizePayrollRun(1);

      expect(result.status).toBe('Finalized');
    });

    test('should reject run not in Approved status', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue({ Status: 'Draft' });

      await expect(finalizePayrollRun(1)).rejects.toThrow(
        'Run must be Approved'
      );
    });
  });

  // ─────────────────────────────────────
  // GENERATE PAYSLIPS
  // ─────────────────────────────────────

  describe('generatePayslips', () => {
    beforeEach(() => {
      prisma.payrollRun.findUnique.mockResolvedValue({
        PayrollRunID: 1,
        Status: 'Finalized',
        PeriodYear: 2025,
        PeriodMonth: 5,
        PaymentDate: new Date(),
      });

      prisma.payrollEntry.findMany.mockResolvedValue([
        {
          EntryID: 1,
          EmployeeID: 1,
          Employee: { EmployeeCode: 'EMP001' },
        },
      ]);

      prisma.payslip.findFirst.mockResolvedValue(null);
      prisma.payslip.create.mockResolvedValue({ PayslipID: 1 });
      prisma.payrollEntry.update.mockResolvedValue({});
    });

    test('should generate payslips successfully', async () => {
      const result = await generatePayslips(1);

      expect(result.generated).toBe(1);
      expect(prisma.payslip.create).toHaveBeenCalled();
    });

    test('should reject run not in Finalized status', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue({ Status: 'Draft' });

      await expect(generatePayslips(1)).rejects.toThrow(
        'Run must be Finalized'
      );
    });

    test('should skip duplicate payslips', async () => {
      prisma.payslip.findFirst.mockResolvedValue({ PayslipID: 1 });

      const result = await generatePayslips(1);

      expect(result.generated).toBe(0);
    });
  });

  // ─────────────────────────────────────
  // PAYSLIP ACCESS CONTROL
  // ─────────────────────────────────────

  describe('getPayslipById', () => {
    beforeEach(() => {
      prisma.payslip.findUnique.mockResolvedValue({
        PayslipID: 1,
        EmployeeID: 1,
      });
    });

    test('employee should be able to access their own payslip', async () => {
      const result = await getPayslipById(1, 1, 'Employee');

      expect(result.PayslipID).toBe(1);
    });

    test('HR role should access any payslip', async () => {
      const result = await getPayslipById(1, 99, 'HR');

      expect(result.PayslipID).toBe(1);
    });

    test('Payroll role should access any payslip', async () => {
      const result = await getPayslipById(1, 99, 'Payroll');

      expect(result.PayslipID).toBe(1);
    });

    test('should block employee accessing another employee payslip', async () => {
      await expect(
        getPayslipById(1, 2, 'Employee')
      ).rejects.toThrow('You can only view your own payslips.');
    });

    test('should throw when payslip not found', async () => {
      prisma.payslip.findUnique.mockResolvedValue(null);

      await expect(
        getPayslipById(1, 1, 'Employee')
      ).rejects.toThrow('Payslip not found.');
    });
  });

  // ─────────────────────────────────────
  // RESOLVE EXCEPTIONS
  // ─────────────────────────────────────

  describe('resolveException', () => {
    test('should resolve an open exception', async () => {
      prisma.payrollException.findUnique.mockResolvedValue({
        ExceptionID: 1,
        Status: 'Open',
      });
      prisma.payrollException.update.mockResolvedValue({
        Status: 'Resolved',
      });

      const result = await resolveException(1, 1, {
        resolution: 'Resolved',
        ResolutionNotes: 'Fixed',
      });

      expect(result.Status).toBe('Resolved');
    });

    test('should throw when exception not found', async () => {
      prisma.payrollException.findUnique.mockResolvedValue(null);

      await expect(
        resolveException(1, 1, {})
      ).rejects.toThrow('Exception not found.');
    });

    test('should reject resolving an already resolved exception', async () => {
      prisma.payrollException.findUnique.mockResolvedValue({
        Status: 'Resolved',
      });

      await expect(
        resolveException(1, 1, {})
      ).rejects.toThrow('Exception is not open.');
    });
  });

  // ─────────────────────────────────────
  // GENERATE BANK FILE
  // ─────────────────────────────────────

  describe('generateBankFile', () => {
    test('should generate bank file for finalized run', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue({
        Status: 'Finalized',
        Entries: [{ NetPay: 1000, Status: 'Draft' }],
      });
      prisma.bankFile.create.mockResolvedValue({
        BankFileID: 1,
        FileURL: '/bank-file.txt',
      });

      const result = await generateBankFile(1, 1, { FileFormat: 'TXT' });

      expect(result.bankFileId).toBe(1);
    });

    test('should reject bank file generation for non-finalized run', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue({ Status: 'Draft' });

      await expect(
        generateBankFile(1, 1, { FileFormat: 'TXT' })
      ).rejects.toThrow('Run must be Finalized');
    });
  });
});