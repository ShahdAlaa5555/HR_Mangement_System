// src/tests/mocks/prisma.mock.js

const prisma = {
  // ─────────────────────────────────────
  // EMPLOYEE
  // ─────────────────────────────────────

  employee: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },

  employeeSalary: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },

  employeeAllowance: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },

  employeeAuditLog: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },

  employeeChangeRequest: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },

  emergencyContact: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },

  employeeSkill: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },

  employeeDocument: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },

  employeeNote: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },

  employeeRole: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },

  fieldVisibility: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },

  // ─────────────────────────────────────
  // PAYROLL RUN
  // ─────────────────────────────────────

  payrollRun: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({ PayrollRunID: 1, Status: 'Processing' }),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },

  payrollPolicy: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },

  payrollEntry: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn().mockResolvedValue({ EntryID: 1 }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },

  payrollEntryLine: {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn().mockResolvedValue({ count: 5 }),
    update: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },

  payrollException: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn().mockResolvedValue({ ExceptionID: 1 }),
    update: jest.fn().mockResolvedValue({ ExceptionID: 1 }),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },

  // ─────────────────────────────────────
  // PAY TYPES
  // ─────────────────────────────────────

  payType: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },

  payGrade: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },

  // ─────────────────────────────────────
  // ORGANISATION
  // ─────────────────────────────────────

  department: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },

  position: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },

  workLocation: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },

  allowance: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },

  overtimeRule: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },

  shiftDifferential: {
    findMany: jest.fn(),
  },

  // ─────────────────────────────────────
  // PAYSLIPS
  // ─────────────────────────────────────

  payslip: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },

  bankFile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },

  // ─────────────────────────────────────
  // TAX + INSURANCE
  // ─────────────────────────────────────

  taxBracket: {
    findMany: jest.fn(),
  },

  socialInsuranceConfig: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },

  // ─────────────────────────────────────
  // LEAVE
  // ─────────────────────────────────────

  leaveType: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },

  leavePolicy: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },

  leaveRequest: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },

  leaveBalance: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
  },

  leaveApproval: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },

  approvalStep: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },

  leaveActionLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },

  leaveDelegation: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },

  holidayCalendar: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },

  // ─────────────────────────────────────
  // ATTENDANCE
  // ─────────────────────────────────────

  attendanceRecord: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
  },

  attendanceSummary: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },

  attendanceCorrectionRequest: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },

  overtimeRequest: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },

  employeeShiftAssignment: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },

  shift: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },

  // ─────────────────────────────────────
  // NOTIFICATIONS
  // ─────────────────────────────────────

  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },

  // ─────────────────────────────────────
  // RAW SQL
  // ─────────────────────────────────────

  $queryRaw: jest.fn(),

  $executeRaw: jest.fn(),

  // ─────────────────────────────────────
  // TRANSACTION SUPPORT
  // ─────────────────────────────────────

  $transaction: jest.fn(async (arg) => {
    // ARRAY STYLE: prisma.$transaction([promise1, promise2])
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }

    // CALLBACK STYLE: prisma.$transaction(async (tx) => { ... })
    if (typeof arg === 'function') {
      const tx = {

        // ── Payroll ──────────────────────
        payrollRun: {
          create: jest.fn().mockResolvedValue({ PayrollRunID: 1 }),
          update: jest.fn().mockResolvedValue({ PayrollRunID: 1, Status: 'Processing' }),
        },

        payrollEntry: {
          create: jest.fn().mockResolvedValue({ EntryID: 1 }),
          update: jest.fn().mockResolvedValue({ EntryID: 1 }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },

        payrollEntryLine: {
          createMany: jest.fn().mockResolvedValue({ count: 5 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },

        payrollException: {
          create: jest.fn().mockResolvedValue({ ExceptionID: 1 }),
          update: jest.fn().mockResolvedValue({ ExceptionID: 1 }),
        },

        payslip: {
          create: jest.fn().mockResolvedValue({ PayslipID: 1 }),
          update: jest.fn().mockResolvedValue({ PayslipID: 1 }),
        },

        bankFile: {
          create: jest.fn().mockResolvedValue({ BankFileID: 1 }),
        },

        // ── Leave ────────────────────────
        leaveRequest: {
          create: jest.fn().mockResolvedValue({
            LeaveRequestID: 1,
            Status: 'SUBMITTED',
          }),
          update: jest.fn().mockResolvedValue({
            LeaveRequestID: 1,
            Status: 'APPROVED',
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },

        leaveApproval: {
          create: jest.fn().mockResolvedValue({ ApprovalID: 1 }),
          update: jest.fn().mockResolvedValue({ ApprovalID: 1 }),
        },

        leaveBalance: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ LeaveBalanceID: 1 }),
          update: jest.fn().mockResolvedValue({ LeaveBalanceID: 1 }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          upsert: jest.fn().mockResolvedValue({ LeaveBalanceID: 1 }),
        },

        leaveActionLog: {
          create: jest.fn().mockResolvedValue({ LogID: 1 }),
        },

        leaveDelegation: {
          create: jest.fn().mockResolvedValue({
            DelegationID: 1,
            Status: 'ACTIVE',
          }),
          update: jest.fn().mockResolvedValue({ DelegationID: 1 }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },

        // ── Attendance ───────────────────
        attendanceRecord: {
          create: jest.fn().mockResolvedValue({ AttendanceID: 1 }),
          update: jest.fn().mockResolvedValue({ AttendanceID: 1 }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          upsert: jest.fn().mockResolvedValue({ AttendanceID: 1 }),
        },

        attendanceSummary: {
          create: jest.fn().mockResolvedValue({ SummaryID: 1 }),
          update: jest.fn().mockResolvedValue({ SummaryID: 1 }),
        },

        attendanceCorrectionRequest: {
          create: jest.fn().mockResolvedValue({ CorrectionID: 1 }),
          update: jest.fn().mockResolvedValue({
            CorrectionID: 1,
            Status: 'Approved',
          }),
        },

        overtimeRequest: {
          create: jest.fn().mockResolvedValue({ OvertimeRequestID: 1 }),
          update: jest.fn().mockResolvedValue({ OvertimeRequestID: 1 }),
        },

        // ── Employee ─────────────────────
        employee: {
          create: jest.fn().mockResolvedValue({ EmployeeID: 1 }),
          update: jest.fn().mockResolvedValue({ EmployeeID: 1 }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },

        employeeSalary: {
          create: jest.fn().mockResolvedValue({ SalaryID: 1 }),
          update: jest.fn().mockResolvedValue({ SalaryID: 1 }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },

        employeeAuditLog: {
          create: jest.fn().mockResolvedValue({ AuditID: 1 }),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },

        employeeChangeRequest: {
          create: jest.fn().mockResolvedValue({ ChangeRequestID: 1 }),
          update: jest.fn().mockResolvedValue({ ChangeRequestID: 1 }),
        },

        notification: {
          create: jest.fn().mockResolvedValue({ NotificationID: 1 }),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };

      return arg(tx);
    }

    return null;
  }),

  // ─────────────────────────────────────
  // RESET ALL MOCKS
  // Note: call prisma.resetAllMocks() in afterEach if you want a
  // full wipe including implementations. For most tests, Jest's
  // built-in jest.clearAllMocks() in beforeEach is sufficient to
  // clear call history while keeping mockResolvedValue defaults.
  // ─────────────────────────────────────

  resetAllMocks: () => {
    Object.values(prisma).forEach((model) => {
      if (model && typeof model === 'object' && !Array.isArray(model)) {
        Object.values(model).forEach((fn) => {
          if (jest.isMockFunction(fn)) {
            fn.mockReset();
          }
        });
      }
    });
  },
};

module.exports = prisma;