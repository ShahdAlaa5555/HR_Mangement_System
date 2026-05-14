const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedFullPayroll() {
  console.log('🌱 Starting Full Payroll Data Injection...');

  // ── 1. Seed Tax Brackets (Egyptian 2024/2025 Standard) ──
  console.log('Injecting Tax Brackets...');
  const currentYear = new Date().getFullYear();
  await prisma.taxBracket.deleteMany({ where: { EffectiveYear: currentYear } });
  await prisma.taxBracket.createMany({
    data: [
      { EffectiveYear: currentYear, BracketOrder: 1, PersonalExemptionEGP: 20000, FromAmountEGP: 0, ToAmountEGP: 15000, RatePct: 0 },
      { EffectiveYear: currentYear, BracketOrder: 2, PersonalExemptionEGP: 20000, FromAmountEGP: 15001, ToAmountEGP: 30000, RatePct: 2.5 },
      { EffectiveYear: currentYear, BracketOrder: 3, PersonalExemptionEGP: 20000, FromAmountEGP: 30001, ToAmountEGP: 45000, RatePct: 10 },
      { EffectiveYear: currentYear, BracketOrder: 4, PersonalExemptionEGP: 20000, FromAmountEGP: 45001, ToAmountEGP: 60000, RatePct: 15 },
      { EffectiveYear: currentYear, BracketOrder: 5, PersonalExemptionEGP: 20000, FromAmountEGP: 60001, ToAmountEGP: 200000, RatePct: 20 },
      { EffectiveYear: currentYear, BracketOrder: 6, PersonalExemptionEGP: 20000, FromAmountEGP: 200001, ToAmountEGP: 400000, RatePct: 25 },
      { EffectiveYear: currentYear, BracketOrder: 7, PersonalExemptionEGP: 20000, FromAmountEGP: 400001, ToAmountEGP: null, RatePct: 27.5 },
    ]
  });

  // ── 2. Seed Social Insurance (Law 148/2019) ──
  console.log('Injecting Social Insurance Config...');
  await prisma.socialInsuranceConfig.deleteMany();
  await prisma.socialInsuranceConfig.create({
    data: {
      EffectiveFrom: new Date('2024-01-01T00:00:00Z'),
      EmployeeRatePct: 7.25,
      EmployerRatePct: 18.75
    }
  });

  // ── 3. Seed Overtime Rule ──
  console.log('Injecting Overtime Rules...');
  const otRule = await prisma.overtimeRule.create({
    data: {
      RuleName: 'Standard Egyptian OT (1.35x)',
      ThresholdHours: 8,
      Multiplier: 1.35,
      IsNighttime: false,
      IsRestDay: false
    }
  });

  // ── 4. Seed Payroll Policy ──
  console.log('Injecting Default Payroll Policy...');
  const policy = await prisma.payrollPolicy.create({
    data: {
      PolicyName: 'Standard Corporate Policy',
      PayPeriod: 'Monthly',
      CutoffDay: 25,
      PaymentDay: 28,
      OvertimeRuleID: otRule.OvertimeRuleID,
      MaxMonthlyDeductionDays: 5,
      MinimumWageEGP: 6000,
      TaxCalculationMethod: 'Standard'
    }
  });

 // ── 5. Seed an Allowance Type ──
  console.log('Injecting Standard Allowances...');
  const allowance = await prisma.allowance.create({
    data: {
      AllowanceName: 'Housing Allowance',
      Amount: 2000.00,
      CurrencyCode: 'EGP' // Adding this since Prisma highlighted it as an option
    }
  });
// ── 6. Assign Financials to an Employee ──
  console.log('Locating an Employee to assign financials...');
  const employee = await prisma.employee.findFirst();

  if (!employee) {
    console.log('⚠️ No employees found in the database! Please create an employee first.');
    return;
  }

  // CREATE A DEFAULT PAY GRADE TO SATISFY PRISMA RELATION
  console.log('Creating Default Pay Grade...');
  
  // Use upsert to avoid Unique Constraint errors on 'GradeCode' if run multiple times
  const payGrade = await prisma.payGrade.upsert({
    where: { GradeCode: 'PG-SEED' },
    update: {}, // Do nothing if it already exists
    create: {
      GradeCode: 'PG-SEED',
      GradeName: 'Standard Seed Grade',
      MinSalary: 5000.00,
      MaxSalary: 50000.00,
      CurrencyCode: 'EGP'
    }
  });

  // Assign Base Salary
  console.log(`Assigning 15,000 EGP Base Salary to Employee ID: ${employee.EmployeeID}`);
  await prisma.employeeSalary.create({
    data: {
      Employee: { connect: { EmployeeID: employee.EmployeeID } }, 
      PayGrade: { connect: { PayGradeID: payGrade.PayGradeID } }, 
      BaseSalary: 15000.00,
      EffectiveFrom: new Date('2023-01-01T00:00:00Z'),
      CurrencyCode: 'EGP',
      ChangeReason: 'Initial System Seed'
    }
  });

  // Assign Allowance
  console.log(`Assigning Housing Allowance to Employee ID: ${employee.EmployeeID}`);
  await prisma.employeeAllowance.create({
    data: {
      Employee: { connect: { EmployeeID: employee.EmployeeID } },
      Allowance: { connect: { AllowanceID: allowance.AllowanceID } }, 
      EffectiveFrom: new Date('2023-01-01T00:00:00Z'),
      OverrideAmount: 2500.00 
    }
  });

  console.log('\n✅ BOOM! Full Payroll Data Injected Successfully!');
  console.log(`➔ Policy ID: ${policy.PolicyID} (Use this ID when creating a run in the frontend)`);
}

seedFullPayroll()
  .catch(e => {
    console.error('❌ Error during seeding:', e.message);
  })
  .finally(() => prisma.$disconnect());