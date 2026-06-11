jest.mock('../../config/database', () =>
  require('../mocks/prisma.mock')
);

jest.mock('../../shared/utils/notification.util', () => ({
  notify: jest.fn(),
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
  const dayjs = require('dayjs');
  const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');

  dayjs.extend(isSameOrBefore);

  return {
    calcHoursDiff: jest.fn((start, end) => {
      return (new Date(end) - new Date(start)) / (1000 * 60 * 60);
    }),

    calcLatenessMinutes: jest.fn((expected, actual) => {
      return Math.max(
        0,
        Math.floor((new Date(actual) - new Date(expected)) / (1000 * 60))
      );
    }),

    getMonthBounds: jest.fn(() => ({
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-05-31'),
    })),

    todayStr: jest.fn(() => '2026-05-13'),

    dayjs,
  };
});

const prisma = require('../mocks/prisma.mock');

const {
  notify,
} = require('../../shared/utils/notification.util');

const {
  checkIn,
  checkOut,
  getTodayStatus,
  getDashboardKPIs,
  listAttendance,
  getAttendanceRecord,
  createManualAttendance,
  submitCorrectionRequest,
  reviewCorrectionRequest,
  submitOvertimeRequest,
  approveOvertimeRequest,
  assignShift,
  generateAttendanceSummary,
  getAttendanceSummary,
  markAttendanceAsOnLeave,
  getAttendanceCalendar,
} = require('../../modules/attendance/services/attendance.service');

const {
  ATTENDANCE_STATUS,
  CORRECTION_STATUS,
  OVERTIME_STATUS,
} = require('../../shared/constants');

describe('Attendance Service Enterprise Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────
  // CHECK IN
  // ─────────────────────────────

  describe('checkIn()', () => {
    it('should successfully check in employee', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
        FullName: 'Ahmed',
        IsActive: true,
      });

      prisma.attendanceRecord.findUnique.mockResolvedValue(null);

      prisma.employeeShiftAssignment.findFirst.mockResolvedValue({
        Shift: {
          ShiftID: 1,
          ShiftName: 'Morning',
          StartTime: new Date('2026-05-13T08:00:00Z'),
        },
      });

      prisma.attendanceRecord.create.mockResolvedValue({
        AttendanceID: 10,
        Status: ATTENDANCE_STATUS.PRESENT,
      });

      const result = await checkIn(1, {
        notes: 'Arrived early',
      });

      expect(prisma.attendanceRecord.create).toHaveBeenCalled();

      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 1,
          sourceModule: 'Attendance',
        })
      );

      expect(result.Status).toBe(
        ATTENDANCE_STATUS.PRESENT
      );
    });

    it('should reject inactive employee', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
        IsActive: false,
      });

      await expect(checkIn(1)).rejects.toThrow(
        'Employee not found or inactive.'
      );
    });

    it('should reject duplicate check-in', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
        IsActive: true,
      });

      prisma.attendanceRecord.findUnique.mockResolvedValue({
        AttendanceID: 10,
        CheckInTime: new Date(),
      });

      await expect(checkIn(1)).rejects.toThrow(
        'You have already checked in today.'
      );
    });

    it('should update pre-created absent record', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
        IsActive: true,
      });

      prisma.attendanceRecord.findUnique.mockResolvedValue({
        AttendanceID: 55,
      });

      prisma.employeeShiftAssignment.findFirst.mockResolvedValue(null);

      prisma.attendanceRecord.update.mockResolvedValue({
        AttendanceID: 55,
        Status: ATTENDANCE_STATUS.PRESENT,
      });

      const result = await checkIn(1);

      expect(prisma.attendanceRecord.update).toHaveBeenCalled();

      expect(result.Status).toBe(
        ATTENDANCE_STATUS.PRESENT
      );
    });
  });

  // ─────────────────────────────
  // CHECK OUT
  // ─────────────────────────────

  describe('checkOut()', () => {
    it('should successfully check out employee', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue({
        AttendanceID: 10,
        CheckInTime: new Date('2026-05-13T08:00:00Z'),
        CheckOutTime: null,
        Shift: {
          BreakDurationMin: 60,
          ExpectedHours: 8,
          EndTime: new Date('2026-05-13T17:00:00Z'),
        },
        AttendanceDate: new Date('2026-05-13'),
      });

      prisma.attendanceRecord.update.mockResolvedValue({
        AttendanceID: 10,
        WorkedHours: 8,
        OvertimeHours: 1,
      });

      const result = await checkOut(1, {
        notes: 'Completed shift',
      });

      expect(prisma.attendanceRecord.update).toHaveBeenCalled();

      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 1,
        })
      );

      expect(result.AttendanceID).toBe(10);
    });

    it('should reject checkout without check-in', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue(
        null
      );

      await expect(checkOut(1)).rejects.toThrow(
        'No check-in found for today. Please check in first.'
      );
    });

    it('should reject duplicate checkout', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue({
        AttendanceID: 1,
        CheckInTime: new Date(),
        CheckOutTime: new Date(),
      });

      await expect(checkOut(1)).rejects.toThrow(
        'You have already checked out today.'
      );
    });

    it('should reject missing check-in time', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue({
        AttendanceID: 1,
        CheckInTime: null,
        CheckOutTime: null,
      });

      await expect(checkOut(1)).rejects.toThrow(
        'No check-in time recorded.'
      );
    });
  });

  // ─────────────────────────────
  // TODAY STATUS
  // ─────────────────────────────

  describe('getTodayStatus()', () => {
    it('should return clocked in status', async () => {
      prisma.employeeShiftAssignment.findFirst.mockResolvedValue(
        {
          Shift: {
            ShiftName: 'Morning',
            StartTime: new Date(),
            EndTime: new Date(),
            ExpectedHours: 8,
          },
        }
      );

      prisma.attendanceRecord.findUnique.mockResolvedValue({
        CheckInTime: new Date(),
        CheckOutTime: null,
        Status: ATTENDANCE_STATUS.PRESENT,
      });

      const result = await getTodayStatus(1);

      expect(result.currentStatus).toBe(
        'Clocked In'
      );
    });

    it('should return on leave status', async () => {
      prisma.employeeShiftAssignment.findFirst.mockResolvedValue(
        null
      );

      prisma.attendanceRecord.findUnique.mockResolvedValue({
        Status: 'OnLeave',
      });

      const result = await getTodayStatus(1);

      expect(result.currentStatus).toBe(
        'On Leave'
      );
    });
  });

  // ─────────────────────────────
  // DASHBOARD KPI
  // ─────────────────────────────

  describe('getDashboardKPIs()', () => {
    it('should return dashboard KPI metrics', async () => {
      prisma.attendanceRecord.findMany
        .mockResolvedValueOnce([
          {
            WorkedHours: 8,
            LatenessMinutes: 0,
          },
        ])
        .mockResolvedValueOnce([
          {
            LatenessMinutes: 0,
          },
        ]);

      prisma.attendanceCorrectionRequest.count.mockResolvedValue(
        2
      );

      const result = await getDashboardKPIs(1);

      expect(result.thisWeekHours).toBe(8);
      expect(result.pendingRequests).toBe(2);
    });
  });

  // ─────────────────────────────
  // LIST
  // ─────────────────────────────

  describe('listAttendance()', () => {
    it('should list attendance with pagination', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue(
        [{ AttendanceID: 1 }]
      );

      prisma.attendanceRecord.count.mockResolvedValue(
        1
      );

      const result = await listAttendance({});

      expect(result.records.length).toBe(1);
      expect(result.meta).toBeDefined();
    });
  });

  // ─────────────────────────────
  // RECORD
  // ─────────────────────────────

  describe('getAttendanceRecord()', () => {
    it('should return attendance record details', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue(
        {
          AttendanceID: 1,
        }
      );

      const result = await getAttendanceRecord(1);

      expect(result.AttendanceID).toBe(1);
    });

    it('should throw if attendance record missing', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue(
        null
      );

      await expect(
        getAttendanceRecord(999)
      ).rejects.toThrow(
        'Attendance record not found.'
      );
    });
  });

  // ─────────────────────────────
  // MANUAL
  // ─────────────────────────────

  describe('createManualAttendance()', () => {
    it('should create manual attendance correctly', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
      });

      prisma.attendanceRecord.findUnique.mockResolvedValue(
        null
      );

      prisma.employeeShiftAssignment.findFirst.mockResolvedValue(
        null
      );

      prisma.attendanceRecord.create.mockResolvedValue({
        AttendanceID: 10,
      });

      const result = await createManualAttendance(
        {
          EmployeeID: 1,
          AttendanceDate: '2026-05-13',
        },
        5
      );

      expect(result.AttendanceID).toBe(10);
    });

    it('should reject duplicate manual attendance', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
      });

      prisma.attendanceRecord.findUnique.mockResolvedValue(
        {
          AttendanceID: 1,
        }
      );

      await expect(
        createManualAttendance(
          {
            EmployeeID: 1,
            AttendanceDate: '2026-05-13',
          },
          5
        )
      ).rejects.toThrow(
        'An attendance record already exists for this employee on this date.'
      );
    });
  });

  // ─────────────────────────────
  // CORRECTIONS
  // ─────────────────────────────

  describe('submitCorrectionRequest()', () => {
    it('should submit correction request', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue(
        {
          AttendanceID: 1,
          EmployeeID: 1,
          AttendanceDate: new Date(),
        }
      );

      prisma.attendanceCorrectionRequest.findFirst.mockResolvedValue(
        null
      );

      prisma.attendanceCorrectionRequest.create.mockResolvedValue(
        {
          CorrectionID: 10,
        }
      );

      const result =
        await submitCorrectionRequest(1, 1, {
          Reason: 'Forgot checkout',
        });

      expect(result.CorrectionID).toBe(10);

      expect(notify).toHaveBeenCalled();
    });

    it('should reject correction for another employee', async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue(
        {
          AttendanceID: 1,
          EmployeeID: 5,
        }
      );

      await expect(
        submitCorrectionRequest(1, 1, {
          Reason: 'Invalid',
        })
      ).rejects.toThrow(
        'You cannot submit a correction for another employee.'
      );
    });
  });

  describe('reviewCorrectionRequest()', () => {
    it('should approve correction request', async () => {
      prisma.attendanceCorrectionRequest.findUnique.mockResolvedValue(
        {
          CorrectionID: 1,
          EmployeeID: 1,
          AttendanceID: 2,
          Status: CORRECTION_STATUS.PENDING,

          Attendance: {
            CheckInTime: new Date(),
            CheckOutTime: new Date(),

            Shift: {
              BreakDurationMin: 60,
              ExpectedHours: 8,
            },
          },
        }
      );

      prisma.$transaction.mockResolvedValue([
        {
          CorrectionID: 1,
          Status: CORRECTION_STATUS.APPROVED,
        },
      ]);

      const result =
        await reviewCorrectionRequest(1, 99, {
          Status:
            CORRECTION_STATUS.APPROVED,
        });

      expect(prisma.$transaction).toHaveBeenCalled();

      expect(result.Status).toBe(
        CORRECTION_STATUS.APPROVED
      );
    });

    it('should reject already reviewed corrections', async () => {
      prisma.attendanceCorrectionRequest.findUnique.mockResolvedValue(
        {
          Status:
            CORRECTION_STATUS.APPROVED,
        }
      );

      await expect(
        reviewCorrectionRequest(1, 99, {
          Status:
            CORRECTION_STATUS.APPROVED,
        })
      ).rejects.toThrow(
        'This correction has already been reviewed.'
      );
    });
  });

  // ─────────────────────────────
  // OVERTIME
  // ─────────────────────────────

  describe('submitOvertimeRequest()', () => {
    it('should create overtime request', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
      });

      prisma.overtimeRequest.create.mockResolvedValue(
        {
          OvertimeRequestID: 5,
        }
      );

      const result =
        await submitOvertimeRequest(
          {
            EmployeeID: 1,
            OvertimeDate: '2026-05-13',
            EstimatedHours: 2,
            Reason: 'Urgent deployment',
          },
          99
        );

      expect(result.OvertimeRequestID).toBe(
        5
      );
    });

    it('should reject overtime exceeding legal limit', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
      });

      await expect(
        submitOvertimeRequest(
          {
            EmployeeID: 1,
            OvertimeDate: '2026-05-13',
            EstimatedHours: 10,
            Reason: 'Overload',
          },
          99
        )
      ).rejects.toThrow(
        'Overtime cannot exceed'
      );
    });
  });

  describe('approveOvertimeRequest()', () => {
    it('should approve overtime request', async () => {
      prisma.overtimeRequest.findUnique.mockResolvedValue(
        {
          OvertimeRequestID: 1,
          EmployeeID: 1,
          Status:
            OVERTIME_STATUS.PENDING,
          OvertimeDate: new Date(),
        }
      );

      prisma.overtimeRequest.update.mockResolvedValue(
        {
          OvertimeRequestID: 1,
          Status:
            OVERTIME_STATUS.APPROVED,
        }
      );

      const result =
        await approveOvertimeRequest(
          1,
          99,
          true
        );

      expect(result.Status).toBe(
        OVERTIME_STATUS.APPROVED
      );
    });

    it('should reject already processed overtime', async () => {
      prisma.overtimeRequest.findUnique.mockResolvedValue(
        {
          Status:
            OVERTIME_STATUS.APPROVED,
        }
      );

      await expect(
        approveOvertimeRequest(
          1,
          99,
          true
        )
      ).rejects.toThrow(
        'This overtime request has already been processed.'
      );
    });
  });

  // ─────────────────────────────
  // SHIFT
  // ─────────────────────────────

  describe('assignShift()', () => {
    it('should assign employee shift', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
          IsActive: true,          // ADD THIS
    CurrentStatus: 'Active', // ADD THIS
      });

      prisma.shift.findUnique.mockResolvedValue({
        ShiftID: 1,
         IsActive: true,
      });

      prisma.employeeShiftAssignment.updateMany.mockResolvedValue(
        {}
      );

      prisma.employeeShiftAssignment.create.mockResolvedValue(
        {
          AssignmentID: 10,
        }
      );

      const result = await assignShift(
        {
          EmployeeID: 1,
          ShiftID: 1,
          EffectiveFrom: '2026-05-13',
        },
        99
      );

      expect(result.AssignmentID).toBe(10);
    });

    // KEEPING OLD FAIRNESS TESTS
    // These may fail intentionally due to regression

    it('should reject nonexistent employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(
        null
      );

      await expect(
        assignShift(
          {
            EmployeeID: 999,
            ShiftID: 1,
            EffectiveFrom: '2026-05-01',
          },
          99
        )
      ).rejects.toThrow(
        'Employee not found.'
      );
    });

    it('should reject nonexistent shift', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
         IsActive: true,          // ADD THIS
    CurrentStatus: 'Active', // ADD THIS
      });


      prisma.shift.findUnique.mockResolvedValue(
        null
      );

      await expect(
        assignShift(
          {
            EmployeeID: 1,
            ShiftID: 999,
            EffectiveFrom: '2026-05-01',
          },
          99
        )
      ).rejects.toThrow(
        'Shift not found.'
      );
    });
    it('should reject terminated employee', async () => {
  prisma.employee.findUnique.mockResolvedValue({
    EmployeeID: 1,
    IsActive: false,
    CurrentStatus: 'Terminated',
  });

  await expect(
    assignShift(
      {
        EmployeeID: 1,
        ShiftID: 1,
        EffectiveFrom: '2026-05-13',
      },
      99
    )
  ).rejects.toThrow(
    'Cannot assign shift to an inactive or terminated employee.'
  );
});
it('should reject disabled shift', async () => {
  prisma.employee.findUnique.mockResolvedValue({ EmployeeID: 1, IsActive: true, CurrentStatus: 'Active' });
  prisma.shift.findUnique.mockResolvedValue({ ShiftID: 1, IsActive: false });
  await expect(assignShift({ EmployeeID: 1, ShiftID: 1, EffectiveFrom: '2026-05-13' }, 99))
    .rejects.toThrow('Shift is not active.');
});

it('should reject null EffectiveFrom', async () => {
  prisma.employee.findUnique.mockResolvedValue({ EmployeeID: 1, IsActive: true, CurrentStatus: 'Active' });
  prisma.shift.findUnique.mockResolvedValue({ ShiftID: 1, IsActive: true });
  await expect(assignShift({ EmployeeID: 1, ShiftID: 1, EffectiveFrom: null }, 99))
    .rejects.toThrow('EffectiveFrom date is required.');
});

it('should reject duplicate shift assignment on same date', async () => {
  prisma.employee.findUnique.mockResolvedValue({
    EmployeeID: 1,
    IsActive: true,
    CurrentStatus: 'Active',
  });

  prisma.shift.findUnique.mockResolvedValue({
    ShiftID: 1,
    IsActive: true,
  });

  prisma.employeeShiftAssignment.findFirst.mockResolvedValue({
    AssignmentID: 5,
    EmployeeID: 1,
    ShiftID: 1,
  });

  await expect(
    assignShift(
      {
        EmployeeID: 1,
        ShiftID: 1,
        EffectiveFrom: '2026-05-13',
      },
      99
    )
  ).rejects.toThrow(
    'This shift assignment already exists for this employee on this date.'
  );
});
  });

  // ─────────────────────────────
  // SUMMARY
  // ─────────────────────────────

  describe('generateAttendanceSummary()', () => {
    it('should generate attendance summary', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue(
        [
          {
            Status:
              ATTENDANCE_STATUS.PRESENT,
            WorkedHours: 8,
            OvertimeHours: 1,
            LatenessMinutes: 0,
          },
        ]
      );

      prisma.attendanceSummary.findUnique.mockResolvedValue(
        null
      );

      prisma.attendanceSummary.create.mockResolvedValue(
        {
          SummaryID: 1,
        }
      );

      const result =
        await generateAttendanceSummary(
          1,
          2026,
          5
        );

      expect(result.SummaryID).toBe(1);
    });

    it('should update existing summary', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue(
        []
      );

      prisma.attendanceSummary.findUnique.mockResolvedValue(
        {
          SummaryID: 1,
        }
      );

      prisma.attendanceSummary.update.mockResolvedValue(
        {
          SummaryID: 1,
        }
      );

      const result =
        await generateAttendanceSummary(
          1,
          2026,
          5
        );

      expect(
        prisma.attendanceSummary.update
      ).toHaveBeenCalled();

      expect(result.SummaryID).toBe(1);
    });
  });

  describe('getAttendanceSummary()', () => {
    it('should return existing summary', async () => {
      prisma.attendanceSummary.findUnique.mockResolvedValue(
        {
          SummaryID: 1,
        }
      );

      const result =
        await getAttendanceSummary(
          1,
          2026,
          5
        );

      expect(result.SummaryID).toBe(1);
    });
  });

  // ─────────────────────────────
  // LEAVE
  // ─────────────────────────────

  describe('markAttendanceAsOnLeave()', () => {
    it('should mark attendance as leave', async () => {
      prisma.attendanceRecord.upsert.mockResolvedValue(
        {}
      );

      prisma.$transaction.mockResolvedValue(
        []
      );

      await markAttendanceAsOnLeave(
        1,
        '2026-05-01',
        '2026-05-03',
        5
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────
  // CALENDAR
  // ─────────────────────────────

  describe('getAttendanceCalendar()', () => {
    it('should generate attendance calendar', async () => {
      prisma.attendanceRecord.findMany.mockResolvedValue(
        [
          {
            AttendanceDate: new Date(
              '2026-05-01'
            ),

            Status:
              ATTENDANCE_STATUS.PRESENT,
          },
        ]
      );

      const result =
        await getAttendanceCalendar(
          1,
          2026,
          5
        );

      expect(Array.isArray(result)).toBe(
        true
      );
    });
  });
});