// src/pages/Leave/LeavePage.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays, Plus, Check, X, Clock, AlertCircle,
  ChevronDown, Send, Inbox, BarChart2, Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { leaveAPI } from '../../api/services';
import { Modal, Badge, SkeletonCard, EmptyState, InlineSpinner, StatCard } from '../../components/common';
import { useAuth } from '../../context/AuthContext';

/* ── Leave Balance Card ── */
function BalanceCard({ balance, loading }) {
  if (loading) return <SkeletonCard />;
  const name      = balance.leaveTypeName || balance.name || balance.type || 'Leave';
  const used      = balance.usedDays      ?? balance.used      ?? 0;
  const remaining = balance.remainingDays ?? balance.remaining ?? 0;
  const total     = balance.totalDays     ?? balance.total     ?? (used + remaining);
  const pct       = total > 0 ? Math.round((remaining / total) * 100) : 0;
  const COLOR_MAP  = { Annual: 'var(--blue)', Sick: 'var(--green)', Emergency: 'var(--red)', Sabbatical: 'var(--purple)' };
  const color      = Object.entries(COLOR_MAP).find(([k]) => name.includes(k))?.[1] || 'var(--gold)';

  return (
    <div className="stat-card">
      <div className="stat-card-accent" style={{ background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{name}</div>
        </div>
        <CalendarDays size={18} style={{ color }} />
      </div>
      <div className="stat-card-value" style={{ color }}>{remaining}</div>
      <div className="stat-card-label">days remaining of {total}</div>
      <div className="stat-card-progress" style={{ marginTop: 12 }}>
        <div className="stat-card-progress-bar" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="stat-card-meta">
        <span>{used} used</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

/* ── Request Row ── */
function RequestRow({ req, onAction, isManager }) {
  const [acting, setActing] = useState('');
  const name    = req.leaveTypeName || req.leaveType?.name || req.type || '—';
  const from    = req.startDate   ? new Date(req.startDate).toLocaleDateString()   : '—';
  const to      = req.endDate     ? new Date(req.endDate).toLocaleDateString()     : '—';
  const days    = req.numberOfDays ?? req.days ?? '—';
  const status  = req.status || 'Pending';

  const act = async (action) => {
    setActing(action);
    try { await onAction(req.id || req.leaveRequestId, action); }
    finally { setActing(''); }
  };

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 500 }}>{name}</div>
        {req.reason && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>{req.reason}</div>}
      </td>
      {isManager && (
        <td>
          <div style={{ fontWeight: 500 }}>
            {req.employeeName || `${req.employee?.firstName || ''} ${req.employee?.lastName || ''}`.trim() || '—'}
          </div>
        </td>
      )}
      <td>{from} → {to}</td>
      <td>{days} {days !== '—' ? 'days' : ''}</td>
      <td><Badge status={status}>{status}</Badge></td>
      <td>
        <div style={{ display: 'flex', gap: 6 }}>
          {isManager && status === 'Pending' && (
            <>
              <button className="btn btn-success btn-sm" onClick={() => act('approve')} disabled={!!acting}>
                {acting === 'approve' ? <InlineSpinner /> : <><Check size={13} /> Approve</>}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => act('reject')} disabled={!!acting}>
                {acting === 'reject' ? <InlineSpinner /> : <><X size={13} /> Reject</>}
              </button>
            </>
          )}
          {!isManager && status === 'Pending' && (
            <button className="btn btn-ghost btn-sm" onClick={() => act('cancel')} disabled={!!acting}>
              {acting === 'cancel' ? <InlineSpinner /> : 'Cancel'}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ── Submit Form ── */
function SubmitLeaveForm({ leaveTypes, onSubmit, loading }) {
  const [form, setForm]     = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
  const [errors, setErrors] = useState({});
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.leaveTypeId) e.leaveTypeId = 'Select a leave type';
    if (!form.startDate)   e.startDate   = 'Required';
    if (!form.endDate)     e.endDate     = 'Required';
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      e.endDate = 'End date must be after start date';
    return e;
  };

  const handle = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSubmit(form);
  };

  // auto compute days
  const days = form.startDate && form.endDate
    ? Math.max(0, Math.round((new Date(form.endDate) - new Date(form.startDate)) / 86400000) + 1)
    : 0;

  return (
    <>
      <div className="form-group">
        <label className="form-label required">Leave Type</label>
        <select className="form-select" value={form.leaveTypeId} onChange={e => set('leaveTypeId', e.target.value)}>
          <option value="">Select type...</option>
          {leaveTypes.map(t => <option key={t.id || t.leaveTypeId} value={t.id || t.leaveTypeId}>{t.name}</option>)}
        </select>
        {errors.leaveTypeId && <div className="form-error">{errors.leaveTypeId}</div>}
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label required">Start Date</label>
          <input className="form-input" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          {errors.startDate && <div className="form-error">{errors.startDate}</div>}
        </div>
        <div className="form-group">
          <label className="form-label required">End Date</label>
          <input className="form-input" type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
          {errors.endDate && <div className="form-error">{errors.endDate}</div>}
        </div>
      </div>
      {days > 0 && (
        <div style={{
          padding: '10px 14px', background: 'var(--gold-glow)', border: '1px solid rgba(240,180,41,0.2)',
          borderRadius: 'var(--radius-md)', marginBottom: 14, fontSize: '0.85rem', color: 'var(--gold-text)',
        }}>
          📅 This request covers <strong>{days} working day{days !== 1 ? 's' : ''}</strong>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Reason</label>
        <textarea
          className="form-textarea"
          value={form.reason}
          onChange={e => set('reason', e.target.value)}
          placeholder="Optional: Describe your reason for leave..."
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button className="btn btn-primary" onClick={handle} disabled={loading}>
          {loading ? <InlineSpinner /> : <><Send size={15} /> Submit Request</>}
        </button>
      </div>
    </>
  );
}

/* ── Main Page ── */
export default function LeavePage() {
  const { user }      = useAuth();
  const isManager     = ['Manager','HR','Admin'].includes(user?.role);

  const [tab, setTab]           = useState('dashboard');
  const [balances, setBalances] = useState([]);
  const [myRequests, setMyReqs] = useState([]);
  const [inbox, setInbox]       = useState([]);
  const [allRequests, setAll]   = useState([]);
  const [leaveTypes, setTypes]  = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loadBal, setLoadBal]   = useState(true);
  const [loadReq, setLoadReq]   = useState(true);
  const [loadInbox, setLoadInbox] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const loadData = useCallback(() => {
    leaveAPI.getMyBalances().then((res) => {
      const payload = res.data?.data || res.data;
      setBalances(Array.isArray(payload) ? payload : payload?.balances || payload?.leaveBalances || []);
      setLoadBal(false);
    }).catch(() => setLoadBal(false));

    leaveAPI.getMyRequests({ status: statusFilter || undefined }).then((res) => {
      const payload = res.data?.data || res.data;
      setMyReqs(Array.isArray(payload) ? payload : payload?.requests || payload?.leaveRequests || []);
      setLoadReq(false);
    }).catch(() => setLoadReq(false));

    leaveAPI.getTypes().then((res) => {
      const payload = res.data?.data || res.data;
      setTypes(Array.isArray(payload) ? payload : payload?.types || payload?.leaveTypes || []);
    }).catch(() => {});

    leaveAPI.getHolidays().then((res) => {
      const payload = res.data?.data || res.data;
      setHolidays(Array.isArray(payload) ? payload : payload?.holidays || []);
    }).catch(() => {});

    if (isManager) {
      leaveAPI.getManagerInbox().then((res) => {
        const payload = res.data?.data || res.data;
        setInbox(Array.isArray(payload) ? payload : payload?.requests || payload?.leaveRequests || []);
        setLoadInbox(false);
      }).catch(() => setLoadInbox(false));

      leaveAPI.listAll().then((res) => {
        const payload = res.data?.data || res.data;
        setAll(Array.isArray(payload) ? payload : payload?.requests || payload?.leaveRequests || []);
      }).catch(() => {});
    }
  }, [isManager, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSubmit = async (form) => {
    setSubmitting(true);
    try {
      await leaveAPI.submit(form);
      toast.success('Leave request submitted!');
      loadData();
      setTab('history');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to submit request');
    } finally { setSubmitting(false); }
  };

  const handleAction = async (id, action) => {
    try {
      if (action === 'cancel') {
        await leaveAPI.cancel(id, {});
        toast.success('Request cancelled');
      } else {
        await leaveAPI.approveReject(id, { action, comment: '' });
        toast.success(`Request ${action === 'approve' ? 'approved' : 'rejected'}`);
      }
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Action failed');
    }
  };

  const TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
    { id: 'request',   label: 'Request Leave', icon: Plus },
    { id: 'history',   label: 'My History', icon: Clock },
    ...(isManager ? [
      { id: 'inbox',   label: `Inbox${inbox.length ? ` (${inbox.length})` : ''}`, icon: Inbox },
      { id: 'all',     label: 'All Requests', icon: Calendar },
    ] : []),
  ];

  const filteredMyReqs = statusFilter
    ? myRequests.filter(r => (r.status || '').toLowerCase() === statusFilter.toLowerCase())
    : myRequests;

  return (
    <>
      <div className="page-header">
        <h1>Leave Management</h1>
        <p>Manage leave requests, balances, and approvals</p>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`tab-btn ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Dashboard Tab ── */}
      {tab === 'dashboard' && (
        <>
          <div className="grid-4" style={{ marginBottom: 28 }}>
            {loadBal
              ? [1,2,3,4].map(i => <SkeletonCard key={i} />)
              : balances.length > 0
                ? balances.slice(0,4).map((b, i) => <BalanceCard key={i} balance={b} loading={false} />)
                : [1,2,3,4].map(i => (
                    <div key={i} className="stat-card" style={{ opacity: 0.5 }}>
                      <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No data</div>
                    </div>
                  ))
            }
          </div>

          <div className="grid-2">
            {/* Upcoming / pending */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Pending Requests</div>
                <span className="badge badge-pending">{myRequests.filter(r => r.status === 'Pending').length}</span>
              </div>
              {myRequests.filter(r => r.status === 'Pending').length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No pending requests
                </div>
              ) : (
                myRequests.filter(r => r.status === 'Pending').map((req, i) => {
                  const name = req.leaveTypeName || req.leaveType?.name || '—';
                  const days = req.numberOfDays ?? req.days ?? '—';
                  const from = req.startDate ? new Date(req.startDate).toLocaleDateString() : '—';
                  const to   = req.endDate   ? new Date(req.endDate).toLocaleDateString()   : '—';
                  return (
                    <div key={i} style={{
                      padding: '12px 0', borderBottom: '1px solid var(--border-light)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{from} — {to}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600 }}>{days} days</div>
                        <Badge status="Pending">Pending</Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Holidays */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Upcoming Holidays</div>
              </div>
              {holidays.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No holidays scheduled
                </div>
              ) : (
                holidays.slice(0, 6).map((h, i) => (
                  <div key={i} style={{
                    padding: '10px 0', borderBottom: '1px solid var(--border-light)',
                    display: 'flex', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{h.name || h.holidayName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{h.type || 'Public Holiday'}</div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 600 }}>
                      {h.date ? new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Request Leave Tab ── */}
      {tab === 'request' && (
        <div style={{ maxWidth: 600 }}>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Submit Leave Request</div>
                <div className="card-subtitle">Fill in the details below to request time off</div>
              </div>
            </div>
            <SubmitLeaveForm leaveTypes={leaveTypes} onSubmit={handleSubmit} loading={submitting} />
          </div>
        </div>
      )}

      {/* ── My History Tab ── */}
      {tab === 'history' && (
        <>
          <div className="filter-bar">
            {['', 'Pending', 'Approved', 'Rejected', 'Cancelled'].map(s => (
              <button
                key={s}
                className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s || 'All'}
              </button>
            ))}
          </div>

          {loadReq ? (
            <SkeletonCard />
          ) : filteredMyReqs.length === 0 ? (
            <div className="card">
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                No leave requests found
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type & Reason</th>
                    <th>Period</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMyReqs.map((req, i) => (
                    <RequestRow key={req.id || req.leaveRequestId || i} req={req} onAction={handleAction} isManager={false} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Manager Inbox Tab ── */}
      {tab === 'inbox' && isManager && (
        <>
          {loadInbox ? (
            <SkeletonCard />
          ) : inbox.length === 0 ? (
            <div className="card">
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
                All caught up! No pending approvals.
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Leave Type</th>
                    <th>Employee</th>
                    <th>Period</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inbox.map((req, i) => (
                    <RequestRow key={req.id || i} req={req} onAction={handleAction} isManager={true} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── All Requests Tab (HR/Admin) ── */}
      {tab === 'all' && isManager && (
        <>
          <div className="filter-bar">
            {['', 'Pending', 'Approved', 'Rejected'].map(s => (
              <button
                key={s}
                className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Employee</th>
                  <th>Period</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(statusFilter ? allRequests.filter(r => r.status === statusFilter) : allRequests).map((req, i) => (
                  <RequestRow key={req.id || i} req={req} onAction={handleAction} isManager={true} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}