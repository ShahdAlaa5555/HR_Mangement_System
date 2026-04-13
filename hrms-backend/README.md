# University HRMS — Backend API
### Graduation Thesis | Node.js + Express + Prisma + SQL Server

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Architecture & Design Rationale](#2-architecture--design-rationale)
3. [Project Structure](#3-project-structure)
4. [Database Integration](#4-database-integration)
5. [Module APIs](#5-module-apis)
   - [Auth](#51-authentication-module)
   - [Employee Profile](#52-employee-profile-module)
   - [Time & Attendance](#53-time--attendance-module)
   - [Leave Management](#54-leave-management-module)
   - [Payroll](#55-payroll-module)
6. [Cross-Module Integration](#6-cross-module-integration)
7. [Business Logic Implementation](#7-business-logic-implementation)
8. [Security Design](#8-security-design)
9. [Error Handling Strategy](#9-error-handling-strategy)
10. [Setup & Running](#10-setup--running)
11. [Postman Testing Guide](#11-postman-testing-guide)
12. [Design Assumptions](#12-design-assumptions)

---

## 1. System Overview

The University HRMS Backend is a RESTful API server serving four fully integrated HR modules:

| Module | Purpose | Key Entities |
|--------|---------|-------------|
| Employee Profile | Central employee data store | Employee, Department, Position, WorkLocation |
| Time & Attendance | Clock-in/out, shifts, corrections | AttendanceRecord, Shift, OvertimeRequest |
| Leave Management | Request lifecycle, balances, approvals | LeaveRequest, LeaveBalance, LeaveApproval |
| Payroll | Salary calculation, payslips, bank files | PayrollRun, PayrollEntry, Payslip |

All four modules share:
- A single SQL Server database (35+ tables)
- Centralized JWT authentication
- Unified error response format
- A notification system for all user-facing events
- Audit logging for compliance

---

## 2. Architecture & Design Rationale

### 2.1 Why Node.js + Express?

Node.js was selected for the following reasons:
1. **Non-blocking I/O**: HR APIs are typically I/O-bound (database reads/writes). Node.js's event loop model handles concurrent requests efficiently without the thread overhead of Java/C# servers.
2. **JavaScript across the stack**: When the frontend is also JavaScript/TypeScript (React/Vue), sharing types and data models reduces friction.
3. **Rich ecosystem**: npm packages for JWT (`jsonwebtoken`), validation (`joi`), ORM (`prisma`), and security (`helmet`, `bcryptjs`) are production-grade.
4. **Rapid development**: Express's minimal footprint allows clean, explicit configuration — every middleware choice is deliberate and documented.

### 2.2 Why Prisma over raw SQL or Sequelize?

| Criterion | Raw SQL | Sequelize | Prisma |
|-----------|---------|-----------|--------|
| Type safety | ❌ None | ⚠️ Partial | ✅ Full |
| SQL Server support | ✅ | ✅ | ✅ |
| Query building | Manual | ORM | ORM + raw escape hatch |
| Schema as code | ❌ | ❌ | ✅ |
| Performance | ✅ | ⚠️ | ✅ |
| Boilerplate | ❌ High | ⚠️ Medium | ✅ Low |

Prisma generates a fully typed client from the schema, eliminating an entire class of runtime errors (undefined field access, wrong parameter types). The schema file (`prisma/schema.prisma`) also serves as living documentation of the data model.

### 2.3 Layered Architecture

```
HTTP Request
    ↓
[Router] — validates URL shape, applies middleware
    ↓
[Middleware: auth.js] — verifies JWT, attaches req.user
    ↓
[Middleware: validate.js] — validates request body via Joi schema
    ↓
[Controller] — extracts params, calls service, returns response
    ↓
[Service] — ALL business logic lives here
    ↓
[Prisma Client] — type-safe database access
    ↓
[SQL Server Database]
```

**Why this separation?**
- **Testability**: Services can be unit-tested without an HTTP server
- **Reusability**: Services can be called from cron jobs or admin scripts
- **Maintainability**: Each layer has a single responsibility
- **Thesis clarity**: Examiners can follow the data flow through exactly 4 layers

---

## 3. Project Structure

```
hrms-backend/
├── prisma/
│   └── schema.prisma              # Single source of truth for all DB models
├── src/
│   ├── app.js                     # Express app setup (middleware, routes)
│   ├── server.js                  # HTTP server start + graceful shutdown
│   ├── config/
│   │   ├── database.js            # Prisma singleton client
│   │   └── logger.js              # Winston logging configuration
│   ├── middleware/
│   │   ├── auth.js                # JWT verify + RBAC authorize()
│   │   ├── errorHandler.js        # Global error catcher + Prisma error mapping
│   │   └── validate.js            # Joi schema middleware + response helpers
│   ├── shared/
│   │   ├── constants/index.js     # All system enums (mirrors DB CHECK constraints)
│   │   └── utils/
│   │       ├── date.util.js       # Business day counting, hour calculations
│   │       └── notification.util.js # Central notification creator
│   └── modules/
│       ├── auth/                  # Login, token refresh, password change
│       ├── employee/              # Profile, departments, positions, salary
│       ├── attendance/            # Clock-in/out, corrections, overtime, shifts
│       ├── leave/                 # Requests, balances, approvals, holidays
│       └── payroll/               # Runs, calculator engine, payslips, bank files
│           └── services/
│               ├── payroll.service.js    # Orchestration (run lifecycle)
│               └── payroll.calculator.js # Egyptian tax + SI calculation engine
├── tests/
│   └── postman/
│       └── HRMS_Complete_Collection.json # Import into Postman to test all APIs
├── uploads/                       # File attachments (leave documents, photos)
├── logs/                          # Winston log files
├── .env.example                   # Environment template (copy to .env)
└── package.json
```

### Layer-by-Layer Explanation

| Layer | Files | Responsibility |
|-------|-------|---------------|
| **Router** | `routes/*.routes.js` | URL mapping, middleware application, role guards |
| **Controller** | `controllers/*.controller.js` | Request parsing, response formatting |
| **Service** | `services/*.service.js` | Business rules, validations, DB orchestration |
| **Calculator** | `payroll.calculator.js` | Pure calculation functions (tax, SI, overtime) |
| **Utility** | `shared/utils/` | Date math, notification creation |
| **Middleware** | `middleware/` | Cross-cutting: auth, validation, errors |

---

## 4. Database Integration

### 4.1 Connection

The connection string is defined in `.env`:
```
DATABASE_URL="sqlserver://HOST:1433;database=UniversityHRMS;user=sa;password=Pass;encrypt=true;trustServerCertificate=true"
```

Prisma manages a connection pool automatically. The pool size defaults to `min: 2, max: 10` for the SQL Server connector.

### 4.2 Key Relationships (as implemented in Prisma)

```
Employee ────────┬──→ Department (ManyToOne)
                 ├──→ Position  (ManyToOne)
                 ├──→ WorkLocation (ManyToOne)
                 ├──→ Employee [SupervisorID] (Self-reference)
                 ├──→ AttendanceRecord (OneToMany)
                 ├──→ LeaveRequest (OneToMany)
                 ├──→ LeaveBalance (OneToMany per LeaveType)
                 ├──→ PayrollEntry (OneToMany)
                 └──→ Payslip (OneToMany)

LeaveRequest ────┬──→ LeaveType
                 ├──→ LeaveApproval (OneToMany, one per approval step)
                 └──→ AttendanceRecord [LeaveRequestID] (cross-module link)

PayrollEntry ────┬──→ PayrollRun
                 ├──→ AttendanceSummary (cross-module link)
                 └──→ PayrollEntryLine (OneToMany, itemized pay/deductions)
```

### 4.3 Cross-Module Database Links

These foreign keys are the technical implementation of the business integration rules:

| FK | From | To | Purpose |
|----|------|----|---------|
| `LeaveRequestID` | `AttendanceRecord` | `LeaveRequest` | Approved leave overrides attendance status |
| `AttendanceSummaryID` | `PayrollEntry` | `AttendanceSummary` | Payroll reads attendance data |
| `LeaveRequestID` → Attendance | When leave approved | Marks dates as `OnLeave` | Prevents double-counting as absent |

---

## 5. Module APIs

### 5.1 Authentication Module

**Base URL**: `/api/v1/auth`

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/login` | Public | Authenticate with email + password |
| POST | `/refresh` | Public | Exchange refresh token for new access token |
| GET | `/me` | Required | Get current user info from token |
| POST | `/change-password` | Required | Change own password |

**Login Request:**
```json
POST /api/v1/auth/login
{
  "email": "sarah.johnson@university.edu",
  "password": "HRMSPass123!"
}
```

**Login Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "tokenType": "Bearer",
    "expiresIn": "8h",
    "employee": {
      "id": 1,
      "code": "EMP001",
      "name": "Sarah Johnson",
      "email": "sarah.johnson@university.edu",
      "role": "HR",
      "department": "Computer Science",
      "position": "Associate Professor"
    }
  }
}
```

**Role Resolution Logic:**
The system derives roles from Position titles at login time:
- `"Admin"` / `"System"` in title → Role: `Admin`
- `"HR"` / `"Human Resource"` in title → Role: `HR`
- `"Payroll"` / `"Compensation"` in title → Role: `Payroll`
- `"Manager"` / `"Director"` / `"Head"` / `"Dean"` → Role: `Manager`
- Anything else → Role: `Employee`

---

### 5.2 Employee Profile Module

**Base URL**: `/api/v1/employees`

| Method | Route | Role | Description |
|--------|-------|------|-------------|
| GET | `/me` | Any | Get own profile (Image 1 — Self-Service) |
| GET | `/` | Manager+ | List all employees with search/filter |
| POST | `/` | HR/Admin | Create new employee |
| GET | `/:id` | Self or Manager+ | Get employee details |
| PATCH | `/:id` | HR/Admin | Update employee fields |
| POST | `/:id/terminate` | HR/Admin | Terminate employee |
| GET | `/:id/org-chart` | Any | Get reporting hierarchy |
| POST | `/:id/change-requests` | Self | Submit field change request (Edit Request button) |
| GET | `/me/change-requests` | Any | My pending change requests |
| PATCH | `/change-requests/:id` | HR/Admin | Review/approve change request |
| GET | `/:id/salary` | HR/Payroll | Salary history |
| POST | `/:id/salary` | HR/Payroll | Set new salary record |
| GET | `/:id/audit` | HR/Admin | Full audit trail |
| GET | `/departments` | Any | List departments |
| POST | `/departments` | HR/Admin | Create department |
| GET | `/positions` | Any | List positions |
| GET | `/work-locations` | Any | List work locations |

**Employee Profile Response** (matching Image 1):
```json
{
  "success": true,
  "data": {
    "EmployeeID": 1,
    "EmployeeCode": "EMP001",
    "FullName": "Sarah Johnson",
    "DateOfBirth": "1985-03-15",
    "Gender": "Female",
    "Nationality": "American",
    "MaritalStatus": "Married",
    "Email": "sarah.johnson@university.edu",
    "Phone": "+1-555-0123",
    "Bio": "Associate Professor specializing in Machine Learning and AI research.",
    "PhotoURL": "/uploads/emp001.jpg",
    "StartDate": "2020-08-01",
    "EmploymentType": "Full-Time",
    "CurrentStatus": "Active",
    "Department": { "DepartmentName": "Computer Science" },
    "Position": { "PositionTitle": "Associate Professor" },
    "WorkLocation": { "LocationName": "Campus" },
    "Supervisor": { "EmployeeID": 5, "FullName": "Dr. Robert Wilson" }
  }
}
```

**EmployeeChangeRequest Business Rule:**
When an employee clicks "Edit Request" in the UI (Image 1), a `POST /employees/:id/change-requests` is called. This creates a pending record in `EmployeeChangeRequest` without modifying the employee directly. An HR admin reviews and approves it via `PATCH /employees/change-requests/:id`. On approval, the employee record is automatically updated and an audit log entry is created.

---

### 5.3 Time & Attendance Module

**Base URL**: `/api/v1/attendance`

| Method | Route | Role | Description |
|--------|-------|------|-------------|
| GET | `/dashboard/kpis` | Any | This week hours, on-time rate, pending, days to payroll |
| GET | `/dashboard/today` | Any | Current shift, check-in/out times, status |
| GET | `/dashboard/recent-activity` | Any | Last N attendance records for activity feed |
| POST | `/check-in` | Any | Clock In (Image 2 — Quick Action) |
| POST | `/check-out` | Any | Clock Out |
| GET | `/calendar/me` | Any | Monthly attendance calendar |
| GET | `/` | Manager+ | List all attendance records (filterable) |
| POST | `/manual` | HR/Admin | Create manual attendance record |
| POST | `/:id/corrections` | Any | Submit correction request (Image 2 button) |
| GET | `/corrections` | Manager+ | List pending corrections (Manager Inbox) |
| PATCH | `/corrections/:id` | Manager+ | Approve/reject correction |
| POST | `/overtime` | Manager+ | Submit overtime request |
| PATCH | `/overtime/:id/decision` | Manager+ | Approve/reject overtime |
| GET | `/shifts` | Any | List active shifts |
| POST | `/shifts/assign` | HR/Admin | Assign shift to employee |
| GET | `/summary/me` | Any | Monthly attendance summary |
| GET | `/summary/:id` | Manager+ | Any employee's monthly summary |
| POST | `/summary/:id/:year/:month/generate` | HR/Payroll | Force-generate summary |

**KPI Dashboard Response** (matching Image 2):
```json
{
  "success": true,
  "data": {
    "thisWeekHours": 38.5,
    "onTimeRate": 94,
    "pendingRequests": 2,
    "daysToPayroll": 3
  }
}
```

**Today Status Response** (Current Status card — Image 2):
```json
{
  "success": true,
  "data": {
    "currentStatus": "Clocked Out",
    "checkInTime": null,
    "checkOutTime": null,
    "workedHours": 0,
    "todayShift": {
      "shiftName": "Core Hours",
      "startTime": "9:00 AM",
      "endTime": "5:00 PM",
      "expectedHours": 8,
      "nextBreak": { "time": "12:00 PM", "durationMin": 60 }
    }
  }
}
```

**Check-In Business Logic:**
1. Validate employee is active
2. Reject if already checked in today
3. Find active `EmployeeShiftAssignment` for today
4. Calculate `LatenessMinutes = max(0, actualCheckin - shiftStart)`
5. Create/update `AttendanceRecord` with Status=`Present`
6. Send in-app notification

**Overtime Cap (Egyptian Labor Law)**:
Per Article 130 of Egyptian Labor Law No. 12/2003, overtime is capped at 2 hours/day. Any `OvertimeRequest.EstimatedHours > 2` fails Joi validation with a law-specific error message.

---

### 5.4 Leave Management Module

**Base URL**: `/api/v1/leave`

| Method | Route | Role | Description |
|--------|-------|------|-------------|
| GET | `/balances/me` | Any | Leave balance dashboard (Image 4 cards) |
| GET | `/balances/:id` | Manager+ | Any employee's balances |
| POST | `/balances/initialize` | HR/Admin | Initialize balances for new year |
| POST | `/balances/adjust` | HR/Admin | Manual balance adjustment |
| POST | `/requests` | Any | Submit leave request |
| GET | `/requests/me` | Any | My leave history (Leave History tab) |
| GET | `/requests/manager-inbox` | Manager+ | Pending approval requests |
| GET | `/requests` | HR/Admin | All requests with filters |
| GET | `/requests/:id` | Self or Manager+ | Request details + approval trail |
| POST | `/requests/:id/approve` | Manager/HR | Approve/Reject/Delegate |
| POST | `/requests/:id/cancel` | Self | Cancel own pending request |
| GET | `/types` | Any | List leave types |
| POST | `/types` | HR/Admin | Create leave type |
| GET | `/policies` | HR/Admin | List leave policies |
| POST | `/policies` | HR/Admin | Create leave policy |
| GET | `/holidays` | Any | Holiday calendar |
| POST | `/holidays` | HR/Admin | Add holiday |
| GET | `/analytics` | HR/Admin | Leave trends and statistics |

**Leave Balance Dashboard Response** (matching Image 4):
```json
{
  "success": true,
  "data": {
    "year": 2025,
    "balances": [
      {
        "leaveTypeId": 1,
        "leaveTypeName": "Annual",
        "displayColor": "#3B82F6",
        "entitledDays": 25,
        "usedDays": 8,
        "pendingDays": 0,
        "carryOverDays": 0,
        "remainingDays": 17,
        "progressPercent": 68
      },
      {
        "leaveTypeId": 2,
        "leaveTypeName": "Sick/Medical",
        "entitledDays": 15,
        "usedDays": 3,
        "pendingDays": 0,
        "remainingDays": 12
      }
    ],
    "upcomingLeaves": [],
    "pendingRequests": [
      {
        "LeaveRequestID": 5,
        "leaveTypeName": "Annual",
        "StartDate": "2025-02-15",
        "EndDate": "2025-02-20",
        "TotalDays": 5,
        "Status": "PendingManager",
        "statusLabel": "Pending Manager Approval"
      }
    ]
  }
}
```

**Multi-Level Approval Workflow:**

```
Employee submits → Status: "PendingManager"
  ↓
Manager approves → System checks ApprovalStep table
  ↓
  If next step is HR → Status: "PendingHR"
    ↓
    HR approves → Status: "Approved"
      ↓
      [INTEGRATION]: LeaveBalance.UsedDays += TotalDays
      [INTEGRATION]: AttendanceRecord rows marked "OnLeave"
      [NOTIFICATION]: Employee + Manager notified
  ↓
  If no HR step → Status: "Approved" immediately
  ↓
  If rejected at any step → Status: "Rejected"
    ↓
    [INTEGRATION]: LeaveBalance.PendingDays -= TotalDays (returned)
```

**Validation Rules Applied on Submission:**
1. `EndDate >= StartDate` (Joi schema)
2. `TotalDays <= RemainingDays` (service layer — returns `INSUFFICIENT_BALANCE`)
3. `MinTenureMonths` satisfied (LeavePolicy check)
4. `NoticePeriodDays` satisfied (StartDate - today >= policy requirement)
5. No overlapping approved leave requests for same employee
6. `IsHalfDay` only allowed if `LeavePolicy.AllowHalfDay = true`
7. Doctor's approval required for sick leave > X days (from ApprovalStep config)

---

### 5.5 Payroll Module

**Base URL**: `/api/v1/payroll`

| Method | Route | Role | Description |
|--------|-------|------|-------------|
| GET | `/dashboard` | Payroll+ | Stats cards + recent activity (Image 3) |
| GET | `/pay-grades` | Any | List pay grades |
| POST | `/pay-grades` | HR/Payroll | Create pay grade |
| GET | `/pay-types` | Any | List pay types (Earnings/Deductions) |
| POST | `/pay-types` | HR/Payroll | Create pay type |
| GET | `/overtime-rules` | Any | List overtime multiplier rules |
| GET | `/allowances` | Any | List allowances |
| GET | `/shift-differentials` | Any | List shift differentials |
| GET | `/policies` | Payroll+ | List payroll policies |
| POST | `/policies` | Payroll+ | Create payroll policy |
| GET | `/runs` | Payroll+ | List all payroll runs |
| POST | `/runs` | Payroll+ | Create new payroll run |
| GET | `/runs/:id` | Payroll+ | Run details + all entries |
| POST | `/runs/:id/process` | Payroll+ | Calculate salaries for all employees |
| POST | `/runs/:id/approve` | HR/Admin | Approve run → PendingApproval → Approved |
| POST | `/runs/:id/finalize` | Payroll+ | Finalize → lock entries |
| POST | `/runs/:id/payslips` | Payroll+ | Generate payslip documents |
| GET | `/payslips/me` | Any | My payslips (Employee Portal) |
| GET | `/payslips/:id` | Self or Payroll+ | View payslip details |
| GET | `/exceptions` | Payroll+ | List payroll exceptions |
| PATCH | `/exceptions/:id/resolve` | Payroll+ | Resolve/waive exception |
| POST | `/runs/:id/bank-file` | Payroll+ | Generate bank transfer file |

**Payroll Dashboard Response** (matching Image 3):
```json
{
  "success": true,
  "data": {
    "totalPayrollRuns": 3,
    "activeExceptions": 2,
    "totalPayrollValue": 609000.00,
    "totalEmployees": 3,
    "recentActivity": [
      { "type": "PayrollRun", "description": "Draft — 2025-03", "by": "Sarah Johnson", "at": "2025-03-20T..." },
      { "type": "PolicyApproved", "description": "Policy Approved", "by": "Michael Chen", "at": "..." }
    ]
  }
}
```

**Payroll Run Lifecycle:**
```
Create (Draft) → Process (Processing → PendingApproval) → Approve (Approved)
→ Finalize (Finalized) → Generate Payslips → Generate Bank File → Paid
```

---

## 6. Cross-Module Integration

This is the most architecturally significant aspect of the system.

### 6.1 Leave → Attendance Integration

**Trigger**: Leave request reaches `Approved` status  
**Mechanism**: `leave.service.js::processApproval()` calls `attendance.service.js::markAttendanceAsOnLeave()`  
**Effect**: For each calendar day in `[LeaveRequest.StartDate, LeaveRequest.EndDate]`:
- If an `AttendanceRecord` exists for that day → UPDATE `Status = 'OnLeave'`, `LeaveRequestID = leaveRequestId`
- If no record exists → CREATE a new one with `Status = 'OnLeave'`
- This prevents the Payroll module from counting these days as absent (unpaid)

### 6.2 Attendance → Payroll Integration

**Trigger**: Payroll run is processed (`POST /payroll/runs/:id/process`)  
**Mechanism**: For each employee:
1. Call `attendance.service.js::generateAttendanceSummary(employeeId, year, month)`
2. Return `AttendanceSummary` with: PresentDays, AbsentDays, LeaveDays, TotalOvertimeHrs
3. `payroll.calculator.js` uses this to compute:
   - `AbsenceDeduction = DailyRate × AbsentDays`
   - `OvertimePay = HourlyRate × OvertimeHours × Multiplier`
4. `PayrollEntry.AttendanceSummaryID` links to the summary for traceability

### 6.3 Leave → Payroll Integration (Paid vs Unpaid)

**Mechanism**: When computing payroll, the calculator checks the leave balance for the period:
- If `LeaveType.IsPaid = true` → No deduction (employee gets full pay for leave days)
- If `LeaveType.IsPaid = false` → `UnpaidLeaveDeduction = DailyRate × UnpaidLeaveDays`
- Sick leave with tier system: first N months at 100%, then reduced (via `SickLeaveTier` table)

### 6.4 Notification Flow (all modules)

Every significant action triggers `notification.util.js::notify()`:
- Leave submitted → notify employee (confirmation) + notify approver
- Leave approved/rejected → notify employee
- Correction approved → notify employee  
- Payslip generated → notify employee
- Exception raised → notify payroll team

All notifications persist in the `Notification` table and are retrieved via `GET /employees/me/notifications`.

---

## 7. Business Logic Implementation

### 7.1 Egyptian Income Tax Calculation (2025)

The tax engine in `payroll.calculator.js::calculateAnnualIncomeTax()` implements progressive taxation:

```
Annual Taxable Income = (GrossMonthly × 12) - PersonalExemption(20,000)

Bracket 1: 0 – 15,000           → 0%
Bracket 2: 15,001 – 30,000      → 2.5%
Bracket 3: 30,001 – 45,000      → 10%
Bracket 4: 45,001 – 60,000      → 15%
Bracket 5: 60,001 – 200,000     → 20%
Bracket 6: 200,001 – 400,000    → 25%
Bracket 7: 400,001+              → 27.5%

Monthly Tax = AnnualTax / 12
```

Tax brackets are stored in the `TaxBracket` table (seeded in the schema), making them updatable without code changes when tax laws change.

### 7.2 Social Insurance (Law No. 148/2019)

```
SI Wage = min(BaseSalary + Allowances, SI_CEILING)
Employee Contribution = SI_Wage × 7.25%
Employer Contribution = SI_Wage × 18.75%
Total SI = SI_Wage × 26%

Net Pay = GrossIncome - Employee_SI - Income_Tax
```

Configuration is stored in `SocialInsuranceConfig` table (effective date versioned).

### 7.3 Overtime Pay Rules

```
DailyRate = BaseSalary / WorkingDaysInMonth
HourlyRate = DailyRate / ShiftExpectedHours

OvertimePay = HourlyRate × OvertimeHours × Multiplier

Normal OT (weekday):  Multiplier = 1.35 (35% premium)
Holiday/Rest day OT:  Multiplier = 2.00 (100% premium)
Nighttime OT:         Multiplier as configured in OvertimeRule table
Max per day:          2 hours (enforced at request + calculation time)
```

### 7.4 Absence Deduction

```
WorkingDaysInMonth = calendar days - weekends - holidays
DailyRate = BaseSalary / WorkingDaysInMonth
AbsenceDeduction = DailyRate × min(AbsentDays, MaxMonthlyDeductionDays)

MaxMonthlyDeductionDays = 5 (configured in PayrollPolicy)
```

The cap prevents over-deduction for extended absences and is configurable per payroll policy.

---

## 8. Security Design

| Measure | Implementation | Purpose |
|---------|---------------|---------|
| JWT Authentication | `jsonwebtoken` with HS256 | Stateless session management |
| Password Hashing | `bcryptjs` (cost factor 12) | Prevents plaintext password storage |
| Role-Based Access | `authorize(...roles)` middleware | Enforces least-privilege principle |
| Rate Limiting | `express-rate-limit` (10 login/15min) | Prevents brute-force attacks |
| HTTP Security Headers | `helmet` | Prevents XSS, clickjacking, MIME sniffing |
| CORS | Explicit `ALLOWED_ORIGINS` list | Prevents unauthorized cross-origin requests |
| Input Validation | `joi` schemas on every endpoint | Prevents injection and malformed data |
| Prisma Parameterized Queries | Built-in | Prevents SQL injection |
| Audit Logging | `EmployeeAuditLog` table | Compliance and forensic capability |
| Sensitive Data Masking | Stack traces hidden in production | Prevents information leakage |

---

## 9. Error Handling Strategy

All errors return a consistent JSON envelope:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": [
      { "field": "StartDate", "message": "StartDate cannot be in the past" }
    ]
  }
}
```

**Error Code Reference:**

| HTTP Status | Code | Cause |
|-------------|------|-------|
| 400 | `VALIDATION_ERROR` | Joi schema failed |
| 400 | `INSUFFICIENT_BALANCE` | Not enough leave days |
| 400 | `ALREADY_CHECKED_IN` | Duplicate check-in |
| 400 | `OVERTIME_LIMIT_EXCEEDED` | > 2 hours OT requested |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password |
| 401 | `TOKEN_EXPIRED` | JWT expired |
| 403 | `FORBIDDEN` | Insufficient role |
| 404 | `NOT_FOUND` | Record doesn't exist |
| 409 | `DUPLICATE_ENTRY` | Unique constraint violation |
| 422 | `VALIDATION_ERROR` | Input schema failed (with field details) |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

Prisma error codes are automatically translated:
- `P2002` (unique constraint) → 409 DUPLICATE_ENTRY
- `P2025` (record not found) → 404 NOT_FOUND
- `P2003` (foreign key) → 400 FOREIGN_KEY_ERROR

---

## 10. Setup & Running

### Prerequisites
- Node.js ≥ 18.0.0
- SQL Server 2019+ (or Azure SQL)
- npm ≥ 9.0.0

### Step 1: Install Dependencies
```bash
cd hrms-backend
npm install
```

### Step 2: Configure Environment
```bash
cp .env.example .env
# Edit .env — set DATABASE_URL and JWT_SECRET
```

### Step 3: Run the Database Schema
Execute the provided SQL script in SQL Server Management Studio or via sqlcmd:
```bash
sqlcmd -S localhost -U sa -P YourPassword -i schema.sql
```

### Step 4: Generate Prisma Client
```bash
npx prisma generate
# This reads prisma/schema.prisma and generates the typed client
```

### Step 5: Start the Server
```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

### Step 6: Verify
```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","service":"University HRMS API",...}

curl http://localhost:3000/api/v1
# Expected: API module index
```

---

## 11. Postman Testing Guide

### Import Collection
1. Open Postman → Import → Upload `tests/postman/HRMS_Complete_Collection.json`
2. The collection has pre-configured variables: `{{baseUrl}}`, `{{token}}`, `{{employeeId}}`

### Run Order (Critical)
Run requests in this order to avoid dependency failures:

```
Step 1: Auth → Login
  └─ Saves token to {{token}} automatically via test script

Step 2: Employee → Create Employee  
  └─ Saves {{employeeId}} for subsequent requests

Step 3: Attendance → Clock In → Clock Out
  └─ Saves {{attendanceId}}

Step 4: Attendance → Submit Correction Request
  └─ Saves {{correctionId}}

Step 5: Leave → Submit Leave Request
  └─ Saves {{leaveRequestId}}

Step 6: Leave → Approve Leave (Manager step)

Step 7: Payroll → Create Payroll Run
  └─ Saves {{payrollRunId}}

Step 8: Payroll → Process Payroll Run

Step 9: Payroll → Approve → Finalize → Generate Payslips
```

### Test Scenarios Included

**Success Scenarios** (expect HTTP 200/201):
- Employee login and profile retrieval
- Full clock-in/clock-out cycle
- Leave request submission and approval
- Complete payroll run from Draft to Paid

**Failure Scenarios** (expect HTTP 4xx):
- Login with wrong password → 401 INVALID_CREDENTIALS
- Create employee with duplicate email → 409 DUPLICATE_ENTRY
- Clock in twice → 400 ALREADY_CHECKED_IN
- Submit overtime > 2 hours → 422 (labor law)
- Submit leave without enough balance → 400 INSUFFICIENT_BALANCE
- Submit correction without reason → 422 VALIDATION_ERROR
- Adjust balance without reason → 422 VALIDATION_ERROR
- Access protected route without token → 401 UNAUTHORIZED

---

## 12. Design Assumptions

The following assumptions were made where the requirements or schema were ambiguous:

| # | Assumption | Justification |
|---|-----------|---------------|
| 1 | Egyptian work week is Sun–Thu | Standard in Egypt; `countEgyptianBusinessDays()` skips Fri/Sat |
| 2 | Default password `HRMSPass123!` for all demo users | Thesis prototype — production would use UserCredential table |
| 3 | Role derived from Position title string matching | Thesis simplification; production uses UserRole table |
| 4 | Social Insurance ceiling not explicitly modeled | The `SocialInsuranceConfig` stores rates; ceiling can be added as a column |
| 5 | Payslip `DocumentURL` is a file path placeholder | Full PDF generation would use a library like `pdfkit`; out of scope for thesis |
| 6 | Bank file is a JSON structure, not a real bank format | Real format (ACH, IBAN transfer) is bank-specific; structure is demonstrated |
| 7 | `HalfDay = 0.5 days` in balance calculations | Standard HR practice; configurable via LeavePolicy |
| 8 | AttendanceSummary auto-generated on first access | Prevents manual trigger requirement; idempotent operation |
| 9 | Notifications are InApp only (email stubbed) | Email service integration (SMTP/SendGrid) is a production extension |
| 10 | No multi-currency conversion | CurrencyCode stored but conversion rates out of scope |
