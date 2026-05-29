/**
 * uml-verify.js
 * ─────────────────────────────────────────────────────────────────────────────
 * UML Class Diagram → Codebase Verification Script
 *
 * WHAT IT DOES:
 *   Reads HR_UML_Enhanced_v2.json and compares every design element
 *   (classes → service functions, methods → exported functions,
 *   relationships → cross-module imports, constraints → guard patterns)
 *   against your real Express/Prisma source files.
 *
 * HOW TO RUN:
 *   node uml-verify.js
 *   node uml-verify.js --module employee
 *   node uml-verify.js --module payroll --verbose
 *   node uml-verify.js --json          (outputs raw JSON report)
 *
 * OUTPUT:
 *   A colour-coded gap report: ✅ present / ❌ missing / ⚠ partial
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const JSON_OUT = args.includes('--json');
const MODULE_FILTER = (() => {
  const i = args.indexOf('--module');
  return i !== -1 ? args[i + 1]?.toLowerCase() : null;
})();

// ── Colours (disabled when outputting JSON) ───────────────────────────────────
const C = JSON_OUT ? {
  reset:'', bold:'', dim:'', green:'', red:'', yellow:'', cyan:'', magenta:'', white:''
} : {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  red:     '\x1b[31m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  white:   '\x1b[37m',
};

// ── Path configuration (matches your real project layout) ─────────────────────
const ROOT     = path.resolve(__dirname);
const UML_FILE = path.join(ROOT, 'HR_UML_Enhanced_v2.json');

const MODULE_PATHS = {
  EmployeeManagement: [
    'src/modules/employee/services/employee.service.js',
  ],
  TimeManagement: [
    'src/modules/attendance/services/attendance.service.js',
  ],
  PayrollManagement: [
    'src/modules/payroll/services/payroll.service.js',
    'src/modules/payroll/services/payroll.calculator.js',
  ],
  LeaveManagement: [
    'src/modules/leave/services/leave.service.js',
  ],
  // Infrastructure modules — no dedicated service files yet
  WorkflowEngine:        [],
  SecurityAndRBAC:       ['src/middleware/auth.js'],
  NotificationSystem:    ['src/shared/utils/notification.util.js'],
  AnalyticsAndReporting: [],
};

// ── UML → Code concept mapping ────────────────────────────────────────────────
// Maps UML class names to the service-layer concepts we look for in the code.
// Each entry has:
//   serviceFile  — which file(s) to scan
//   methods      — UML method → search terms in the real code
//   prismaModels — Prisma model names that prove the entity exists in the schema
//   constants    — constant names that prove an enum/status is implemented
const CLASS_MAP = {

  // ── EmployeeManagement ──────────────────────────────────────────────────────
  Employee: {
    pkg: 'EmployeeManagement',
    serviceFile: 'src/modules/employee/services/employee.service.js',
    prismaModels: ['employee'],
    methods: {
      updateProfile:             ['updateEmployee'],
      assignManager:             ['SupervisorID', 'updateEmployee'],
      deactivate:                ['terminateEmployee', 'IsActive'],
      reactivate:                ['reactivateEmployee'],
      getFullName:               ['FullName'],
      isOnProbation:             ['probation', 'ProbationEndDate', 'SpecialStatus'],
      requestVerificationLetter: ['getEmployeeForPdf', 'PDF'],
    },
    constraints: {
      'C-001 email unique':   ['DUPLICATE_ENTRY', 'Email.*already'],
      'C-002 salary >= 0':    ['SALARY_OUT_OF_RANGE', 'MinSalary', 'MaxSalary'],
    },
  },

  EmployeeProfile: {
    pkg: 'EmployeeManagement',
    serviceFile: 'src/modules/employee/services/employee.service.js',
    prismaModels: ['employee'],
    methods: {
      calculateCompleteness: ['getProfileCompleteness', 'score'],
      getMissingFields:      ['getProfileCompleteness', 'criteria'],
      sendCompletionReminder:['sendCompletenessReminder'],
    },
  },

  EmployeeDocument: {
    pkg: 'EmployeeManagement',
    serviceFile: 'src/modules/employee/services/employee.service.js',
    prismaModels: ['employeeDocument'],
    methods: {
      upload:           ['addDocumentRecord', 'FileURL'],
      isExpired:        ['ExpiryDate'],
      createNewVersion: ['addDocumentRecord'],
      verify:           ['UploadedBy'],
    },
  },

  EmergencyContact: {
    pkg: 'EmployeeManagement',
    serviceFile: 'src/modules/employee/services/employee.service.js',
    prismaModels: ['emergencyContact'],
    methods: {
      update: ['updateEmergencyContact'],
      delete: ['deleteEmergencyContact'],
    },
  },

  EmploymentContract: {
    pkg: 'EmployeeManagement',
    serviceFile: 'src/modules/employee/services/employee.service.js',
    prismaModels: ['employeeSalary'],
    methods: {
      renew:      ['createSalaryRecord', 'EffectiveFrom'],
      terminate:  ['terminateEmployee'],
      isExpiring: ['isExpiring', 'ExpiryDate', 'EffectiveTo'],
    },
  },

  UserAccount: {
    pkg: 'EmployeeManagement',
    serviceFile: 'src/modules/employee/services/employee.service.js',
    prismaModels: ['userAccount'],
    methods: {
      activate:      ['assignEmployeeRole', 'IsActive'],
      deactivate:    ['terminateEmployee', 'IsActive'],
      resetPassword: ['resetPassword', 'Password'],
    },
    constraints: {
      'C-016 username unique': ['username.*unique', 'DUPLICATE_ENTRY'],
    },
  },

  AuditLog: {
    pkg: 'EmployeeManagement',
    serviceFile: 'src/modules/employee/services/employee.service.js',
    prismaModels: ['employeeAuditLog'],
    methods: {
      record: ['employeeAuditLog.create'],
      query:  ['getAuditLog', 'employeeAuditLog.findMany'],
    },
  },

  EmployeeService: {
    pkg: 'EmployeeManagement',
    serviceFile: 'src/modules/employee/services/employee.service.js',
    methods: {
      createEmployee:             ['createEmployee'],
      updateEmployee:             ['updateEmployee'],
      deactivateEmployee:         ['terminateEmployee'],
      bulkImport:                 ['bulkImport', 'bulk'],
      generateVerificationLetter: ['getEmployeeForPdf', 'PDF'],
    },
  },

  // ── TimeManagement ──────────────────────────────────────────────────────────
  AttendanceRecord: {
    pkg: 'TimeManagement',
    serviceFile: 'src/modules/attendance/services/attendance.service.js',
    prismaModels: ['attendanceRecord'],
    methods: {
      calculateWorkedHours: ['calcHoursDiff', 'workedHours', 'WorkedHours'],
      validateAttendance:   ['validateAttendance', 'CheckInTime', 'CheckOutTime'],
      flagMissedPunch:      ['MISSED_PUNCH', 'missedPunch', 'flagMissedPunch'],
      markAsOnLeave:        ['markAttendanceAsOnLeave', 'ON_LEAVE'],
    },
    constraints: {
      'C-004 checkOut after checkIn': ['ALREADY_CHECKED_OUT', 'CheckInTime', 'CheckOutTime'],
      'C-005 workedHours >= 0':       ['Math.max(0', 'workedHours'],
    },
  },

  Shift: {
    pkg: 'TimeManagement',
    serviceFile: 'src/modules/attendance/services/attendance.service.js',
    prismaModels: ['shift'],
    methods: {
      calculateNetHours:    ['calcHoursDiff', 'BreakDurationMin', 'workedHours'],
      isLate:               ['calcLatenessMinutes', 'latenessMinutes', 'LatenessMinutes'],
    },
  },

  ShiftAssignment: {
    pkg: 'TimeManagement',
    serviceFile: 'src/modules/attendance/services/attendance.service.js',
    prismaModels: ['employeeShiftAssignment'],
    methods: {
      assign:       ['assignShift', 'employeeShiftAssignment.create'],
      expire:       ['EffectiveTo', 'updateMany'],
      isActiveToday:['getActiveShiftForEmployee', 'EffectiveFrom', 'EffectiveTo'],
    },
    constraints: {
      'C-015 effectiveTo > effectiveFrom': ['EffectiveTo', 'EffectiveFrom'],
    },
  },

  OvertimeRequest: {
    pkg: 'TimeManagement',
    serviceFile: 'src/modules/attendance/services/attendance.service.js',
    prismaModels: ['overtimeRequest'],
    methods: {
      submit:  ['submitOvertimeRequest', 'PENDING'],
      approve: ['approveOvertimeRequest', 'APPROVED'],
      reject:  ['approveOvertimeRequest', 'REJECTED'],
    },
    constraints: {
      'C-018 hours > 0':                ['MAX_OVERTIME_HOURS_PER_DAY', 'EstimatedHours'],
      'C-018 hours <= policy max':      ['MAX_OVERTIME_HOURS_PER_DAY', 'OVERTIME_LIMIT_EXCEEDED'],
    },
  },

  TimeSheet: {
    pkg: 'TimeManagement',
    serviceFile: 'src/modules/attendance/services/attendance.service.js',
    prismaModels: ['attendanceSummary'],
    methods: {
      summarize:               ['generateAttendanceSummary'],
      syncToPayroll:           ['generateAttendanceSummary', 'AttendanceSummaryID'],
      blockPayrollIfIncomplete:['MissingAttendance', 'createOrUpdateException'],
    },
    constraints: {
      'C-012 missing punches block payroll': ['MissingAttendance', 'createOrUpdateException'],
    },
  },

  AttendanceService: {
    pkg: 'TimeManagement',
    serviceFile: 'src/modules/attendance/services/attendance.service.js',
    methods: {
      calculateWorkedHours: ['calcHoursDiff'],
      detectLateAttendance: ['calcLatenessMinutes', 'latenessMinutes'],
      syncBiometricLogs:    ['IsManualEntry', 'BiometricLog', 'sync'],
      generateExceptions:   ['createOrUpdateException'],
      exportToPayroll:      ['generateAttendanceSummary'],
    },
  },

  // ── PayrollManagement ───────────────────────────────────────────────────────
  PayrollCycle: {
    pkg: 'PayrollManagement',
    serviceFile: 'src/modules/payroll/services/payroll.service.js',
    prismaModels: ['payrollRun'],
    methods: {
      initiate:        ['createPayrollRun', 'DRAFT'],
      processPayroll:  ['processPayrollRun'],
      generateDraft:   ['createPayrollRun', 'DRAFT'],
      approvePayroll:  ['approvePayrollRun', 'APPROVED'],
      lock:            ['finalizePayrollRun', 'FINALIZED'],
      closeCycle:      ['finalizePayrollRun', 'FINALIZED'],
    },
    constraints: {
      'C-009 cannot close before APPROVED': ['PENDING_APPROVAL', 'APPROVED', 'INVALID_STATUS'],
      'C-010 locked cycle no modify':       ['FINALIZED', 'Cannot process run in current status'],
    },
  },

  Payslip: {
    pkg: 'PayrollManagement',
    serviceFile: 'src/modules/payroll/services/payroll.service.js',
    prismaModels: ['payslip'],
    methods: {
      generate:   ['generatePayslips'],
      download:   ['getPayslipById', 'getMyPayslips'],
      dispute:    ['dispute', 'DISPUTED'],
      markAsPaid: ['PAID', 'finalizePayrollRun'],
    },
    constraints: {
      'C-011 netPay = gross - deductions': ['netPay', 'TotalDeductions', 'grossEarnings'],
    },
  },

  SalaryStructure: {
    pkg: 'PayrollManagement',
    serviceFile: 'src/modules/payroll/services/payroll.calculator.js',
    prismaModels: ['payGrade', 'employeeSalary'],
    methods: {
      calculateGross:  ['contractBaseSalary', 'baseSalary', 'grossIncome'],
      applyProration:  ['prorationFactor', 'activeDays', 'getActiveDays'],
    },
  },

  Deduction: {
    pkg: 'PayrollManagement',
    serviceFile: 'src/modules/payroll/services/payroll.calculator.js',
    prismaModels: ['payrollEntryLine'],
    methods: {
      calculate: ['absenceDeduction', 'latenessDeduction', 'employeeSI', 'incomeTax'],
      apply:     ['payrollEntryLine', 'lines.push', 'TotalDeductions'],
    },
  },

  TaxRule: {
    pkg: 'PayrollManagement',
    serviceFile: 'src/modules/payroll/services/payroll.calculator.js',
    prismaModels: ['taxBracket'],
    methods: {
      calculateTax: ['calculateAnnualIncomeTax', 'calculateMonthlyIncomeTax', 'taxBracket'],
    },
    constraints: {
      'C-013 bracketMax > bracketMin': ['BracketOrder', 'FromAmountEGP', 'ToAmountEGP'],
    },
  },

  OvertimeCalculation: {
    pkg: 'PayrollManagement',
    serviceFile: 'src/modules/payroll/services/payroll.calculator.js',
    prismaModels: ['overtimeRequest'],
    methods: {
      compute:        ['calculateOvertimePay', 'overtimePay', 'overtimeHours'],
      applyToPayslip: ['overtimePay', 'OvertimePay', 'lines.push'],
    },
  },

  FinalSettlement: {
    pkg: 'PayrollManagement',
    serviceFile: 'src/modules/payroll/services/payroll.service.js',
    prismaModels: ['payrollEntry'],
    methods: {
      calculate: ['netPay', 'TotalDeductions', 'TotalEarnings'],
      approve:   ['approvePayrollRun'],
      process:   ['finalizePayrollRun', 'generatePayslips'],
    },
    constraints: {
      'C-020 only after deactivation': ['IsActive', 'Terminated', 'CurrentStatus'],
    },
  },

  PayrollService: {
    pkg: 'PayrollManagement',
    serviceFile: 'src/modules/payroll/services/payroll.service.js',
    methods: {
      processPayroll:         ['processPayrollRun'],
      calculateDeductions:    ['absenceDeduction', 'employeeSI', 'monthlyTax'],
      generatePayslips:       ['generatePayslips'],
      applyTax:               ['calculateAnnualTax', 'incomeTax'],
      computeOvertime:        ['calculateOvertimePay', 'overtimePay'],
      processFinalSettlement: ['finalizePayrollRun', 'generatePayslips'],
    },
  },

  // ── LeaveManagement ─────────────────────────────────────────────────────────
  LeaveRequest: {
    pkg: 'LeaveManagement',
    serviceFile: 'src/modules/leave/services/leave.service.js',
    prismaModels: ['leaveRequest'],
    methods: {
      submit:           ['submitLeaveRequest', 'SUBMITTED'],
      approve:          ['processApproval', 'APPROVED'],
      reject:           ['processApproval', 'REJECTED'],
      cancel:           ['cancelLeaveRequest', 'CANCELLED'],
      syncToAttendance: ['markAttendanceAsOnLeave'],
      syncToPayroll:    ['syncLeaveToPayroll', 'bulkSyncPayroll'],
    },
    constraints: {
      'C-007 endDate >= startDate':    ['StartDate', 'EndDate', 'TotalDays'],
      'C-008 status transitions':      ['SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'Cannot edit finalized'],
    },
  },

  LeaveBalance: {
    pkg: 'LeaveManagement',
    serviceFile: 'src/modules/leave/services/leave.service.js',
    prismaModels: ['leaveBalance'],
    methods: {
      deduct:                   ['PendingDays.*increment', 'UsedDays.*increment'],
      restore:                  ['PendingDays.*decrement', 'UsedDays.*decrement'],
      getAvailable:             ['available', 'EntitledDays', 'UsedDays'],
      carryForwardToNextYear:   ['CarryOverDays', 'carryOver'],
    },
    constraints: {
      'C-006 balance never negative': ['available', 'Insufficient leave balance'],
    },
  },

  LeavePolicy: {
    pkg: 'LeaveManagement',
    serviceFile: 'src/modules/leave/services/leave.service.js',
    prismaModels: ['leavePolicy'],
    methods: {
      isEligible:           ['MinTenureMonths', 'tenureMonths', 'NoticePeriodDays'],
      calculateEntitlement: ['EntitledDays', 'DefaultDays', 'initializeLeaveBalances'],
    },
    constraints: {
      'C-014 carryForward <= maxDays': ['CarryOverDays', 'maxCarryForwardDays'],
    },
  },

  ApprovalDelegation: {
    pkg: 'LeaveManagement',
    serviceFile: 'src/modules/leave/services/leave.service.js',
    prismaModels: ['leaveDelegation'],
    methods: {
      activate:    ['delegateApproval', 'ACTIVE'],
      isValidNow:  ['activeDelegations', 'StartDate', 'EndDate'],
    },
    constraints: {
      'C-017 toDate > fromDate':    ['StartDate', 'EndDate'],
      'C-017 no self-delegation':   ['ManagerID', 'DelegateID'],
    },
  },

  LeaveService: {
    pkg: 'LeaveManagement',
    serviceFile: 'src/modules/leave/services/leave.service.js',
    methods: {
      applyLeave:            ['submitLeaveRequest'],
      validateLeaveBalance:  ['available', 'Insufficient leave balance'],
      approveLeave:          ['processApproval'],
      rejectLeave:           ['processApproval'],
      syncWithPayroll:       ['syncLeaveToPayroll', 'bulkSyncPayroll'],
      processAccruals:       ['initializeLeaveBalances', 'updateGlobalEntitlements'],
    },
  },
};

// ── Cross-module integration checks ──────────────────────────────────────────
// Verifies that the integration points described in the UML actually exist
// as import statements or function calls in the code.
const INTEGRATIONS = [
  {
    label: 'Leave → Attendance sync',
    description: 'leave.service must import and call markAttendanceAsOnLeave',
    file: 'src/modules/leave/services/leave.service.js',
    patterns: ['markAttendanceAsOnLeave', "require.*attendance"],
  },
  {
    label: 'Leave → Payroll adjustment',
    description: 'leave.service must expose syncLeaveToPayroll / bulkSyncPayroll',
    file: 'src/modules/leave/services/leave.service.js',
    patterns: ['syncLeaveToPayroll', 'bulkSyncPayroll'],
  },
  {
    label: 'Attendance → Payroll (TimeSheet feeds PayrollCycle)',
    description: 'payroll.service must reference AttendanceSummary',
    file: 'src/modules/payroll/services/payroll.service.js',
    patterns: ['attendanceSummary', 'AttendanceSummaryID', 'MissingAttendance'],
  },
  {
    label: 'Employee → Time Management (contractType drives shift rules)',
    description: 'attendance.service must read employee fields to apply shift rules',
    file: 'src/modules/attendance/services/attendance.service.js',
    patterns: ['employee.findUnique', 'IsActive', 'CurrentStatus'],
  },
  {
    label: 'Employee → Payroll (salary drives SalaryStructure)',
    description: 'payroll.service/calculator must read EmployeeSalary',
    file: 'src/modules/payroll/services/payroll.service.js',
    patterns: ['employeeSalary', 'BaseSalary', 'EffectiveFrom'],
  },
  {
    label: 'Employee → Leave (tenure drives eligibility)',
    description: 'leave.service must check employee tenure before granting leave',
    file: 'src/modules/leave/services/leave.service.js',
    patterns: ['MinTenureMonths', 'tenureMonths', 'StartDate'],
  },
  {
    label: 'Notification system fires on state transitions',
    description: 'All modules must call notify() on key events',
    file: null, // checked across all service files
    patterns: ['notify('],
    files: [
      'src/modules/employee/services/employee.service.js',
      'src/modules/attendance/services/attendance.service.js',
      'src/modules/payroll/services/payroll.service.js',
      'src/modules/leave/services/leave.service.js',
    ],
  },
  {
    label: 'AuditLog tracks changes across modules',
    description: 'employee.service must create audit log entries on mutations',
    file: 'src/modules/employee/services/employee.service.js',
    patterns: ['employeeAuditLog.create', 'ChangeType', 'FieldChanged'],
  },
];

// ── File reader (cached) ──────────────────────────────────────────────────────
const FILE_CACHE = {};
function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  if (FILE_CACHE[full] !== undefined) return FILE_CACHE[full];
  try {
    FILE_CACHE[full] = fs.readFileSync(full, 'utf8');
  } catch {
    FILE_CACHE[full] = null;
  }
  return FILE_CACHE[full];
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ── Pattern matcher ───────────────────────────────────────────────────────────
function matchesAny(source, patterns) {
  if (!source) return false;
  return patterns.some((p) => {
    try { return new RegExp(p, 'i').test(source); }
    catch { return source.includes(p); }
  });
}

function countMatches(source, patterns) {
  if (!source) return 0;
  return patterns.filter((p) => {
    try { return new RegExp(p, 'i').test(source); }
    catch { return source.includes(p); }
  }).length;
}

// ── Prisma schema checker ─────────────────────────────────────────────────────
let PRISMA_SCHEMA = null;
function getPrismaSchema() {
  if (PRISMA_SCHEMA !== null) return PRISMA_SCHEMA;
  PRISMA_SCHEMA = readFile('prisma/schema.prisma') || '';
  return PRISMA_SCHEMA;
}

function prismaModelExists(modelName) {
  const schema = getPrismaSchema();
  return new RegExp(`model\\s+${modelName}\\s*\\{`, 'i').test(schema);
}

// ── Core verifier ─────────────────────────────────────────────────────────────
function verifyClass(className, def) {
  const result = {
    className,
    package: def.pkg,
    serviceFileExists: false,
    prismaModels: {},
    methods: {},
    constraints: {},
    score: 0,
    total: 0,
    status: 'missing',
  };

  // 1. Service file exists
  if (def.serviceFile) {
    result.serviceFileExists = fileExists(def.serviceFile);
  } else {
    result.serviceFileExists = null; // not applicable
  }

  const source = def.serviceFile ? readFile(def.serviceFile) : null;

  // Also check secondary files for PayrollManagement
  const extraSources = [];
  if (def.pkg === 'PayrollManagement') {
    const calc = readFile('src/modules/payroll/services/payroll.calculator.js');
    if (calc) extraSources.push(calc);
  }
  const allSource = [source, ...extraSources].filter(Boolean).join('\n');

  // 2. Prisma models
  if (def.prismaModels) {
    for (const model of def.prismaModels) {
      result.prismaModels[model] = prismaModelExists(model);
      result.total++;
      if (result.prismaModels[model]) result.score++;
    }
  }

  // 3. Methods
  if (def.methods) {
    for (const [method, patterns] of Object.entries(def.methods)) {
      const matched = countMatches(allSource, patterns);
      const found   = matched >= 1;
      const partial = !found && matched === 0 && patterns.length > 1;

      result.methods[method] = {
        found,
        matchedPatterns: matched,
        totalPatterns: patterns.length,
        status: found ? 'present' : (partial ? 'partial' : 'missing'),
      };
      result.total++;
      if (found) result.score++;
      else if (partial) result.score += 0.5;
    }
  }

  // 4. Constraints
  if (def.constraints) {
    for (const [constraint, patterns] of Object.entries(def.constraints)) {
      const found = matchesAny(allSource, patterns);
      result.constraints[constraint] = found;
      result.total++;
      if (found) result.score++;
    }
  }

  // 5. Derive status
  const pct = result.total > 0 ? result.score / result.total : 0;
  if (pct >= 0.85)      result.status = 'present';
  else if (pct >= 0.40) result.status = 'partial';
  else                  result.status = 'missing';

  result.coveragePct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
  return result;
}

function verifyIntegration(integ) {
  if (integ.files) {
    // Multi-file check: pattern must appear in ALL listed files
    const results = integ.files.map((f) => ({
      file: f,
      found: matchesAny(readFile(f), integ.patterns),
    }));
    const allFound = results.every((r) => r.found);
    return { ...integ, found: allFound, fileResults: results };
  }
  const source = readFile(integ.file);
  return { ...integ, found: matchesAny(source, integ.patterns) };
}

// ── Report printer ─────────────────────────────────────────────────────────────
function statusIcon(s) {
  if (s === 'present') return `${C.green}✅${C.reset}`;
  if (s === 'partial') return `${C.yellow}⚠ ${C.reset}`;
  return `${C.red}❌${C.reset}`;
}

function printReport(classResults, integResults) {
  if (!JSON_OUT) {
    console.log(`\n${C.bold}${C.cyan}═══════════════════════════════════════════════════════════${C.reset}`);
    console.log(`${C.bold}${C.cyan}   HR System — UML vs Code Verification Report${C.reset}`);
    console.log(`${C.bold}${C.cyan}═══════════════════════════════════════════════════════════${C.reset}\n`);
  }

  // Group by package
  const byPkg = {};
  for (const r of classResults) {
    if (!byPkg[r.package]) byPkg[r.package] = [];
    byPkg[r.package].push(r);
  }

  const summary = { present: 0, partial: 0, missing: 0 };
  const allGaps = [];

  for (const [pkg, classes] of Object.entries(byPkg)) {
    if (!JSON_OUT) {
      console.log(`${C.bold}${C.magenta}── ${pkg}${C.reset}`);
    }

    for (const r of classes) {
      summary[r.status]++;

      if (!JSON_OUT) {
        const icon = statusIcon(r.status);
        const pct  = String(r.coveragePct).padStart(3);
        console.log(`  ${icon} ${r.className.padEnd(28)} ${C.dim}${pct}% coverage${C.reset}`);

        if (VERBOSE || r.status !== 'present') {
          // Service file
          if (r.serviceFile !== undefined && r.serviceFileExists !== null) {
            const fIcon = r.serviceFileExists ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
            console.log(`     ${fIcon} Service file: ${r.serviceFile || '(none)'}`);
          }

          // Prisma models
          for (const [model, found] of Object.entries(r.prismaModels)) {
            const mIcon = found ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
            if (!found || VERBOSE) console.log(`     ${mIcon} Prisma model: ${model}`);
            if (!found) allGaps.push({ class: r.className, type: 'prisma_model', item: model });
          }

          // Methods
          for (const [method, info] of Object.entries(r.methods)) {
            if (!info.found || VERBOSE) {
              const mIcon = info.found ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
              console.log(`     ${mIcon} method: ${method}()`);
              if (!info.found) allGaps.push({ class: r.className, type: 'method', item: method + '()' });
            }
          }

          // Constraints
          for (const [constraint, found] of Object.entries(r.constraints)) {
            if (!found || VERBOSE) {
              const cIcon = found ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
              console.log(`     ${cIcon} constraint: ${constraint}`);
              if (!found) allGaps.push({ class: r.className, type: 'constraint', item: constraint });
            }
          }
        }
      }
    }
    if (!JSON_OUT) console.log();
  }

  // Cross-module integrations
  if (!JSON_OUT) {
    console.log(`${C.bold}${C.cyan}── Cross-Module Integrations${C.reset}`);
  }
  for (const r of integResults) {
    if (!JSON_OUT) {
      const icon = r.found ? `${C.green}✅${C.reset}` : `${C.red}❌${C.reset}`;
      console.log(`  ${icon} ${r.label}`);
      if (!r.found || VERBOSE) {
        console.log(`     ${C.dim}${r.description}${C.reset}`);
        if (r.fileResults) {
          for (const fr of r.fileResults) {
            const fi = fr.found ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
            console.log(`     ${fi} ${fr.file}`);
          }
        }
        if (!r.found) allGaps.push({ class: 'CrossModule', type: 'integration', item: r.label });
      }
    }
  }

  // Summary
  const integPresent = integResults.filter((r) => r.found).length;
  const totalInteg   = integResults.length;

  if (!JSON_OUT) {
    console.log(`\n${C.bold}${C.cyan}═══════════════════════════════════════════════════════════${C.reset}`);
    console.log(`${C.bold}  Summary${C.reset}`);
    console.log(`${C.bold}${C.cyan}═══════════════════════════════════════════════════════════${C.reset}`);
    console.log(`  ${C.green}✅ Present:${C.reset}  ${summary.present} classes`);
    console.log(`  ${C.yellow}⚠  Partial:${C.reset}  ${summary.partial} classes`);
    console.log(`  ${C.red}❌ Missing:${C.reset}  ${summary.missing} classes`);
    console.log(`  ${C.cyan}🔗 Integrations:${C.reset} ${integPresent}/${totalInteg} verified\n`);

    if (allGaps.length > 0) {
      console.log(`${C.bold}${C.yellow}  Gap Report (${allGaps.length} items to address)${C.reset}`);
      const grouped = {};
      for (const g of allGaps) {
        if (!grouped[g.type]) grouped[g.type] = [];
        grouped[g.type].push(`${g.class} → ${g.item}`);
      }
      for (const [type, items] of Object.entries(grouped)) {
        console.log(`\n  ${C.bold}${type.toUpperCase().replace('_', ' ')}S${C.reset}`);
        items.forEach((i) => console.log(`    ${C.red}•${C.reset} ${i}`));
      }
    } else {
      console.log(`  ${C.green}${C.bold}No gaps found — all design elements verified! ✨${C.reset}`);
    }
    console.log();
  }

  return {
    summary,
    integrations: { present: integPresent, total: totalInteg },
    gaps: allGaps,
    classes: classResults,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  // Load UML
  if (!fs.existsSync(UML_FILE)) {
    console.error(`${C.red}ERROR: UML file not found at ${UML_FILE}${C.reset}`);
    console.error('Place HR_UML_Enhanced_v2.json in the same directory as this script.');
    process.exit(1);
  }

  const uml = JSON.parse(fs.readFileSync(UML_FILE, 'utf8'));
  const umlClassNames = new Set(uml.classes.map((c) => c.name));

  // Filter by module if requested
  const classesToCheck = Object.entries(CLASS_MAP).filter(([, def]) => {
    if (!MODULE_FILTER) return true;
    return def.pkg.toLowerCase().includes(MODULE_FILTER);
  });

  // Run class verification
  const classResults = classesToCheck.map(([name, def]) => verifyClass(name, def));

  // Check UML coverage — warn about UML classes not in the map
  const unmapped = [...umlClassNames].filter((n) => !CLASS_MAP[n]);
  if (unmapped.length > 0 && !JSON_OUT) {
    console.log(`\n${C.yellow}⚠ UML classes not yet mapped in this script:${C.reset}`);
    unmapped.forEach((n) => console.log(`  • ${n}`));
    console.log();
  }

  // Run integration checks
  const integResults = INTEGRATIONS.map(verifyIntegration);

  // Print / return
  const report = printReport(classResults, integResults);

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  }
}

main();
