const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const data = require('./seed-data.json'); // Make sure this path is correct

const prisma = new PrismaClient();
const hash = (pw) => bcrypt.hash(pw, 12);
const NOW = new Date();

async function main() {
  console.log('🌱 Starting clean data injection...');

  // 1. Work Locations
  let locationId = null;
  for (const loc of data.workLocations) {
    const created = await prisma.workLocation.upsert({
      where: { LocationCode: loc.LocationCode },
      update: {},
      create: { ...loc, IsActive: true }
    });
    locationId = created.WorkLocationID;
  }

  // 2. Pay Grades
  const gradeMap = {};
  for (const pg of data.payGrades) {
    const created = await prisma.payGrade.upsert({
      where: { GradeCode: pg.GradeCode },
      update: {},
      create: { ...pg, IsActive: true }
    });
    gradeMap[pg.GradeCode] = created.PayGradeID;
  }

  // 3. Positions
  const posMap = {};
  for (const pos of data.positions) {
    const created = await prisma.position.upsert({
      where: { PositionCode: pos.PositionCode },
      update: {},
      create: { 
        PositionCode: pos.PositionCode, 
        PositionTitle: pos.PositionTitle, 
        PayGradeID: gradeMap[pos.PayGradeCode],
        IsActive: true 
      }
    });
    posMap[pos.PositionCode] = created.PositionID;
  }

  // 4. Departments
  const deptMap = {};
  for (const dept of data.departments) {
    const created = await prisma.department.upsert({
      where: { DepartmentCode: dept.DepartmentCode },
      update: {},
      create: { ...dept, IsActive: true }
    });
    deptMap[dept.DepartmentCode] = created.DepartmentID;
  }

  // 5. Employees, Credentials, & Salaries
  for (const emp of data.employees) {
    const fullName = `${emp.FirstName} ${emp.LastName}`;
    
    const dbEmp = await prisma.employee.upsert({
      where: { Email: emp.Email },
      update: {},
      create: {
        EmployeeCode: emp.EmployeeCode,
        FullName: fullName,
        FirstName: emp.FirstName,
        LastName: emp.LastName,
        Email: emp.Email,
        DateOfBirth: new Date('1990-01-01T00:00:00Z'),
        Gender: 'Female',
        Nationality: 'Egyptian',
        MaritalStatus: 'Single',
        EmploymentType: 'Full-Time',
        StartDate: new Date('2023-01-01T00:00:00Z'),
        IsActive: true,
        CurrentStatus: 'Active',
        WorkLocationID: locationId,
        DepartmentID: deptMap[emp.DepartmentCode],
        PositionID: posMap[emp.PositionCode]
      }
    });

    // Hash and store password safely
    await prisma.userCredential.upsert({
      where: { EmployeeID: dbEmp.EmployeeID },
      update: {},
      create: {
        EmployeeID: dbEmp.EmployeeID,
        PasswordHash: await hash(emp.PasswordRaw),
        IsActive: true
      }
    });

    // Inject base salary
    const existingSal = await prisma.employeeSalary.findFirst({ where: { EmployeeID: dbEmp.EmployeeID } });
    if (!existingSal) {
      await prisma.employeeSalary.create({
        data: {
          EmployeeID: dbEmp.EmployeeID,
          PayGradeID: posMap[emp.PositionCode], // Links salary to their position's pay grade
          BaseSalary: emp.BaseSalary,
          EffectiveFrom: new Date('2023-01-01T00:00:00Z'),
          CurrencyCode: 'EGP',
          ChangeReason: 'Initial Seed'
        }
      });
    }

    console.log(`✅ Injected: ${fullName} (${emp.PositionCode})`);
  }

  console.log('\n🚀 Data injection complete! You can now log in.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());