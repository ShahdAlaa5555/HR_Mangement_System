const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const employees = [
    { code: 'EMP-001', salary: 25000, workedHours: 8 }, // HR Manager
    { code: 'EMP-002', salary: 12000, workedHours: 7.5 },
    { code: 'EMP097442', salary: 9000, workedHours: 8 },
    { code: 'EMP504648', salary: 30000, workedHours: 8 }, // Admin
    { code: 'EMP739867', salary: 11000, workedHours: 7 },
    { code: 'EMP850315', salary: 15000, workedHours: 8 }, // Supervisor
    { code: 'EMP996869', salary: 7000, workedHours: 6 }
  ];

  for (const emp of employees) {
    const user = await prisma.employee.findUnique({ where: { EmployeeCode: emp.code } });
    if (!user) continue;

    // Inject Salary
    await prisma.employeeSalary.upsert({
      where: { SalaryID: user.EmployeeID }, // Adjust unique identifier if needed
      update: { BaseSalary: emp.salary },
      create: {
        EmployeeID: user.EmployeeID,
        PayGradeID: 1, // Ensure this ID exists
        BaseSalary: emp.salary,
        EffectiveFrom: new Date(),
        CurrencyCode: 'EGP'
      }
    });

    // Inject Attendance
    await prisma.attendanceRecord.upsert({
      where: { UQ_Attendance_EmployeeDate: { EmployeeID: user.EmployeeID, AttendanceDate: new Date('2026-06-01') } },
      update: { WorkedHours: emp.workedHours },
      create: {
        EmployeeID: user.EmployeeID,
        AttendanceDate: new Date('2026-06-01'),
        Status: 'Present',
        WorkedHours: emp.workedHours,
        IsManualEntry: true
      }
    });
    console.log(`Injected data for: ${emp.code}`);
  }
}

main().finally(() => prisma.$disconnect());