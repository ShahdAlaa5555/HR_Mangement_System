# University HRMS — Frontend

> A modern, production-grade Human Resources Management System frontend built with React.

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 16
- The backend running at `http://localhost:3000`

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set REACT_APP_API_URL=http://localhost:3000/api/v1

# 3. Start development server
npm start
# → Opens at http://localhost:3000 (or port 3001 if backend is on 3000)
```

### Build for Production
```bash
npm run build
# Output is in /build — deploy to any static host (Nginx, Vercel, Netlify)
```

---

## 📁 Project Structure

```
src/
├── api/
│   ├── axios.js          # Axios instance + JWT interceptor + auto-refresh
│   └── services.js       # All API calls grouped by module (auth, employee, leave, payroll, attendance)
│
├── components/
│   ├── common/
│   │   └── index.js      # Reusable: Modal, Badge, Spinner, Skeleton, EmptyState, StatCard, ConfirmDialog
│   └── layout/
│       ├── AppShell.js   # Wraps Sidebar + Header + page content
│       ├── Header.js     # Top bar with search, notifications, user menu
│       └── Sidebar.js    # Collapsible nav with role-aware links
│
├── context/
│   └── AuthContext.js    # Global auth state: login, logout, changePassword, user
│
├── hooks/
│   └── useFetch.js       # useFetch, useDebounce, useLocalStorage
│
├── pages/
│   ├── Auth/
│   │   └── LoginPage.js
│   ├── Dashboard/
│   │   └── DashboardPage.js
│   ├── Employee/
│   │   ├── EmployeePage.js   # Full CRUD list/create/edit/terminate
│   │   └── ProfilePage.js    # Self-service profile + change request
│   ├── Attendance/
│   │   └── AttendancePage.js # Clock in/out, calendar, summary, corrections
│   ├── Leave/
│   │   └── LeavePage.js      # Balances, request form, history, inbox, analytics
│   ├── Payroll/
│   │   └── PayrollPage.js    # Dashboard, runs, payslips, exceptions
│   └── Settings/
│       └── SettingsPage.js   # Password, notifications, appearance
│
├── utils/
│   └── helpers.js        # formatCurrency, formatDate, getInitials, extractError…
│
├── App.js                # Router, toaster, AuthProvider
├── index.js              # React root
└── index.css             # Full design system (CSS variables, components, layout)
```

---

## 🎨 Design Decisions

### Theme & Aesthetic
- **Dark navy + gold accent** — chosen for a professional, institutional feel appropriate for a university HR system. The palette (`#0d1117` base, `#f0b429` gold) conveys authority and warmth.
- **Typography**: *Syne* (display/headings, geometric and distinctive) + *DM Sans* (body, highly readable) — deliberately avoiding generic Inter/Roboto.
- **CSS Variables** — every color, spacing, shadow, and radius is a variable, making future re-theming trivial.
- **No Tailwind, no MUI** — hand-crafted utility classes give full control and a smaller bundle.

### Layout
- **Collapsible sidebar** — preserves screen space on smaller monitors while keeping navigation accessible.
- **AppShell pattern** — single layout wrapper so navigation state, header, and content area are coordinated without prop drilling.
- **Grid system** — responsive `grid-4 → grid-2 → grid-1` breakpoint cascade for KPI cards.

### UX Improvements over Original Screenshot
| Original | Improved |
|---|---|
| Plain white background | Dark-themed, high-contrast, easier on eyes |
| Simple blue progress bars | Color-coded per leave type (blue=annual, green=sick, red=emergency) |
| Static alerts | `react-hot-toast` non-blocking toast notifications |
| No loading states | Skeleton loaders for every async section |
| Basic status text | Pill-shaped badges with semantic color coding |
| No feedback on submit | Inline spinners on buttons; success/error toasts |
| Flat list of requests | Tabbed interface (Dashboard / Request / History / Inbox) |
| Manual page refresh | Real-time state update after every action |
| No form validation | Client-side validation with field-level error messages |
| No empty states | Illustrated empty state components |
| No clock | Live digital clock on Attendance page |

---

## 🔌 API Integration

### Authentication Flow
1. `POST /auth/login` → stores `accessToken` + `refreshToken` in `localStorage`
2. Every request: Axios interceptor attaches `Authorization: Bearer <token>`
3. On 401: interceptor calls `POST /auth/refresh` → swaps tokens → retries original request
4. Logout clears `localStorage` and redirects to `/login`

### Module → API Mapping

| Module | Key Endpoints Used |
|---|---|
| Dashboard | `GET /attendance/dashboard/kpis`, `/attendance/dashboard/today`, `/leave/my/balances`, `/payroll/dashboard` |
| Employees | `GET /employees`, `POST /employees`, `PATCH /employees/:id`, `POST /employees/:id/terminate` |
| Attendance | `GET /attendance/dashboard/today`, `POST /attendance/check-in`, `POST /attendance/check-out`, `GET /attendance/calendar/me`, `GET /attendance/summary/me` |
| Leave | `GET /leave/my/balances`, `GET /leave/my/requests`, `POST /leave/requests`, `GET /leave/inbox`, `PATCH /leave/requests/:id/approve` |
| Payroll | `GET /payroll/dashboard`, `GET /payroll/runs`, `POST /payroll/runs`, `POST /payroll/runs/:id/process`, `GET /payroll/payslips/me` |
| Profile | `GET /employees/me`, `POST /employees/:id/change-requests`, `POST /auth/change-password` |

### Error Handling Strategy
- All API calls are wrapped in `try/catch`
- `extractError(err)` utility normalises Axios error shapes into a user-readable string
- Errors surface as toast notifications (never blocking alerts)
- 401 responses trigger automatic token refresh (transparent to user)
- Network failures show a descriptive toast with retry option

---

## ⚙️ State Management

| Concern | Solution |
|---|---|
| Auth/user session | React Context (`AuthContext`) |
| Page-level data | `useState` + `useEffect` in each page component |
| Shared lookups (depts, positions) | Fetched once per page mount |
| Form state | Local `useState` per form |
| Optimistic updates | State updated immediately; API call in background |
| Loading / skeleton | Per-request boolean flags |

No Redux / Zustand needed — the app complexity is well-served by Context + local state.

---

## 🔒 Role-Based Access

The frontend reads `user.role` from the JWT payload (via `GET /auth/me`) and conditionally renders:

| Role | Extra UI |
|---|---|
| Employee | My profile, leave request, personal payslips, own attendance |
| Manager | Leave inbox (approve/reject), attendance correction review |
| HR / Admin | All of the above + employee CRUD, payroll runs, balance management |
| Payroll | Payroll runs, exceptions, bank file generation |

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `react-router-dom` | Client-side routing |
| `axios` | HTTP client + interceptors |
| `react-hot-toast` | Non-blocking toast notifications |
| `recharts` | Bar/Line charts (leave balances, payroll trends) |
| `lucide-react` | Icon library (consistent stroke-based icons) |
| `date-fns` | Date utilities |

---

## 🧪 Thesis Notes

### Why React?
- Component model maps directly to UI modules (Employee, Leave, Payroll, Attendance)
- Hooks (`useState`, `useEffect`, `useCallback`) provide fine-grained reactivity without a heavy framework
- Large ecosystem; industry-standard choice for HR portals

### Why no Redux?
For a CRUD-heavy system with modular pages and no shared mutable state between unrelated modules, React Context + local state is simpler, more readable, and easier to maintain in a thesis project.

### Accessibility Considerations
- Semantic HTML (`<table>`, `<nav>`, `<header>`, `<main>`, `role="dialog"`)
- Keyboard-navigable modals (Escape closes, focus trap on modal open)
- `aria-label` on icon-only buttons
- Color is never the **only** indicator — badges use both color and text

### Performance
- Lazy loading can be added with `React.lazy` + `Suspense` per route
- Skeleton loaders prevent layout shift during data fetching
- `useCallback` prevents unnecessary re-renders on filter/search changes
