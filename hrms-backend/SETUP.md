# HRMS Backend — Setup & Fix Guide

## Problem Fixed

### Error 1: 94 Prisma Referential Action Errors
**Root cause:** SQL Server forbids multiple cascade paths to the same table.
Because `Employee` is referenced by 30+ models, Prisma's default `onUpdate: Cascade`
creates ambiguous cascade chains (e.g. Employee → PayrollRun through BOTH
`ProcessedBy` and `ApprovedBy` columns simultaneously).

**Fix applied:** Every `@relation` in `prisma/schema.prisma` now explicitly declares:
```prisma
onDelete: NoAction, onUpdate: NoAction
```
This tells SQL Server: "The application layer handles referential integrity —
do not cascade anything automatically." The service layer already enforces
these constraints in code (e.g., checking employee is active before assignment).

### Error 2: @prisma/client did not initialize
**Root cause:** `prisma generate` must be run AFTER `prisma/schema.prisma` is valid.
The 94 validation errors prevented generation.

**Fix:** Run the commands in order (Step 3 below).

---

## Quick Start (Windows)

```cmd
cd hrms-backend

:: Step 1 — Install dependencies
npm install

:: Step 2 — Copy and fill in your .env
copy .env.example .env
:: Edit .env: set DATABASE_URL and JWT_SECRET

:: Step 3 — Generate Prisma Client (MUST come before npm run dev)
npx prisma generate

:: Step 4 — Start the server
npm run dev
```

## DATABASE_URL Format for SQL Server

```
sqlserver://localhost:1433;database=UniversityHRMS;user=sa;password=YourPassword;encrypt=true;trustServerCertificate=true
```

If using Windows Authentication (no password):
```
sqlserver://localhost:1433;database=UniversityHRMS;integratedSecurity=true;trustServerCertificate=true
```

## Verify It Works

```cmd
curl http://localhost:3000/health
```
Expected:
```json
{"status":"ok","service":"University HRMS API","version":"1.0.0"}
```

```cmd
curl http://localhost:3000/api/v1
```
Expected: JSON listing all 5 modules (auth, employees, attendance, leave, payroll)

## Then Test With Postman

1. Open Postman → Import → `tests/postman/HRMS_Complete_Collection.json`
2. Run **Auth → Login** first (saves token automatically)
3. Follow the run order in README.md Section 11
