// src/App.js
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './components/layout/AppShell';

// Pages
import LoginPage       from './pages/Auth/LoginPage';
import DashboardPage   from './pages/Dashboard/DashboardPage';
import EmployeePage    from './pages/Employee/EmployeePage';
import ProfilePage     from './pages/Employee/ProfilePage';
import AttendancePage  from './pages/Attendance/AttendancePage';
import LeavePage       from './pages/Leave/LeavePage';
import PayrollPage     from './pages/Payroll/PayrollPage';
import SettingsPage    from './pages/Settings/SettingsPage';
import AttendanceCalendarPage  from './pages/Attendance/AttendanceCalendarPage';
import ShiftsPage              from './pages/Attendance/ShiftsPage';
import AttendanceInboxPage     from './pages/Attendance/AttendanceInboxPage';
import AttendanceReportsPage   from './pages/Attendance/AttendanceReportsPage';
import HolidaysPage            from './pages/Attendance/HolidaysPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)' }}>
      <div className="spinner spinner-lg" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell>
              <Routes>
                <Route path="/dashboard"  element={<DashboardPage  />} />
                <Route path="/employees"  element={<EmployeePage   />} />
                <Route path="/profile"    element={<ProfilePage    />} />
                <Route path="/attendance"              element={<AttendancePage />} />
                <Route path="/attendance/calendar"    element={<AttendanceCalendarPage />} />
                <Route path="/attendance/shifts"      element={<ShiftsPage />} />
                <Route path="/attendance/inbox"       element={<AttendanceInboxPage />} />
                <Route path="/attendance/reports"     element={<AttendanceReportsPage />} />
                <Route path="/attendance/holidays"    element={<HolidaysPage />} />
                <Route path="/leave"      element={<LeavePage      />} />
                <Route path="/payroll"    element={<PayrollPage    />} />
                <Route path="/settings"   element={<SettingsPage   />} />
                <Route path="/"           element={<Navigate to="/dashboard" replace />} />
                <Route path="*"           element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  
  // ─── GLOBAL THEME INITIALIZATION ───
  // This runs once when the app boots up to ensure the saved theme is applied everywhere instantly!
  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme') || 'dark';
    const root = document.documentElement;

    if (savedTheme === 'auto') {
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', isSystemDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', savedTheme);
    }
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          gutter={10}
          toastOptions={{
            duration: 3500,
            style: {
              background: 'var(--bg-elevated)',
              color:      'var(--text-primary)',
              border:     '1px solid var(--border)',
              borderRadius: '10px',
              fontFamily: 'var(--font-body)',
              fontSize:   '0.875rem',
              boxShadow:  'var(--shadow-lg)',
            },
            success: { iconTheme: { primary: 'var(--green)', secondary: 'var(--bg-elevated)' } },
            error:   { iconTheme: { primary: 'var(--red)',   secondary: 'var(--bg-elevated)' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}