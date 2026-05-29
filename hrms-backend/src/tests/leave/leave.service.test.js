// src/tests/leave/leave.service.test.js

jest.mock('../../config/database', () =>
  require('../mocks/prisma.mock')
);
jest.mock('../../shared/utils/notification.util', () => ({
  notify: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../shared/utils/date.util', () => ({
  countEgyptianBusinessDays: jest.fn(() => 5),
  dayjs: jest.fn(() => ({
    diff: jest.fn(() => 12),
  })),
}));

jest.mock('../../modules/attendance/services/attendance.service', () => ({
  markAttendanceAsOnLeave: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../middleware/validate', () => ({
  getPagination: jest.fn(() => ({
    skip: 0,
    take: 10,
  })),
  buildPaginationMeta: jest.fn(() => ({
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
  })),
}));

jest.mock('../../shared/constants', () => ({
  LEAVE_REQUEST_STATUS: {},
  LEAVE_APPROVAL_DECISION: {},
  EMPLOYEE_STATUS: {},
  EVENT_CODE: {},
}));
const prisma = require('../mocks/prisma.mock');
const {
  listLeaveTypes,
  createLeaveType,
  listLeavePolicies,
  createLeavePolicy,
  getLeaveBalanceDashboard,
  initializeLeaveBalances,
  adjustBalance,
  submitLeaveRequest,
  updateLeaveRequest,
  cancelLeaveRequest,
  processApproval,
  bulkProcessRequests,
  delegateApproval,
  listLeaveRequests,
  getManagerInbox,
  getLeaveRequestById,
  getMyLeaveRequests,
  listHolidays,
  createHoliday,
  getLeaveAnalytics,
  syncLeaveToPayroll,
  bulkSyncPayroll,
  updateGlobalEntitlements,
} = require('../../modules/leave/services/leave.service');

describe('Leave Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    prisma.$transaction = jest.fn(async (callback) => {
      return callback(prisma);
    });
  });

  // ─────────────────────────────────────
  // LEAVE TYPES
  // ─────────────────────────────────────

  describe('listLeaveTypes', () => {
    test('should return leave types', async () => {
      prisma.leaveType.findMany.mockResolvedValue([
        { LeaveTypeID: 1, Name: 'Annual' },
      ]);

      const result = await listLeaveTypes();

      expect(result.length).toBe(1);
    });
  });

  describe('createLeaveType', () => {
    test('should create leave type', async () => {
      prisma.leaveType.create.mockResolvedValue({
        LeaveTypeID: 1,
      });

      const result = await createLeaveType({
        Name: 'Annual',
      });

      expect(result.LeaveTypeID).toBe(1);
    });
  });

  // ─────────────────────────────────────
  // LEAVE POLICIES
  // ─────────────────────────────────────

  describe('listLeavePolicies', () => {
    test('should return policies', async () => {
      prisma.leavePolicy.findMany.mockResolvedValue([
        { LeavePolicyID: 1 },
      ]);

      const result = await listLeavePolicies();

      expect(result.length).toBe(1);
    });
  });

  describe('createLeavePolicy', () => {
    test('should create leave policy', async () => {
      prisma.leavePolicy.create.mockResolvedValue({
        LeavePolicyID: 1,
      });

      const result = await createLeavePolicy({
        LeaveTypeID: 1,
      });

      expect(result.LeavePolicyID).toBe(1);
    });
  });

  // ─────────────────────────────────────
  // BALANCE DASHBOARD
  // ─────────────────────────────────────

  describe('getLeaveBalanceDashboard', () => {
    test('should return leave balances', async () => {
      prisma.leaveBalance.findMany.mockResolvedValue([
        { LeaveBalanceID: 1 },
      ]);

      const result = await getLeaveBalanceDashboard(1);

      expect(result.length).toBe(1);
    });
  });

  // ─────────────────────────────────────
  // INITIALIZE BALANCES
  // ─────────────────────────────────────

  describe('initializeLeaveBalances', () => {
    test('should initialize balances successfully', async () => {
      prisma.leaveType.findMany.mockResolvedValue([
        {
          LeaveTypeID: 1,
          DefaultDays: 21,
        },
      ]);

      prisma.leaveBalance.upsert.mockResolvedValue({
        LeaveBalanceID: 1,
      });

      const result = await initializeLeaveBalances(
        1,
        2025
      );

      expect(result.assignedCount).toBe(1);

      expect(prisma.leaveBalance.upsert).toHaveBeenCalled();
    });

    test('should reject when no leave types exist', async () => {
      prisma.leaveType.findMany.mockResolvedValue([]);

      await expect(
        initializeLeaveBalances(1, 2025)
      ).rejects.toThrow('No leave types found');
    });

    test('should support specific leave type initialization', async () => {
      prisma.leaveType.findMany.mockResolvedValue([
        {
          LeaveTypeID: 5,
          DefaultDays: 15,
        },
      ]);

      await initializeLeaveBalances(
        1,
        2025,
        5
      );

      expect(
        prisma.leaveType.findMany
      ).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────
  // ADJUST BALANCE
  // ─────────────────────────────────────

  describe('adjustBalance', () => {
    test('should adjust leave balance', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue({
        LeaveBalanceID: 1,
      });

      prisma.leaveBalance.update.mockResolvedValue({
        LeaveBalanceID: 1,
      });

      const result = await adjustBalance(
        {
          EmployeeID: 1,
          LeaveTypeID: 1,
          AdjustedDays: 2,
          Reason: 'Manual fix',
        },
        99
      );

      expect(result.LeaveBalanceID).toBe(1);
    });

    test('should reject missing balance', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(
        null
      );

      await expect(
        adjustBalance(
          {
            EmployeeID: 1,
            LeaveTypeID: 1,
            AdjustedDays: 2,
          },
          1
        )
      ).rejects.toThrow('Balance record not found');
    });
  });

  // ─────────────────────────────────────
  // SUBMIT LEAVE REQUEST
  // ─────────────────────────────────────

  describe('submitLeaveRequest', () => {
    beforeEach(() => {
      prisma.leavePolicy.findFirst.mockResolvedValue({
        MinTenureMonths: 3,
        NoticePeriodDays: 0,
      });

      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
        StartDate: new Date('2024-01-01'),
        SupervisorID: 2,
        FirstName: 'Ahmed',
        WorkLocationID: 1,
      });

      prisma.leaveBalance.findUnique.mockResolvedValue({
        LeaveBalanceID: 1,
        EntitledDays: 20,
        CarryOverDays: 0,
        UsedDays: 0,
        PendingDays: 0,
      });

      prisma.holidayCalendar.findMany.mockResolvedValue([]);

      prisma.leaveRequest.create.mockResolvedValue({
        LeaveRequestID: 1,
      });

      prisma.leaveBalance.update.mockResolvedValue({});
    });

    test('should submit leave request successfully', async () => {
      const result = await submitLeaveRequest(
        1,
        {
          leaveTypeId: 1,
          startDate: '2025-06-01',
          endDate: '2025-06-05',
          reason: 'Vacation',
        }
      );

      expect(result.LeaveRequestID).toBe(1);

      expect(prisma.leaveRequest.create).toHaveBeenCalled();

      expect(prisma.leaveBalance.update).toHaveBeenCalled();
    });

    test('should reject when balance missing', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(
        null
      );

      await expect(
        submitLeaveRequest(1, {
          leaveTypeId: 1,
          startDate: '2025-06-01',
          endDate: '2025-06-05',
        })
      ).rejects.toThrow('Leave balance not found');
    });

    test('should reject insufficient balance', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue({
        LeaveBalanceID: 1,
        EntitledDays: 1,
        CarryOverDays: 0,
        UsedDays: 0,
        PendingDays: 0,
      });

      await expect(
        submitLeaveRequest(1, {
          leaveTypeId: 1,
          startDate: '2025-06-01',
          endDate: '2025-06-05',
        })
      ).rejects.toThrow('Insufficient leave balance');
    });

    test('should reject tenure violation', async () => {
      const { dayjs } = require('../../shared/utils/date.util');

      dayjs.mockImplementation(() => ({
        diff: jest.fn(() => 1),
      }));

      await expect(
        submitLeaveRequest(1, {
          leaveTypeId: 1,
          startDate: '2025-06-01',
          endDate: '2025-06-05',
        })
      ).rejects.toThrow('Tenure requirement not met');
    });
  });

  // ─────────────────────────────────────
  // UPDATE REQUEST
  // ─────────────────────────────────────

  describe('updateLeaveRequest', () => {
    test('should update request', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue({
        LeaveRequestID: 1,
        Status: 'SUBMITTED',
      });

      prisma.leaveRequest.update.mockResolvedValue({
        LeaveRequestID: 1,
      });

      const result = await updateLeaveRequest(
        1,
        1,
        {
          Reason: 'Updated',
        }
      );

      expect(result.LeaveRequestID).toBe(1);
    });

    test('should reject finalized requests', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue({
        Status: 'APPROVED',
      });

      await expect(
        updateLeaveRequest(1, 1, {})
      ).rejects.toThrow('Cannot edit finalized request');
    });
  });

  // ─────────────────────────────────────
  // CANCEL REQUEST
  // ─────────────────────────────────────

  describe('cancelLeaveRequest', () => {
    beforeEach(() => {
      prisma.leaveRequest.findUnique.mockResolvedValue({
        LeaveRequestID: 1,
        Status: 'SUBMITTED',
        EmployeeID: 1,
        LeaveTypeID: 1,
        TotalDays: 5,
        StartDate: new Date('2099-06-01'),
      });

      prisma.leaveRequest.update.mockResolvedValue({
        Status: 'CANCELLED',
      });

      prisma.leaveBalance.updateMany.mockResolvedValue({});
    });

    test('should cancel submitted request', async () => {
      const result = await cancelLeaveRequest(
        1,
        1,
        {
          cancelReason: 'Changed plans',
        }
      );

      expect(result.Status).toBe('CANCELLED');

      expect(
        prisma.leaveBalance.updateMany
      ).toHaveBeenCalled();
    });

    test('should reject already started leave', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue({
        StartDate: new Date('2020-01-01'),
      });

      await expect(
        cancelLeaveRequest(1, 1, {
          cancelReason: 'Late',
        })
      ).rejects.toThrow('Leave already started');
    });
  });

  // ─────────────────────────────────────
  // APPROVALS
  // ─────────────────────────────────────

  describe('processApproval', () => {
    beforeEach(() => {
      prisma.leaveRequest.findUnique.mockResolvedValue({
        LeaveRequestID: 1,
        EmployeeID: 1,
        LeaveTypeID: 1,
        TotalDays: 5,
        StartDate: new Date(),
        EndDate: new Date(),
        Status: 'SUBMITTED',
        Employee: {
          SupervisorID: 2,
          FullName: 'Ahmed',
        },
      });

      prisma.leaveRequest.update.mockResolvedValue({
        Status: 'APPROVED',
      });

      prisma.leaveActionLog.create.mockResolvedValue(
        {}
      );

      prisma.leaveBalance.updateMany.mockResolvedValue(
        {}
      );
    });

    test('should approve request', async () => {
      const result = await processApproval(
        1,
        99,
        {
          decision: 'APPROVED',
          comments: 'Approved',
        }
      );

      expect(result.Status).toBe('APPROVED');
    });

    test('should reject request', async () => {
      prisma.leaveRequest.update.mockResolvedValue({
        Status: 'REJECTED',
      });

      const result = await processApproval(
        1,
        99,
        {
          decision: 'REJECTED',
        }
      );

      expect(result.Status).toBe('REJECTED');
    });

    test('should reject missing request', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(
        null
      );

      await expect(
        processApproval(1, 1, {
          decision: 'APPROVED',
        })
      ).rejects.toThrow('Request not found');
    });
  });

  // ─────────────────────────────────────
  // BULK PROCESS
  // ─────────────────────────────────────

  describe('bulkProcessRequests', () => {
    test('should process requests in bulk', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue({
        LeaveRequestID: 1,
        EmployeeID: 1,
        LeaveTypeID: 1,
        TotalDays: 5,
        StartDate: new Date(),
        EndDate: new Date(),
        Status: 'SUBMITTED',
        Employee: {},
      });

      prisma.leaveRequest.update.mockResolvedValue({
        Status: 'APPROVED',
      });

      prisma.leaveActionLog.create.mockResolvedValue(
        {}
      );

      prisma.leaveBalance.updateMany.mockResolvedValue(
        {}
      );

      const result = await bulkProcessRequests(
        1,
        {
          requestIds: [1, 2],
          decision: 'APPROVED',
        }
      );

      expect(result.count).toBe(2);
    });

    test('should reject empty request ids', async () => {
      await expect(
        bulkProcessRequests(1, {
          requestIds: [],
        })
      ).rejects.toThrow('No requests selected');
    });
  });

  // ─────────────────────────────────────
  // DELEGATION
  // ─────────────────────────────────────

  describe('delegateApproval', () => {
    test('should delegate approval', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 2,
      });

      prisma.leaveDelegation.create.mockResolvedValue({
        DelegationID: 1,
      });

      const result = await delegateApproval(
        1,
        1,
        {
          delegateTo: 2,
          startDate: '2025-06-01',
          endDate: '2025-06-30',
        }
      );

      expect(result.DelegationID).toBe(1);
    });

    test('should reject invalid delegate', async () => {
      prisma.employee.findUnique.mockResolvedValue(
        null
      );

      await expect(
        delegateApproval(1, 1, {
          delegateTo: 2,
        })
      ).rejects.toThrow('Delegate employee not found');
    });
  });

  // ─────────────────────────────────────
  // REQUEST LISTING
  // ─────────────────────────────────────

  describe('listLeaveRequests', () => {
    test('should list requests with pagination', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([
        {
          LeaveRequestID: 1,
        },
      ]);

      prisma.leaveRequest.count.mockResolvedValue(1);

      const result = await listLeaveRequests({
        page: 1,
        limit: 10,
      });

      expect(result.requests.length).toBe(1);
    });

    test('should filter by manager', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue(
        []
      );

      prisma.leaveRequest.count.mockResolvedValue(0);

      await listLeaveRequests({
        managerId: 1,
      });

      expect(
        prisma.leaveRequest.findMany
      ).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────
  // MANAGER INBOX
  // ─────────────────────────────────────

  describe('getManagerInbox', () => {
    test('should return inbox requests', async () => {
      prisma.leaveDelegation.findMany.mockResolvedValue(
        []
      );

      prisma.leaveRequest.findMany.mockResolvedValue([
        {
          LeaveRequestID: 1,
        },
      ]);

      const result = await getManagerInbox(1);

      expect(result.length).toBe(1);
    });
  });

  // ─────────────────────────────────────
  // GET REQUEST BY ID
  // ─────────────────────────────────────

  describe('getLeaveRequestById', () => {
    test('should return leave request', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue({
        LeaveRequestID: 1,
      });

      const result = await getLeaveRequestById(1);

      expect(result.LeaveRequestID).toBe(1);
    });
  });

  // ─────────────────────────────────────
  // MY REQUESTS
  // ─────────────────────────────────────

  describe('getMyLeaveRequests', () => {
    test('should return employee requests', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([
        {
          LeaveRequestID: 1,
        },
      ]);

      const result = await getMyLeaveRequests(1);

      expect(result.length).toBe(1);
    });
  });

  // ─────────────────────────────────────
  // HOLIDAYS
  // ─────────────────────────────────────

  describe('listHolidays', () => {
    test('should list holidays', async () => {
      prisma.holidayCalendar.findMany.mockResolvedValue([
        {
          HolidayID: 1,
        },
      ]);

      const result = await listHolidays();

      expect(result.length).toBe(1);
    });
  });

  describe('createHoliday', () => {
    test('should create holiday', async () => {
      prisma.holidayCalendar.create.mockResolvedValue({
        HolidayID: 1,
      });

      const result = await createHoliday({
        Name: 'Eid',
      });

      expect(result.HolidayID).toBe(1);
    });
  });

  // ─────────────────────────────────────
  // ANALYTICS
  // ─────────────────────────────────────

  describe('getLeaveAnalytics', () => {
    test('should return analytics', async () => {
      prisma.leaveRequest.groupBy.mockResolvedValue([
        {
          Status: 'APPROVED',
          _count: 5,
        },
      ]);

      const result = await getLeaveAnalytics({
        year: 2025,
      });

      expect(result.year).toBe(2025);
    });
  });

  // ─────────────────────────────────────
  // PAYROLL SYNC
  // ─────────────────────────────────────

  describe('syncLeaveToPayroll', () => {
    test('should sync leave successfully', async () => {
      prisma.leaveRequest.count.mockResolvedValue(5);

      const result = await syncLeaveToPayroll(
        1,
        2025,
        5
      );

      expect(result.syncedCount).toBe(5);
    });
  });

  describe('bulkSyncPayroll', () => {
    test('should bulk sync payroll', async () => {
      prisma.leaveRequest.count.mockResolvedValue(10);

      const result = await bulkSyncPayroll(
        2025,
        5,
        1
      );

      expect(result.syncedCount).toBe(10);
    });

    test('should skip notification when no records', async () => {
      prisma.leaveRequest.count.mockResolvedValue(0);

      const result = await bulkSyncPayroll(
        2025,
        5,
        1
      );

      expect(result.syncedCount).toBe(0);
    });
  });

  // ─────────────────────────────────────
  // GLOBAL ENTITLEMENTS
  // ─────────────────────────────────────

  describe('updateGlobalEntitlements', () => {
    test('should update global entitlements', async () => {
      prisma.leaveBalance.updateMany.mockResolvedValue({
        count: 10,
      });

      const result = await updateGlobalEntitlements(
        {
          defaultEntitlement: 30,
          year: 2025,
          leaveTypeId: 1,
        },
        1
      );

      expect(result.updatedCount).toBe(10);
    });

    test('should reject invalid entitlement', async () => {
      await expect(
        updateGlobalEntitlements(
          {
            defaultEntitlement: 'abc',
            leaveTypeId: 1,
          },
          1
        )
      ).rejects.toThrow('Invalid entitlement value');
    });

    test('should reject missing leave type', async () => {
      await expect(
        updateGlobalEntitlements(
          {
            defaultEntitlement: 20,
          },
          1
        )
      ).rejects.toThrow('Leave type is required');
    });
  });
});