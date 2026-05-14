// src/pages/Dashboard/DashboardPage.js
import React, { useState, useEffect } from 'react';
import {
  UserCheck, Timer, Calendar, DollarSign,
  TrendingUp, TrendingDown, Users, Bell
} from 'lucide-react';
import { attendanceAPI, leaveAPI, payrollAPI, employeeAPI } from '../../api/services';
import { SkeletonCard, Badge } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function KpiCard({ icon: Icon, color, label, value, trendLabel, loading }) {
  if (loading) return <SkeletonCard />;
  return (
    <div className="stat-card" style={{ cursor: 'default' }}>
      <div className="stat-card-accent" style={{ background: color }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="stat-card-icon" style={{ background: `${color}22`, marginBottom: 0 }}>
          <Icon size={20} style={{ color }} />
        </div>
      </div>
      <div className="stat-card-value">{value ?? '—'}</div>
      <div className="stat-card-label">{label}</div>
      {trendLabel && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{trendLabel}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [kpis,     setKpis]     = useState(null);
  const [today,    setToday]    = useState(null);
  const [balances, setBalances] = useState([]);   // always an array
  const [payDash,  setPayDash]  = useState(null);
  const [activity, setActivity] = useState([]);   // always an array
  const [loading,  setLoading]  = useState(true);

  // ─── MANAGER STATE ───
  const isManager = ['Manager', 'Supervisor', 'Professor', 'Head of Department', 'HR', 'Admin'].includes(user?.role || user?.Role);
  const [managerInbox, setManagerInbox] = useState(null);
  const [teamAttendance, setTeamAttendance] = useState([]);

  useEffect(() => {
    // 1. Fetch personal dashboard data
    Promise.allSettled([
      attendanceAPI.getDashboardKPIs(),
      attendanceAPI.getTodayStatus(),
      leaveAPI.getMyBalances(),
      payrollAPI.getDashboard().catch(() => null),
      attendanceAPI.getRecentActivity(),
    ]).then(([k, t, b, p, a]) => {
      
      // Robust Data Extraction: Check for nested .data objects from backend wrappers
      if (k.status === 'fulfilled') setKpis(k.value?.data?.data || k.value?.data);
      if (t.status === 'fulfilled') setToday(t.value?.data?.data || t.value?.data);
      
      if (b.status === 'fulfilled') {
        const d = b.value?.data?.data || b.value?.data;
        setBalances(Array.isArray(d) ? d : d?.balances || d?.leaveBalances || []);
      }
      
      if (p.status === 'fulfilled' && p.value) setPayDash(p.value?.data?.data || p.value?.data);
      
      if (a.status === 'fulfilled') {
        const d = a.value?.data?.data || a.value?.data;
        setActivity(Array.isArray(d) ? d : d?.activities || d?.records || []);
      }
      
      setLoading(false);
    });

    // 2. Fetch manager-specific data if applicable
    if (isManager) {
      if (employeeAPI.getManagerDashboardInbox) {
        employeeAPI.getManagerDashboardInbox()
          .then(res => setManagerInbox(res.data?.data || res.data || null))
          .catch(err => console.log('Manager Inbox fetch error:', err));
      }

      if (employeeAPI.getTeamAttendanceToday) {
        employeeAPI.getTeamAttendanceToday()
          .then(res => {
            const d = res.data?.data || res.data;
            setTeamAttendance(Array.isArray(d) ? d : []);
          })
          .catch(err => console.log('Team Attendance fetch error:', err));
      }
    }
  }, [isManager]);

  const displayName = user
    ? (user.firstName ? user.firstName : (user.name?.split(' ')[0] || 'there'))
    : 'there';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Safely map leave chart data
  const leaveChartData = balances.slice(0, 6).map(b => ({
    name: b.leaveTypeName || b.LeaveType?.LeaveTypeName || b.name || b.type || 'Leave',
    used: b.usedDays      ?? b.UsedDays      ?? b.used      ?? 0,
    left: b.remainingDays ?? b.RemainingDays ?? b.remaining ?? 0,
  }));

  const COLORS = ['var(--gold)','var(--blue)','var(--green)','var(--red)','var(--purple)','var(--cyan)'];

  return (
    <>
      <div className="page-header">
        <h1>{greeting}, {displayName} 👋</h1>
        <p>
          Here's what's happening today —{' '}
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid-4" style={{ marginBottom: 28 }}>
        <KpiCard loading={loading} icon={UserCheck} color="var(--blue)"
          label="Today's Status"
          value={today?.currentStatus || today?.Status || '—'} />
        
        <KpiCard loading={loading} icon={Timer} color="var(--green)"
          label="On-Time Rate"
          value={kpis?.onTimeRate != null ? `${Number(kpis.onTimeRate).toFixed(0)}%` : '—'}
          trendLabel="This month" />
        
        <KpiCard loading={loading} icon={Calendar} color="var(--amber)"
          label="Leave Balance"
          value={balances.length > 0 ? `${balances[0]?.remainingDays ?? balances[0]?.RemainingDays ?? '—'} days` : '—'}
          trendLabel={balances[0]?.leaveTypeName || balances[0]?.LeaveType?.LeaveTypeName || ''} />
        
        <KpiCard loading={loading} icon={DollarSign} color="var(--purple)"
          label="Days to Payroll"
          value={kpis?.daysToPayroll != null ? `${kpis.daysToPayroll}` : '—'}
          trendLabel="Until next pay" />
      </div>

      {/* Charts Row (Personal Data) */}
      <div className="grid-2" style={{ marginBottom: 28 }}>
        {/* Leave Balances Chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">My Leave Balances</div>
              <div className="card-subtitle">Days remaining by type</div>
            </div>
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 200 }} />
          ) : leaveChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={leaveChartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="left" fill="var(--gold)"   radius={[4,4,0,0]} name="Remaining" />
                <Bar dataKey="used" fill="var(--border)" radius={[4,4,0,0]} name="Used" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No leave data available
            </div>
          )}
        </div>

        {/* Today's Attendance */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">My Attendance Today</div>
              <div className="card-subtitle">Your check-in status</div>
            </div>
            {today && (
              <span className={`badge ${today.currentStatus === 'Clocked In' ? 'badge-approved' : today.currentStatus === 'Clocked Out' ? 'badge-info' : 'badge-pending'}`}>
                {today.currentStatus || today.Status || 'Not Clocked In'}
              </span>
            )}
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : today ? (
            [
              { label: 'Status',        value: today.currentStatus || today.Status },
              { label: 'Check-In',      value: today.checkInTime || today.CheckInTime  ? new Date(today.checkInTime || today.CheckInTime).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})  : '—' },
              { label: 'Check-Out',     value: today.checkOutTime || today.CheckOutTime ? new Date(today.checkOutTime || today.CheckOutTime).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) : '—' },
              { label: 'Hours Worked',  value: (today.workedHours || today.WorkedHours) && Number(today.workedHours || today.WorkedHours) > 0 ? `${Number(today.workedHours || today.WorkedHours).toFixed(1)}h` : '—' },
              { label: 'Shift',         value: today.todayShift?.shiftName || today.Shift?.ShiftName || '—' },
              { label: 'Shift Hours',   value: today.todayShift || today.Shift ? `${today.todayShift?.startTime || today.Shift?.StartTime} – ${today.todayShift?.endTime || today.Shift?.EndTime}` : '—' },
            ].map(({ label, value }) => (
              <div className="info-row" key={label}>
                <span className="info-row-label">{label}</span>
                <span className="info-row-value">{value || '—'}</span>
              </div>
            ))
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: 30 }}>
              No attendance data for today
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">My Recent Activity</div>
        </div>
        {loading ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : activity.length > 0 ? (
          <div className="timeline" style={{ maxHeight: 300, overflowY: 'auto' }}>
            {activity.slice(0, 8).map((item, i) => {
              const getTitle = (item) => {
                if (item.description) return item.description;
                if (item.action)      return item.action;
                if (item.message)     return item.message;

                if (item.AttendanceDate || item.attendanceDate || item.CheckInTime) {
                  const status   = item.Status        || item.status        || 'Present';
                  const checkIn  = item.CheckInTime   || item.checkInTime;
                  const checkOut = item.CheckOutTime  || item.checkOutTime;
                  const hours    = item.WorkedHours   || item.workedHours   || item.hoursWorked;
                  const shift    = item.Shift?.ShiftName || item.shift?.shiftName || item.shiftName;

                  let title = `Attendance marked as ${status}`;
                  if (checkIn) {
                    const t = new Date(checkIn);
                    if (!isNaN(t)) title += ` · Check-in ${t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
                  }
                  if (checkOut) {
                    const t = new Date(checkOut);
                    if (!isNaN(t)) title += ` · Check-out ${t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
                  }
                  if (hours && Number(hours) > 0) title += ` · ${Number(hours).toFixed(1)}h worked`;
                  if (shift) title += ` (${shift})`;
                  return title;
                }

                if (item.LeaveTypeName || item.leaveTypeName || item.StartDate) {
                  const type   = item.LeaveTypeName || item.leaveTypeName || 'Leave';
                  const status = item.Status        || item.status        || '';
                  return `${type} request ${status}`.trim();
                }

                const readable = Object.values(item).find(v => typeof v === 'string' && v.length > 2 && v.length < 120);
                return readable || 'Activity recorded';
              };

              const getTime = (item) => {
                const raw = item.createdAt || item.CreatedAt || item.AttendanceDate || item.attendanceDate || item.time;
                if (!raw) return '';
                const d = new Date(raw);
                return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              };

              return (
                <div className="timeline-item" key={i}>
                  <div className="timeline-dot" style={{ background: COLORS[i % COLORS.length] }} />
                  <div className="timeline-line" />
                  <div className="timeline-content">
                    <div className="timeline-title">{getTitle(item)}</div>
                    <div className="timeline-meta">
                      {item.employeeName && `${item.employeeName} · `}
                      {getTime(item)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: 30 }}>
            No recent activity
          </div>
        )}
      </div>
    </>
  );
}