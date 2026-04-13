// src/pages/Dashboard/DashboardPage.js
import React, { useState, useEffect } from 'react';
import {
  UserCheck, Timer, Calendar, DollarSign,
  TrendingUp, TrendingDown,
} from 'lucide-react';
import { attendanceAPI, leaveAPI, payrollAPI } from '../../api/services';
import { unwrap, safeArray } from '../../api/services';
import { SkeletonCard } from '../../components/common';
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

  useEffect(() => {
    Promise.allSettled([
      attendanceAPI.getDashboardKPIs(),
      attendanceAPI.getTodayStatus(),
      leaveAPI.getMyBalances(),
      payrollAPI.getDashboard().catch(() => null),
      attendanceAPI.getRecentActivity(),
    ]).then(([k, t, b, p, a]) => {
      if (k.status === 'fulfilled') {
        const d = unwrap(k.value);
        setKpis(d);
      }
      if (t.status === 'fulfilled') {
        const d = unwrap(t.value);
        setToday(d);
      }
      if (b.status === 'fulfilled') {
        // balances may be at payload.balances or payload itself
        const arr = safeArray(b.value, ['balances', 'leaveBalances', 'data']);
        setBalances(arr);
      }
      if (p.status === 'fulfilled' && p.value) {
        setPayDash(unwrap(p.value));
      }
      if (a.status === 'fulfilled') {
        const arr = safeArray(a.value, ['activities', 'records', 'data']);
        setActivity(arr);
      }
      setLoading(false);
    });
  }, []);

  const displayName = user
    ? (user.firstName ? user.firstName : (user.name?.split(' ')[0] || 'there'))
    : 'there';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const leaveChartData = balances.slice(0, 6).map(b => ({
    name: b.leaveTypeName || b.name || b.type || 'Leave',
    used: b.usedDays      ?? b.used      ?? 0,
    left: b.remainingDays ?? b.remaining ?? 0,
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
        <KpiCard loading={loading} icon={UserCheck}   color="var(--blue)"   label="Today's Status"    value={today?.status || (today?.checkedIn ? 'Present' : '—')} />
        <KpiCard loading={loading} icon={Timer}        color="var(--green)"  label="Attendance Rate"   value={kpis?.attendanceRate ? `${kpis.attendanceRate}%` : kpis?.presentToday ?? '—'} trendLabel="This month" />
        <KpiCard loading={loading} icon={Calendar}     color="var(--amber)"  label="Leave Balance"     value={balances.length > 0 ? `${balances[0]?.remainingDays ?? balances[0]?.remaining ?? '—'} days` : '—'} trendLabel={balances[0]?.leaveTypeName || balances[0]?.name || ''} />
        <KpiCard loading={loading} icon={DollarSign}   color="var(--purple)" label="Payroll Runs"      value={payDash?.activeRuns ?? payDash?.totalRuns ?? '—'} trendLabel="Active runs" />
      </div>

      {/* Charts Row */}
      <div className="grid-2" style={{ marginBottom: 28 }}>
        {/* Leave Balances Chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Leave Balances</div>
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
              <div className="card-title">Today's Attendance</div>
              <div className="card-subtitle">Your check-in status</div>
            </div>
            {today && (
              <span className={`badge ${today.checkedIn || today.checkInTime ? 'badge-approved' : 'badge-pending'}`}>
                {today.checkedIn || today.checkInTime ? 'Checked In' : today.status || 'Not Checked In'}
              </span>
            )}
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : today ? (
            [
              { label: 'Check-In',     value: today.checkInTime  || today.checkedInAt  || '—' },
              { label: 'Check-Out',    value: today.checkOutTime || today.checkedOutAt || '—' },
              { label: 'Hours Worked', value: today.hoursWorked  ? `${today.hoursWorked}h` : '—' },
              { label: 'Status',       value: today.status       || (today.checkedIn ? 'Present' : 'Absent') },
              { label: 'Shift',        value: today.shiftName    || today.shift || '—' },
            ].map(({ label, value }) => (
              <div className="info-row" key={label}>
                <span className="info-row-label">{label}</span>
                <span className="info-row-value">{value}</span>
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
          <div className="card-title">Recent Activity</div>
        </div>
        {loading ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : activity.length > 0 ? (
          <div className="timeline" style={{ maxHeight: 300, overflowY: 'auto' }}>
            {activity.slice(0, 8).map((item, i) => (
              <div className="timeline-item" key={i}>
                <div className="timeline-dot" style={{ background: COLORS[i % COLORS.length] }} />
                <div className="timeline-line" />
                <div className="timeline-content">
                  <div className="timeline-title">
                    {item.description || item.action || item.message || item.type || JSON.stringify(item)}
                  </div>
                  <div className="timeline-meta">
                    {item.employeeName && `${item.employeeName} · `}
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : item.time || ''}
                  </div>
                </div>
              </div>
            ))}
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