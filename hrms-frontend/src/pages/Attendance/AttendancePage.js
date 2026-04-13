// src/pages/Attendance/AttendancePage.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, LogIn, LogOut, Calendar, AlertTriangle,
  CheckCircle, XCircle, Minus, Filter, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { attendanceAPI } from '../../api/services';
import { Badge, SkeletonCard, SkeletonTable, Modal, InlineSpinner } from '../../components/common';
import { useAuth } from '../../context/AuthContext';

/* ── Clock Widget ── */
function ClockWidget({ today, onCheckIn, onCheckOut, loading }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const checkedIn  = today?.checkedIn || today?.checkInTime;
  const checkedOut = today?.checkOutTime || today?.checkedOut;
  const hoursWorked = today?.hoursWorked;

  return (
    <div className="card" style={{
      background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-elevated) 100%)',
      borderColor: 'var(--gold)',
      boxShadow: 'var(--shadow-gold)',
    }}>
      {/* Live clock */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '2.8rem', fontWeight: 700,
          color: 'var(--text-primary)', letterSpacing: '0.05em',
          textShadow: '0 0 30px rgba(240,180,41,0.3)',
        }}>
          {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
          {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {/* Status row */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
        {[
          { label: 'Check In',     value: today?.checkInTime || today?.checkedInAt  || '—', color: 'var(--green)'  },
          { label: 'Check Out',    value: today?.checkOutTime || today?.checkedOutAt || '—', color: 'var(--red)'   },
          { label: 'Hours',        value: hoursWorked ? `${hoursWorked}h` : '—',             color: 'var(--blue)'  },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            flex: 1, textAlign: 'center', padding: '12px 8px',
            background: 'var(--bg-base)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn btn-success w-full"
          style={{ justifyContent: 'center', flex: 1 }}
          onClick={onCheckIn}
          disabled={loading || !!checkedIn}
        >
          {loading ? <InlineSpinner /> : <><LogIn size={16} /> Check In</>}
        </button>
        <button
          className="btn btn-danger w-full"
          style={{ justifyContent: 'center', flex: 1 }}
          onClick={onCheckOut}
          disabled={loading || !checkedIn || !!checkedOut}
        >
          {loading ? <InlineSpinner /> : <><LogOut size={16} /> Check Out</>}
        </button>
      </div>

      {checkedIn && !checkedOut && (
        <div style={{
          marginTop: 12, padding: '8px 12px', background: 'var(--green-dim)',
          borderRadius: 'var(--radius-md)', textAlign: 'center',
          fontSize: '0.8rem', color: 'var(--green)',
        }}>
          ✓ Currently checked in since {today?.checkInTime || today?.checkedInAt || '—'}
        </div>
      )}
    </div>
  );
}

/* ── Calendar View ── */
function AttendanceCalendar({ data }) {
  const [month, setMonth] = useState(new Date());

  const year   = month.getFullYear();
  const mon    = month.getMonth();
  const first  = new Date(year, mon, 1).getDay();
  const days   = new Date(year, mon + 1, 0).getDate();

  const STATUS_COLORS = {
    Present:  'var(--green)',
    Absent:   'var(--red)',
    Leave:    'var(--amber)',
    Holiday:  'var(--purple)',
    Weekend:  'var(--text-muted)',
    Late:     'var(--gold)',
  };

  const getDay = (d) => data?.find(r => {
    const rd = new Date(r.date || r.attendanceDate);
    return rd.getDate() === d && rd.getMonth() === mon && rd.getFullYear() === year;
  });

  const prevMonth = () => setMonth(new Date(year, mon - 1, 1));
  const nextMonth = () => setMonth(new Date(year, mon + 1, 1));

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Attendance Calendar</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={prevMonth}>&lt;</button>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, padding: '0 8px', lineHeight: '30px' }}>
            {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={nextMonth}>&gt;</button>
        </div>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 8 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const d    = i + 1;
          const rec  = getDay(d);
          const status = rec?.status || rec?.attendanceStatus;
          const color  = STATUS_COLORS[status] || 'transparent';
          const isToday = new Date().getDate() === d && new Date().getMonth() === mon && new Date().getFullYear() === year;
          return (
            <div key={d} style={{
              aspectRatio: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              background: isToday ? 'var(--gold-glow)' : rec ? `${color}18` : 'transparent',
              border: isToday ? '1px solid var(--gold)' : '1px solid transparent',
              cursor: rec ? 'pointer' : 'default',
            }}
              title={status || ''}
            >
              <span style={{
                fontSize: '0.8rem', fontWeight: isToday ? 700 : 400,
                color: isToday ? 'var(--gold)' : 'var(--text-secondary)',
              }}>{d}</span>
              {status && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, marginTop: 2 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        {Object.entries(STATUS_COLORS).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: v }} />
            {k}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Corrections/Requests ── */
function CorrectionModal({ open, onClose, attendanceId, onSubmit, loading }) {
  const [form, setForm] = useState({ reason: '', requestedCheckIn: '', requestedCheckOut: '' });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submit Correction Request"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSubmit(form)} disabled={loading}>
            {loading ? <InlineSpinner /> : 'Submit'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label required">Reason</label>
        <textarea className="form-textarea" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Explain the correction needed..." />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Requested Check-In</label>
          <input className="form-input" type="time" value={form.requestedCheckIn} onChange={e => setForm(f => ({ ...f, requestedCheckIn: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Requested Check-Out</label>
          <input className="form-input" type="time" value={form.requestedCheckOut} onChange={e => setForm(f => ({ ...f, requestedCheckOut: e.target.value }))} />
        </div>
      </div>
    </Modal>
  );
}

/* ── Main ── */
export default function AttendancePage() {
  const { user }  = useAuth();
  const isManager = ['Manager','HR','Admin'].includes(user?.role);
  const [tab, setTab]         = useState('today');
  const [today, setToday]     = useState(null);
  const [kpis, setKpis]       = useState(null);
  const [records, setRecords] = useState([]);
  const [calData, setCalData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [loadToday, setLoadToday] = useState(true);
  const [loadRecords, setLoadRecords] = useState(true);
  const [clockLoading, setClockLoading] = useState(false);
  const [corrModal, setCorrModal] = useState(null);
  const [corrLoading, setCorrLoading] = useState(false);

  const loadAll = useCallback(() => {
    const unwrap = (res) => { const o = res?.data; return (o && 'data' in o) ? o.data : o; };
    const toArr  = (res, keys) => { const p = unwrap(res); if (Array.isArray(p)) return p; for (const k of keys) if (Array.isArray(p?.[k])) return p[k]; return []; };

    attendanceAPI.getTodayStatus().then((res) => { setToday(unwrap(res));    setLoadToday(false); }).catch(() => setLoadToday(false));
    attendanceAPI.getDashboardKPIs().then((res) => setKpis(unwrap(res))).catch(() => {});
    attendanceAPI.getCalendarMe().then((res) => setCalData(toArr(res, ['records','attendances']))).catch(() => {});
    attendanceAPI.getSummaryMe().then((res) => setSummary(unwrap(res))).catch(() => {});

    if (isManager) {
      attendanceAPI.list({ limit: 20 }).then((res) => {
        setRecords(toArr(res, ['records','attendances','data']));
        setLoadRecords(false);
      }).catch(() => setLoadRecords(false));
      attendanceAPI.listCorrections().then((res) => setCorrections(toArr(res, ['corrections','data']))).catch(() => {});
    } else {
      setLoadRecords(false);
    }
  }, [isManager]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleCheckIn = async () => {
    setClockLoading(true);
    try {
      await attendanceAPI.checkIn({});
      toast.success('Checked in successfully! ✓');
      attendanceAPI.getTodayStatus().then(({ data }) => setToday(data));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Check-in failed');
    } finally { setClockLoading(false); }
  };

  const handleCheckOut = async () => {
    setClockLoading(true);
    try {
      await attendanceAPI.checkOut({});
      toast.success('Checked out successfully!');
      attendanceAPI.getTodayStatus().then(({ data }) => setToday(data));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Check-out failed');
    } finally { setClockLoading(false); }
  };

  const handleCorrection = async (form) => {
    if (!corrModal) return;
    setCorrLoading(true);
    try {
      await attendanceAPI.submitCorrection(corrModal, form);
      toast.success('Correction request submitted');
      setCorrModal(null);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    } finally { setCorrLoading(false); }
  };

  const TABS = [
    { id: 'today',    label: 'Today'       },
    { id: 'calendar', label: 'Calendar'    },
    { id: 'summary',  label: 'Summary'     },
    ...(isManager ? [
      { id: 'records',    label: 'All Records' },
      { id: 'corrections', label: `Corrections${corrections.length ? ` (${corrections.length})` : ''}` },
    ] : []),
  ];

  return (
    <>
      <div className="page-header">
        <h1>Attendance & Time</h1>
        <p>Track your work hours, view records, and manage corrections</p>
      </div>

      <div className="tabs">
        {TABS.map(({ id, label }) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Today Tab ── */}
      {tab === 'today' && (
        <div className="grid-2-1">
          <div>
            {loadToday ? <SkeletonCard /> : (
              <ClockWidget today={today} onCheckIn={handleCheckIn} onCheckOut={handleCheckOut} loading={clockLoading} />
            )}

            {/* KPIs */}
            {kpis && (
              <div className="grid-3" style={{ marginTop: 20 }}>
                {[
                  { label: 'This Month',    value: kpis.presentDays    ?? kpis.daysPresent  ?? '—', sub: 'days present' },
                  { label: 'Late Arrivals', value: kpis.lateDays       ?? kpis.lateCount    ?? '—', sub: 'this month'   },
                  { label: 'Avg Hours',     value: kpis.avgHoursPerDay ?? kpis.avgHours     ? `${kpis.avgHoursPerDay || kpis.avgHours}h` : '—', sub: 'per day' },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="card" style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--gold)' }}>{value}</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)', marginTop: 4 }}>{label}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent records sidebar */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Recent Records</div>
            </div>
            {calData.slice(0, 8).map((r, i) => {
              const d = r.date || r.attendanceDate;
              const status = r.status || r.attendanceStatus || 'Present';
              const COLOR = { Present: 'var(--green)', Absent: 'var(--red)', Late: 'var(--gold)', Leave: 'var(--amber)' };
              return (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '9px 0', borderBottom: '1px solid var(--border-light)',
                }}>
                  <div style={{ fontSize: '0.85rem' }}>{d ? new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {r.checkInTime && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{r.checkInTime}</span>}
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: COLOR[status] || 'var(--text-secondary)' }}>{status}</span>
                  </div>
                </div>
              );
            })}
            {calData.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.85rem' }}>No records</div>
            )}
          </div>
        </div>
      )}

      {/* ── Calendar Tab ── */}
      {tab === 'calendar' && (
        <AttendanceCalendar data={calData} />
      )}

      {/* ── Summary Tab ── */}
      {tab === 'summary' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header"><div className="card-title">Monthly Summary</div></div>
            {summary ? (
              [
                { label: 'Days Present',   value: summary.presentDays ?? summary.daysPresent  ?? '—' },
                { label: 'Days Absent',    value: summary.absentDays  ?? summary.daysAbsent   ?? '—' },
                { label: 'Days on Leave',  value: summary.leaveDays   ?? summary.daysOnLeave  ?? '—' },
                { label: 'Late Arrivals',  value: summary.lateDays    ?? summary.lateCount    ?? '—' },
                { label: 'Total Hours',    value: summary.totalHours  ? `${summary.totalHours}h` : '—' },
                { label: 'Overtime Hours', value: summary.overtimeHours ? `${summary.overtimeHours}h` : '—' },
                { label: 'Attendance Rate',value: summary.attendanceRate ? `${summary.attendanceRate}%` : '—' },
              ].map(({ label, value }) => (
                <div className="info-row" key={label}>
                  <span className="info-row-label">{label}</span>
                  <span className="info-row-value">{value}</span>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No summary data available</div>
            )}
          </div>
        </div>
      )}

      {/* ── All Records Tab (Manager) ── */}
      {tab === 'records' && isManager && (
        loadRecords ? <SkeletonTable /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Hours</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const empName = r.employeeName || `${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`.trim() || '—';
                  const date    = r.date || r.attendanceDate;
                  const status  = r.status || r.attendanceStatus || '—';
                  return (
                    <tr key={r.id || i}>
                      <td style={{ fontWeight: 500 }}>{empName}</td>
                      <td>{date ? new Date(date).toLocaleDateString() : '—'}</td>
                      <td>{r.checkInTime  || r.checkedInAt  || '—'}</td>
                      <td>{r.checkOutTime || r.checkedOutAt || '—'}</td>
                      <td>{r.hoursWorked  ? `${r.hoursWorked}h` : '—'}</td>
                      <td><Badge status={status}>{status}</Badge></td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => setCorrModal(r.id || r.attendanceId)}>
                          <AlertTriangle size={13} /> Correction
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Corrections Tab (Manager) ── */}
      {tab === 'corrections' && isManager && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Date</th><th>Reason</th><th>Requested Time</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {corrections.map((c, i) => (
                <tr key={c.id || i}>
                  <td>{c.employeeName || '—'}</td>
                  <td>{c.attendanceDate ? new Date(c.attendanceDate).toLocaleDateString() : '—'}</td>
                  <td style={{ maxWidth: 200 }}><span className="truncate">{c.reason || '—'}</span></td>
                  <td>{c.requestedCheckIn || '—'} → {c.requestedCheckOut || '—'}</td>
                  <td><Badge status={c.status || 'Pending'}>{c.status || 'Pending'}</Badge></td>
                  <td>
                    {(!c.status || c.status === 'Pending') && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-success btn-sm" onClick={async () => {
                          try {
                            await attendanceAPI.reviewCorrection(c.id, { action: 'approve' });
                            toast.success('Approved'); loadAll();
                          } catch { toast.error('Failed'); }
                        }}>Approve</button>
                        <button className="btn btn-danger btn-sm" onClick={async () => {
                          try {
                            await attendanceAPI.reviewCorrection(c.id, { action: 'reject' });
                            toast.success('Rejected'); loadAll();
                          } catch { toast.error('Failed'); }
                        }}>Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {corrections.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No correction requests</div>
          )}
        </div>
      )}

      {/* Correction Modal */}
      <CorrectionModal
        open={!!corrModal}
        onClose={() => setCorrModal(null)}
        attendanceId={corrModal}
        onSubmit={handleCorrection}
        loading={corrLoading}
      />
    </>
  );
}