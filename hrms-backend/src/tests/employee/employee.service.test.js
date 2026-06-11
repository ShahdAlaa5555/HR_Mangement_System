jest.mock('../../config/database', () =>
  require('../mocks/prisma.mock')
);

jest.mock('../../shared/utils/notification.util', () => ({
  notify: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../modules/leave/services/leave.service', () => ({
  initializeLeaveBalances: jest.fn().mockResolvedValue({ assignedCount: 1 }),
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

jest.mock('../../shared/constants', () => ({
  CHANGE_REQUEST_STATUS: {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
  },

  EVENT_CODE: {
    EMP_CHANGE_REQUEST: 'EMP_CHANGE_REQUEST',
    EMP_CHANGE_APPROVED: 'EMP_CHANGE_APPROVED',
  },

  EMPLOYEE_STATUS: {
    ACTIVE: 'Active',
    TERMINATED: 'Terminated',
  },
}));

const prisma = require('../../config/database');

const {
  listEmployees,
  getEmployeeById,
  getEmployeeProfile,
  createEmployee,
  updateEmployee,
  terminateEmployee,
  reactivateEmployee,
  submitChangeRequest,
  listChangeRequests,
  reviewChangeRequest,
  getAuditLog,
  getOrgChart,
  listDepartments,
  createDepartment,
  updateDepartment,
  listPositions,
  createPosition,
  getSalaryHistory,
  createSalaryRecord,
  listWorkLocations,
  getMyNotifications,
  markNotificationsRead,
  getEmergencyContacts,
  addEmergencyContact,
  deleteEmergencyContact,
  getSkills,
  addSkill,
  deleteSkill,
  getProfileCompleteness,
  sendCompletenessReminder,
  getDocuments,
  addDocumentRecord,
  deleteDocument,
  getMyTeam,
  getEmploymentTimeline,
  getEmployeeNotes,
  addEmployeeNote,
  assignEmployeeRole,
  getFieldVisibility,
  updateFieldVisibility,
  updateEmergencyContact,
  updateProfilePhoto,
} = require('../../modules/employee/services/employee.service');

describe('Employee Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────
  // LIST EMPLOYEES
  // ─────────────────────────────────────

  describe('listEmployees', () => {
    test('should list employees successfully', async () => {
      prisma.employee.findMany.mockResolvedValue([
        {
          EmployeeID: 1,
          FullName: 'Ahmed Ali',
        },
      ]);

      prisma.employee.count.mockResolvedValue(1);

      const result = await listEmployees({});

      expect(result.employees).toHaveLength(1);

      expect(prisma.employee.findMany).toHaveBeenCalled();
    });

    test('should support search filters', async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.employee.count.mockResolvedValue(0);

      await listEmployees({
        search: 'Ahmed',
      });

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        })
      );
    });

    test('should support active filter', async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.employee.count.mockResolvedValue(0);

      await listEmployees({
        isActive: true,
      });

      expect(prisma.employee.findMany).toHaveBeenCalled();
    });

    test('should support department filter', async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.employee.count.mockResolvedValue(0);

      await listEmployees({
        departmentId: '1',
      });

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            DepartmentID: 1,
          }),
        })
      );
    });

    test('should support status filter', async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.employee.count.mockResolvedValue(0);

      await listEmployees({
        status: 'Active',
      });

      expect(prisma.employee.findMany).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────
  // GET EMPLOYEE
  // ─────────────────────────────────────

  describe('getEmployeeById', () => {
    test('should return employee details', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
      });

      const result = await getEmployeeById(1);

      expect(result.EmployeeID).toBe(1);
    });

    test('should throw when employee missing', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        getEmployeeById(999)
      ).rejects.toThrow('Employee not found.');
    });
  });

  // ─────────────────────────────────────
  // GET PROFILE
  // ─────────────────────────────────────

  describe('getEmployeeProfile', () => {
    test('should return employee profile', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
      });

      const result = await getEmployeeProfile(1);

      expect(result.EmployeeID).toBe(1);
    });

    test('should reject invalid employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        getEmployeeProfile(1)
      ).rejects.toThrow('Employee not found.');
    });
  });

  // ─────────────────────────────────────
  // CREATE EMPLOYEE
  // ─────────────────────────────────────

  describe('createEmployee', () => {
    beforeEach(() => {
      prisma.department.findUnique.mockResolvedValue({
        DepartmentID: 1,
      });

      prisma.position.findUnique.mockResolvedValue({
        PositionID: 1,
      });

      prisma.workLocation.findUnique.mockResolvedValue({
        WorkLocationID: 1,
      });

      prisma.employee.create.mockResolvedValue({
        EmployeeID: 1,
        FullName: 'Ahmed Ali',
      });

      prisma.employeeAuditLog.create.mockResolvedValue({});
    });

    test('should create employee successfully', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      const result = await createEmployee(
        {
          EmployeeCode: 'EMP001',
          FirstName: 'Ahmed',
          LastName: 'Ali',
          Email: 'ahmed@test.com',
          DepartmentID: 1,
          PositionID: 1,
          WorkLocationID: 1,
        },
        99
      );

      expect(result.FullName).toBe('Ahmed Ali');

      expect(prisma.employee.create).toHaveBeenCalled();
    });

    test('should reject duplicate employee code', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        EmployeeCode: 'EMP001',
      });

      await expect(
        createEmployee(
          {
            EmployeeCode: 'EMP001',
            Email: 'a@test.com',
          },
          1
        )
      ).rejects.toThrow('already in use');
    });

    test('should reject duplicate email', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        EmployeeCode: 'OTHER',
      });

      await expect(
        createEmployee(
          {
            EmployeeCode: 'EMP001',
            Email: 'a@test.com',
          },
          1
        )
      ).rejects.toThrow('already registered');
    });

    test('should reject missing department', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      prisma.department.findUnique.mockResolvedValue(null);

      await expect(
        createEmployee(
          {
            DepartmentID: 1,
            PositionID: 1,
            WorkLocationID: 1,
          },
          1
        )
      ).rejects.toThrow('Department not found.');
    });

    test('should reject missing position', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      prisma.position.findUnique.mockResolvedValue(null);

      await expect(
        createEmployee(
          {
            DepartmentID: 1,
            PositionID: 1,
            WorkLocationID: 1,
          },
          1
        )
      ).rejects.toThrow('Position not found.');
    });

    test('should reject missing work location', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      prisma.workLocation.findUnique.mockResolvedValue(null);

      await expect(
        createEmployee(
          {
            DepartmentID: 1,
            PositionID: 1,
            WorkLocationID: 1,
          },
          1
        )
      ).rejects.toThrow('Work location not found.');
    });

    test('should reject invalid supervisor', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        createEmployee(
          {
            DepartmentID: 1,
            PositionID: 1,
            WorkLocationID: 1,
            SupervisorID: 5,
          },
          1
        )
      ).rejects.toThrow('Supervisor not found');
    });

    test('should reject inactive supervisor', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      prisma.employee.findUnique.mockResolvedValue({
        IsActive: false,
      });

      await expect(
        createEmployee(
          {
            DepartmentID: 1,
            PositionID: 1,
            WorkLocationID: 1,
            SupervisorID: 5,
          },
          1
        )
      ).rejects.toThrow('Supervisor not found');
    });

    test('should create audit log', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await createEmployee(
        {
          EmployeeCode: 'EMP001',
          FirstName: 'Ahmed',
          LastName: 'Ali',
          Email: 'a@test.com',
          DepartmentID: 1,
          PositionID: 1,
          WorkLocationID: 1,
        },
        1
      );

      expect(
        prisma.employeeAuditLog.create
      ).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────
  // UPDATE EMPLOYEE
  // ─────────────────────────────────────

  describe('updateEmployee', () => {
    beforeEach(() => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
        FirstName: 'Ahmed',
        LastName: 'Ali',
        Email: 'old@test.com',
      });

      prisma.$transaction.mockResolvedValue([
        {
          EmployeeID: 1,
          FullName: 'Mohamed Ali',
        },
      ]);
    });

    test('should update employee successfully', async () => {
      const result = await updateEmployee(
        1,
        {
          FirstName: 'Mohamed',
        },
        99,
        '127.0.0.1'
      );

      expect(result.FullName).toBe('Mohamed Ali');
    });

    test('should reject missing employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        updateEmployee(1, {}, 1)
      ).rejects.toThrow('Employee not found.');
    });

    test('should rebuild full name', async () => {
      await updateEmployee(
        1,
        {
          LastName: 'Hassan',
        },
        1,
        '127.0.0.1'
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    test('should create audit entries', async () => {
      await updateEmployee(
        1,
        {
          Email: 'new@test.com',
        },
        1,
        '127.0.0.1'
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────
  // TERMINATE EMPLOYEE
  // ─────────────────────────────────────

  describe('terminateEmployee', () => {
    test('should terminate employee', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        CurrentStatus: 'Active',
      });

      prisma.employee.update.mockResolvedValue({
        CurrentStatus: 'Terminated',
      });

      const result = await terminateEmployee(
        1,
        null,
        99
      );

      expect(result.CurrentStatus).toBe('Terminated');
    });

    test('should reject missing employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        terminateEmployee(1)
      ).rejects.toThrow('Employee not found.');
    });

    test('should reject already terminated employee', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        CurrentStatus: 'Terminated',
      });

      await expect(
        terminateEmployee(1)
      ).rejects.toThrow('already terminated');
    });

    test('should create termination audit log', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        CurrentStatus: 'Active',
      });

      prisma.employee.update.mockResolvedValue({});

      await terminateEmployee(1, null, 1);

      expect(
        prisma.employeeAuditLog.create
      ).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────
  // REACTIVATE EMPLOYEE
  // ─────────────────────────────────────

  describe('reactivateEmployee', () => {
    test('should reactivate employee', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        CurrentStatus: 'Terminated',
      });

      prisma.employee.update.mockResolvedValue({
        CurrentStatus: 'Active',
      });

      const result = await reactivateEmployee(1, 1);

      expect(result.CurrentStatus).toBe('Active');
    });

    test('should reject missing employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        reactivateEmployee(1, 1)
      ).rejects.toThrow('Employee not found.');
    });

    test('should reject already active employee', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        CurrentStatus: 'Active',
      });

      await expect(
        reactivateEmployee(1, 1)
      ).rejects.toThrow('already active');
    });
  });

  // ─────────────────────────────────────
  // CHANGE REQUESTS
  // ─────────────────────────────────────

  describe('submitChangeRequest', () => {
    test('should submit request successfully', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
        Phone: '111',
      });

      prisma.employeeChangeRequest.create.mockResolvedValue({
        ChangeRequestID: 1,
      });

      const result = await submitChangeRequest(
        1,
        1,
        {
          FieldName: 'Phone',
          NewValue: '222',
        }
      );

      expect(result.ChangeRequestID).toBe(1);
    });

    test('should reject invalid employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        submitChangeRequest(1, 1, {})
      ).rejects.toThrow('Employee not found.');
    });
  });

  describe('listChangeRequests', () => {
    test('should return requests list', async () => {
      prisma.employeeChangeRequest.findMany.mockResolvedValue([
        {
          ChangeRequestID: 1,
        },
      ]);

      prisma.employeeChangeRequest.count.mockResolvedValue(1);

      const result = await listChangeRequests(1, {});

      expect(result.requests).toHaveLength(1);
    });

    test('should filter by status', async () => {
      prisma.employeeChangeRequest.findMany.mockResolvedValue([]);

      prisma.employeeChangeRequest.count.mockResolvedValue(0);

      await listChangeRequests(1, {
        status: 'Pending',
      });

      expect(
        prisma.employeeChangeRequest.findMany
      ).toHaveBeenCalled();
    });
  });

  describe('reviewChangeRequest', () => {
    beforeEach(() => {
      prisma.employeeChangeRequest.findUnique.mockResolvedValue({
        ChangeRequestID: 1,
        EmployeeID: 1,
        Status: 'Pending',
        FieldName: 'FirstName',
        NewValue: 'Mohamed',
        OldValue: 'Ahmed',
        Employee: {
          SupervisorID: 99,
        },
      });

      prisma.employeeChangeRequest.update.mockResolvedValue({
        Status: 'Approved',
      });

      prisma.employee.update.mockResolvedValue({});
    });

    test('should approve request successfully', async () => {
      const result = await reviewChangeRequest(
        1,
        99,
        'HR',
        {
          Status: 'Approved',
        }
      );

      expect(result.Status).toBe('Approved');
    });

    test('should reject missing request', async () => {
      prisma.employeeChangeRequest.findUnique.mockResolvedValue(null);

      await expect(
        reviewChangeRequest(1, 1, 'HR', {})
      ).rejects.toThrow('Change request not found.');
    });

    test('should reject unauthorized reviewer', async () => {
      await expect(
        reviewChangeRequest(
          1,
          55,
          'Employee',
          {
            Status: 'Approved',
          }
        )
      ).rejects.toThrow('Unauthorized');
    });

    test('should reject already reviewed request', async () => {
      prisma.employeeChangeRequest.findUnique.mockResolvedValue({
        Status: 'Approved',
        Employee: {
          SupervisorID: 1,
        },
      });

      await expect(
        reviewChangeRequest(1, 1, 'HR', {})
      ).rejects.toThrow('already been reviewed');
    });

    test('should update employee on approval', async () => {
      await reviewChangeRequest(
        1,
        99,
        'HR',
        {
          Status: 'Approved',
        }
      );

      expect(prisma.employee.update).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────
  // AUDIT LOG
  // ─────────────────────────────────────

  describe('getAuditLog', () => {
    test('should return audit logs', async () => {
      prisma.employeeAuditLog.findMany.mockResolvedValue([
        {
          AuditID: 1,
        },
      ]);

      prisma.employeeAuditLog.count.mockResolvedValue(1);

      const result = await getAuditLog(1, {});

      expect(result.logs).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────
  // ORG CHART
  // ─────────────────────────────────────

  describe('getOrgChart', () => {
    test('should return org chart', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
      });

      const result = await getOrgChart(1);

      expect(result.EmployeeID).toBe(1);
    });

    test('should reject invalid employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        getOrgChart(1)
      ).rejects.toThrow('Employee not found.');
    });
  });

  // ─────────────────────────────────────
  // DEPARTMENTS
  // ─────────────────────────────────────

  describe('Departments', () => {
    test('should list departments', async () => {
      prisma.department.findMany.mockResolvedValue([
        {
          DepartmentID: 1,
        },
      ]);

      const result = await listDepartments();

      expect(result).toHaveLength(1);
    });

    test('should create department', async () => {
      prisma.department.create.mockResolvedValue({
        DepartmentID: 1,
      });

      const result = await createDepartment({
        DepartmentName: 'IT',
      });

      expect(result.DepartmentID).toBe(1);
    });

    test('should update department', async () => {
      prisma.department.findUnique.mockResolvedValue({
        DepartmentID: 1,
      });

      prisma.department.update.mockResolvedValue({
        DepartmentName: 'HR',
      });

      const result = await updateDepartment(
        1,
        {
          DepartmentName: 'HR',
        }
      );

      expect(result.DepartmentName).toBe('HR');
    });

    test('should reject missing department update', async () => {
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(
        updateDepartment(1, {})
      ).rejects.toThrow('Department not found.');
    });
  });

  // ─────────────────────────────────────
  // POSITIONS
  // ─────────────────────────────────────

  describe('Positions', () => {
    test('should list positions', async () => {
      prisma.position.findMany.mockResolvedValue([
        {
          PositionID: 1,
        },
      ]);

      const result = await listPositions();

      expect(result).toHaveLength(1);
    });

    test('should create position', async () => {
      prisma.position.create.mockResolvedValue({
        PositionID: 1,
      });

      const result = await createPosition({
        PositionTitle: 'Developer',
      });

      expect(result.PositionID).toBe(1);
    });
  });

  // ─────────────────────────────────────
  // SALARY HISTORY
  // ─────────────────────────────────────

  describe('getSalaryHistory', () => {
    test('should return salary history', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
      });

      prisma.employeeSalary.findMany.mockResolvedValue([
        {
          SalaryID: 1,
        },
      ]);

      const result = await getSalaryHistory(1);

      expect(result).toHaveLength(1);
    });

    test('should reject missing employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        getSalaryHistory(1)
      ).rejects.toThrow('Employee not found.');
    });
  });

  describe('createSalaryRecord', () => {
    beforeEach(() => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
      });

      prisma.payGrade.findUnique.mockResolvedValue({
        PayGradeID: 1,
        MinSalary: 5000,
        MaxSalary: 20000,
        GradeName: 'G1',
      });

      prisma.employeeSalary.create.mockResolvedValue({
        SalaryID: 1,
      });
    });

    test('should create salary record', async () => {
      const result = await createSalaryRecord(
        1,
        {
          PayGradeID: 1,
          BaseSalary: 10000,
          EffectiveFrom: '2025-01-01',
        },
        1
      );

      expect(result.SalaryID).toBe(1);
    });

    test('should reject missing employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        createSalaryRecord(1, {}, 1)
      ).rejects.toThrow('Employee not found.');
    });

    test('should reject invalid pay grade', async () => {
      prisma.payGrade.findUnique.mockResolvedValue(null);

      await expect(
        createSalaryRecord(
          1,
          {
            PayGradeID: 1,
          },
          1
        )
      ).rejects.toThrow('Pay grade not found.');
    });

    test('should reject salary below range', async () => {
      await expect(
        createSalaryRecord(
          1,
          {
            PayGradeID: 1,
            BaseSalary: 1000,
          },
          1
        )
      ).rejects.toThrow('Base salary must be between');
    });

    test('should reject salary above range', async () => {
      await expect(
        createSalaryRecord(
          1,
          {
            PayGradeID: 1,
            BaseSalary: 999999,
          },
          1
        )
      ).rejects.toThrow('Base salary must be between');
    });

    test('should close previous salary record', async () => {
      await createSalaryRecord(
        1,
        {
          PayGradeID: 1,
          BaseSalary: 10000,
          EffectiveFrom: '2025-01-01',
        },
        1
      );

      expect(
        prisma.employeeSalary.updateMany
      ).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────
  // WORK LOCATIONS
  // ─────────────────────────────────────

  describe('listWorkLocations', () => {
    test('should return work locations', async () => {
      prisma.workLocation.findMany.mockResolvedValue([
        {
          WorkLocationID: 1,
        },
      ]);

      const result = await listWorkLocations();

      expect(result).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────
  // NOTIFICATIONS
  // ─────────────────────────────────────

  describe('getMyNotifications', () => {
    test('should return notifications', async () => {
      prisma.notification.findMany.mockResolvedValue([
        {
          NotificationID: 1,
        },
      ]);

      prisma.notification.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      const result = await getMyNotifications(
        1,
        {}
      );

      expect(result.notifications).toHaveLength(1);
    });

    test('should filter unread notifications', async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      prisma.notification.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      await getMyNotifications(
        1,
        {
          unreadOnly: 'true',
        }
      );

      expect(
        prisma.notification.findMany
      ).toHaveBeenCalled();
    });
  });

  describe('markNotificationsRead', () => {
    test('should mark notifications as read', async () => {
      prisma.notification.updateMany.mockResolvedValue({
        count: 2,
      });

      await markNotificationsRead(
        1,
        [1, 2]
      );

      expect(
        prisma.notification.updateMany
      ).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────
  // EMERGENCY CONTACTS
  // ─────────────────────────────────────

  describe('Emergency Contacts', () => {
    test('should get emergency contacts', async () => {
      prisma.emergencyContact.findMany.mockResolvedValue([
        {
          ContactID: 1,
        },
      ]);

      const result = await getEmergencyContacts(1);

      expect(result).toHaveLength(1);
    });

    test('should add emergency contact', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
      });

      prisma.emergencyContact.create.mockResolvedValue({
        ContactID: 1,
      });

      const result = await addEmergencyContact(
        1,
        {
          ContactName: 'Ali',
        }
      );

      expect(result.ContactID).toBe(1);
    });

    test('should reject adding contact to missing employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        addEmergencyContact(1, {})
      ).rejects.toThrow('Employee not found.');
    });

    test('should delete emergency contact', async () => {
      prisma.emergencyContact.findFirst.mockResolvedValue({
        ContactID: 1,
      });

      prisma.emergencyContact.delete.mockResolvedValue({
        ContactID: 1,
      });

      const result = await deleteEmergencyContact(1, 1);

      expect(result.ContactID).toBe(1);
    });

    test('should reject deleting missing contact', async () => {
      prisma.emergencyContact.findFirst.mockResolvedValue(null);

      await expect(
        deleteEmergencyContact(1, 1)
      ).rejects.toThrow('Contact not found');
    });
  });

  // ─────────────────────────────────────
  // SKILLS
  // ─────────────────────────────────────

  describe('Skills', () => {
    test('should get skills', async () => {
      prisma.employeeSkill.findMany.mockResolvedValue([
        {
          SkillID: 1,
        },
      ]);

      const result = await getSkills(1);

      expect(result).toHaveLength(1);
    });

    test('should add skill', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
      });

      prisma.employeeSkill.findFirst.mockResolvedValue(null);

      prisma.employeeSkill.create.mockResolvedValue({
        SkillID: 1,
      });

      const result = await addSkill(
        1,
        {
          SkillName: 'NodeJS',
        }
      );

      expect(result.SkillID).toBe(1);
    });

    test('should reject duplicate skill', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        EmployeeID: 1,
      });

      prisma.employeeSkill.findFirst.mockResolvedValue({
        SkillID: 1,
      });

      await expect(
        addSkill(
          1,
          {
            SkillName: 'NodeJS',
          }
        )
      ).rejects.toThrow('Skill already exists');
    });

    test('should delete skill', async () => {
      prisma.employeeSkill.findFirst.mockResolvedValue({
        SkillID: 1,
      });

      prisma.employeeSkill.delete.mockResolvedValue({
        SkillID: 1,
      });

      const result = await deleteSkill(1, 1);

      expect(result.SkillID).toBe(1);
    });

    test('should reject missing skill delete', async () => {
      prisma.employeeSkill.findFirst.mockResolvedValue(null);

      await expect(
        deleteSkill(1, 1)
      ).rejects.toThrow('Skill not found');
    });
  });

  // ─────────────────────────────────────
  // PROFILE COMPLETENESS
  // ─────────────────────────────────────

  describe('Profile Completeness', () => {
    test('should calculate profile completeness', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        FirstName: 'Ahmed',
        LastName: 'Ali',
        Email: 'a@test.com',
        Phone: '123',
        Address: 'Cairo',
        DateOfBirth: '2000-01-01',
        Nationality: 'Egyptian',
        PhotoURL: 'photo.jpg',
        EmergencyContacts: [{}],
        Skills: [{}],
      });

      const result = await getProfileCompleteness(1);

      expect(result.score).toBe(100);
    });

    test('should reject missing employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        getProfileCompleteness(1)
      ).rejects.toThrow('Employee not found.');
    });

    test('should send completeness reminder', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        FirstName: 'Ahmed',
        LastName: '',
        Email: '',
        Phone: '',
        Address: '',
        DateOfBirth: '',
        Nationality: '',
        PhotoURL: '',
        EmergencyContacts: [],
        Skills: [],
      });

      const result = await sendCompletenessReminder(
        1,
        99
      );

      expect(result.message).toContain('Reminder sent');
    });

    test('should reject reminder for complete profile', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        FirstName: 'Ahmed',
        LastName: 'Ali',
        Email: 'a@test.com',
        Phone: '123',
        Address: 'Cairo',
        DateOfBirth: '2000',
        Nationality: 'EG',
        PhotoURL: 'x',
        EmergencyContacts: [{}],
        Skills: [{}],
      });

      await expect(
        sendCompletenessReminder(1, 1)
      ).rejects.toThrow('already 100% complete');
    });
  });
});