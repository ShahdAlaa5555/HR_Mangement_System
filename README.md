# University HRMS
### From Architecture to Prototype: AI-based Code Generation from HR Management System Module Descriptions
**Bachelor Thesis — German University in Cairo  
Faculty of Media Engineering and Technology**

---

## Overview

A fully functional Human Resources Management System (HRMS) built as part of a
bachelor thesis investigating AI-assisted software development. All implementation
code is LLM-generated — no manual code authorship. Human effort is directed at
architectural planning, prompt engineering, and iterative refinement.

The system covers four integrated HR modules:

| Module | Description |
|---|---|
| Employee Profile Management | Central employee data, contracts, documents, org hierarchy |
| Time & Attendance Management | Clock-in/out, shifts, overtime, corrections |
| Payroll Management | Salary calculation, Egyptian tax engine, payslips |
| Leave Management | Request lifecycle, balances, multi-level approvals |

---

## Live System

| Tier | Platform | URL |
|---|---|---|
| Frontend | Vercel | https://university-hr-system.vercel.app |
| Backend API | Railway | Configured as environment variable in frontend |
| Database | Microsoft Azure SQL Server | — |

---

## Repository Structure

```
/
├── hrms-backend/       # Node.js + Express + Prisma + SQL Server
│   └── README.md       # Full backend setup, API reference, business logic
├── hrms-frontend/      # React.js frontend
│   └── README.md       # Full frontend setup, design decisions, API mapping
```

---

## Thesis Context

| Item | Detail |
|---|---|
| Primary code generator | Claude 3.5 Sonnet (Anthropic) |
| Independent reviewer | Gemini 1.5 Pro (Google) |
| Generation approach | Single PT-1 invocation for full backend; PT-4 for frontend |
| Round 1 results | 93.8% — 166/177 tests passing (initial generation, no refinement) |
| Round 2 results | 98.1% — 205/209 tests passing (post-refinement) |
| Final result | 100% — 209/209 tests passing (after return-object correction) |
| Structural conformance | 40/40 UML-specified entities fully generated |
| Prompt templates | PT-1 (backend generation), PT-2 (independent review), PT-3 (targeted debugging), PT-4 (frontend generation) |

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React.js | 18.2 |
| Backend | Node.js + Express.js | 20.11 / 4.18 |
| ORM | Prisma | 5.10 |
| Database | Microsoft SQL Server | 2022 |
| Authentication | JWT (jsonwebtoken) | 9.0 |
| Testing | Jest + supertest | 29.7 / 6.3 |
| Deployment | Vercel + Railway + Azure | — |

---

## Quick Start

See the individual READMEs for full setup instructions:
- Backend: [`/hrms-backend/README.md`](./hrms-backend/README.md)
- Frontend: [`/hrms-frontend/README.md`](./hrms-frontend/README.md)
